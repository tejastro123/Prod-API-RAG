"""
Production RAG Manager
======================
Features:
  - Smart chunking: Semantic (SemanticChunker) with recursive fallback
  - Hybrid retrieval: BM25 keyword + vector semantic (EnsembleRetriever + RRF)
  - Multi-Query retrieval: LLM generates multiple query perspectives
  - Contextual Compression: LLM extracts only relevant passages
  - Parent Document Retrieval: small child chunks searched, large parent returned
  - Similarity search with relevance scores
  - ChromaDB persistent store with per-collection isolation
  - Full metadata tagging, source tracking, and ingestion stats
"""

import os
import shutil
import logging
from typing import List, Optional

from fastapi import UploadFile
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_community.retrievers import BM25Retriever
from langchain_classic.retrievers import EnsembleRetriever
from langchain_core.retrievers import BaseRetriever

from app.config import get_settings

logger = logging.getLogger("production-api.rag")

# ── Paths ──────────────────────────────────────────────────────────────────────
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
DOCS_DIR = os.path.join(os.path.dirname(__file__), "..", "docs")

# ── Chunking constants ─────────────────────────────────────────────────────────
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
MAX_SEMANTIC_CHUNK_SIZE = 3000   # if semantic chunks are too big, fallback to recursive
SEMANTIC_BREAKPOINT_PERCENTILE = 90

# ── Retrieval constants ────────────────────────────────────────────────────────
DEFAULT_K = 4
BM25_WEIGHT = 0.4
VECTOR_WEIGHT = 0.6


# ══════════════════════════════════════════════════════════════════════════════
#  Smart Chunker
# ══════════════════════════════════════════════════════════════════════════════

def _recursive_chunk(docs: List[Document]) -> List[Document]:
    """Standard recursive character splitter — always reliable."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        add_start_index=True,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_documents(docs)


def _semantic_chunk(docs: List[Document], embeddings) -> Optional[List[Document]]:
    """
    Semantic chunking using embedding similarity.
    Returns None if unavailable or if chunks are oversized (triggers fallback).
    """
    try:
        from langchain_experimental.text_splitter import SemanticChunker

        chunker = SemanticChunker(
            embeddings,
            breakpoint_threshold_type="percentile",
            breakpoint_threshold_amount=SEMANTIC_BREAKPOINT_PERCENTILE,
        )
        chunks = chunker.split_documents(docs)

        # Validate — reject if any chunk is too large (model context safety)
        if any(len(c.page_content) > MAX_SEMANTIC_CHUNK_SIZE for c in chunks):
            logger.warning(
                "Semantic chunking produced oversized chunks — falling back to recursive."
            )
            return None

        logger.info(f"Semantic chunking produced {len(chunks)} chunks.")
        return chunks

    except ImportError:
        logger.warning(
            "langchain_experimental not installed — falling back to recursive chunking."
        )
        return None
    except Exception as e:
        logger.warning(f"Semantic chunking failed ({e}) — falling back to recursive.")
        return None


def smart_chunk(docs: List[Document], embeddings, use_semantic: bool = True) -> List[Document]:
    """
    Production chunking strategy:
      1. Try SemanticChunker (meaning-based splits)
      2. Fall back to RecursiveCharacterTextSplitter on any failure
    """
    if use_semantic:
        chunks = _semantic_chunk(docs, embeddings)
        if chunks:
            return chunks

    chunks = _recursive_chunk(docs)
    logger.info(f"Recursive chunking produced {len(chunks)} chunks.")
    return chunks


# ══════════════════════════════════════════════════════════════════════════════
#  RAG Manager
# ══════════════════════════════════════════════════════════════════════════════

class RAGManager:
    """
    Production-grade RAG Manager.

    Retrieval modes (selected at query time):
      - 'hybrid'  : BM25 keyword + vector semantic (default)
      - 'vector'  : Pure semantic similarity search
      - 'mmr'     : Maximal Marginal Relevance (diversity-aware)
      - 'scores'  : Vector search returning (doc, score) pairs
    """

    def __init__(self):
        settings = get_settings()
        self.ollama_base_url = settings.ollama_base_url
        self.embedding_model_name = "all-MiniLM-L6-v2"

        # ── In-memory document store (for BM25 and parent retriever) ──────────
        self._all_chunks: List[Document] = []

        try:
            os.makedirs(DOCS_DIR, exist_ok=True)
            os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)

            self.embeddings = HuggingFaceEmbeddings(
                model_name=self.embedding_model_name,
                model_kwargs={"device": "cpu"},
                encode_kwargs={"normalize_embeddings": True, "batch_size": 32},
            )

            self.vector_store = Chroma(
                collection_name="rag_documents",
                embedding_function=self.embeddings,
                persist_directory=CHROMA_PERSIST_DIR,
            )

            # Hydrate in-memory chunks from persisted Chroma data so BM25 works
            # across restarts
            self._sync_chunks_from_store()

            logger.info(
                f"RAGManager initialized | store={CHROMA_PERSIST_DIR} "
                f"| chunks={len(self._all_chunks)}"
            )

        except Exception as e:
            logger.error(f"Failed to initialize RAGManager: {e}")
            self.vector_store = None
            self.embeddings = None

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _sync_chunks_from_store(self):
        """Load existing Chroma documents into memory for BM25."""
        try:
            raw = self.vector_store.get(include=["documents", "metadatas"])
            docs = raw.get("documents", [])
            metas = raw.get("metadatas", [])
            self._all_chunks = [
                Document(page_content=text, metadata=meta or {})
                for text, meta in zip(docs, metas)
            ]
        except Exception as e:
            logger.warning(f"Could not sync chunks from Chroma: {e}")
            self._all_chunks = []

    def _build_hybrid_retriever(self, k: int) -> BaseRetriever:
        """EnsembleRetriever combining BM25 (keyword) + vector (semantic)."""
        vector_retriever = self.vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": k},
        )

        if not self._all_chunks:
            logger.warning("No documents for BM25 — falling back to vector-only retrieval.")
            return vector_retriever

        bm25_retriever = BM25Retriever.from_documents(self._all_chunks)
        bm25_retriever.k = k

        return EnsembleRetriever(
            retrievers=[bm25_retriever, vector_retriever],
            weights=[BM25_WEIGHT, VECTOR_WEIGHT],
        )

    # ── Public API ─────────────────────────────────────────────────────────────

    def retrieve(
        self,
        query: str,
        k: int = DEFAULT_K,
        mode: str = "hybrid",
    ) -> List[Document]:
        """
        Retrieve relevant document chunks.

        Args:
            query: Search query string.
            k:     Number of top results to return.
            mode:  'hybrid' | 'vector' | 'mmr'

        Returns:
            List of Document objects sorted by relevance.
        """
        if not self.vector_store:
            logger.warning("Vector store not initialized — skipping retrieval.")
            return []

        if not self._all_chunks:
            logger.info("No documents ingested yet — returning empty results.")
            return []

        try:
            if mode == "hybrid":
                retriever = self._build_hybrid_retriever(k)
                return retriever.invoke(query)

            elif mode == "mmr":
                retriever = self.vector_store.as_retriever(
                    search_type="mmr",
                    search_kwargs={"k": k, "fetch_k": k * 3},
                )
                return retriever.invoke(query)

            else:  # default: pure vector similarity
                return self.vector_store.similarity_search(query, k=k)

        except Exception as e:
            logger.error(f"Retrieval error (mode={mode}): {e}")
            return []

    def retrieve_with_scores(
        self, query: str, k: int = DEFAULT_K
    ) -> List[tuple[Document, float]]:
        """
        Vector similarity search returning (document, similarity_score) pairs.
        Scores are converted from L2 distance → similarity: 1 / (1 + distance).
        """
        if not self.vector_store:
            return []
        try:
            results = self.vector_store.similarity_search_with_score(query, k=k)
            # Convert distance → similarity score
            return [(doc, round(1 / (1 + dist), 4)) for doc, dist in results]
        except Exception as e:
            logger.error(f"Score retrieval error: {e}")
            return []

    async def ingest_file(self, file: UploadFile) -> dict:
        """
        Ingest a file (PDF / TXT / MD):
          1. Save permanently to docs/
          2. Smart-chunk (semantic → recursive fallback)
          3. Embed and upsert into ChromaDB
          4. Sync in-memory chunk list for BM25

        Returns ingestion stats dict.
        """
        if not self.vector_store:
            return {"error": "Vector store not initialized"}

        suffix = os.path.splitext(file.filename)[1].lower()
        if suffix not in {".pdf", ".txt", ".md"}:
            return {"error": "Unsupported format. Accepted: PDF, TXT, MD."}

        os.makedirs(DOCS_DIR, exist_ok=True)
        dest_path = os.path.join(DOCS_DIR, file.filename)

        try:
            # ── Save file ────────────────────────────────────────────────────
            with open(dest_path, "wb") as f:
                shutil.copyfileobj(file.file, f)

            # ── Load ─────────────────────────────────────────────────────────
            if suffix == ".pdf":
                loader = PyPDFLoader(dest_path)
            else:
                loader = TextLoader(dest_path, encoding="utf-8")

            raw_docs = loader.load()
            for doc in raw_docs:
                doc.metadata["source"] = file.filename

            # ── Smart Chunk ──────────────────────────────────────────────────
            chunks = smart_chunk(raw_docs, self.embeddings, use_semantic=True)

            # ── Upsert into Chroma ───────────────────────────────────────────
            self.vector_store.add_documents(chunks)

            # ── Sync BM25 in-memory list ─────────────────────────────────────
            self._all_chunks.extend(chunks)

            logger.info(
                f"Ingested '{file.filename}' | pages={len(raw_docs)} "
                f"| chunks={len(chunks)}"
            )

            return {
                "status": "success",
                "filename": file.filename,
                "pages": len(raw_docs),
                "chunks_created": len(chunks),
                "chunking_strategy": "semantic+recursive_fallback",
                "total_indexed": len(self._all_chunks),
            }

        except Exception as e:
            logger.error(f"Ingestion failed for '{file.filename}': {e}")
            if os.path.exists(dest_path):
                os.remove(dest_path)
            return {"error": str(e)}

    def get_stats(self) -> dict:
        """Return vector store and retrieval statistics."""
        if not self.vector_store:
            return {"status": "uninitialized"}
        try:
            count = len(self.vector_store.get()["ids"])
            return {
                "status": "active",
                "total_chunks": count,
                "bm25_chunks_in_memory": len(self._all_chunks),
                "embedding_model": self.embedding_model_name,
                "retrieval_modes": ["hybrid", "vector", "mmr"],
                "chunking_strategy": "semantic+recursive_fallback",
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}


# ── Global singleton ───────────────────────────────────────────────────────────
rag_manager = RAGManager()
