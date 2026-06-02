"""
LangGraph Agent with Production Error Handling
Retry logic, model fallback, and structured state management.
"""

import time
import httpx
from typing import Optional, AsyncGenerator
from typing_extensions import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage, SystemMessage
from langsmith import traceable

from app.config import get_settings
from app.rag import rag_manager


# === Agent State ===
class AgentState(TypedDict):
    """
    State for the production agent.
    Uses Annotated with add_messages reducer for message accumulation.
    """
    messages: Annotated[list[BaseMessage], add_messages]
    context: str
    error: Optional[str]
    retry_count: int
    model_used: str
    mode: str
    
# === Agent Builder ===
class ProductionAgent:
    """
    Production LangGraph agent with:
    - Retry on failure (model fallback)
    - Graceful error handling
    - LangSmith tracing
    """

    def __init__(self):
        settings = get_settings()
        self.ollama_base_url = settings.ollama_base_url

        self.primary_llm = ChatOllama(
            model=settings.primary_model,
            base_url=settings.ollama_base_url,
            temperature=0,
            timeout=30,
            max_retries=0
        )
        self.fallback_llm = ChatOllama(
            model=settings.fallback_model,
            base_url=settings.ollama_base_url,
            temperature=0,
            timeout=30,
            max_retries=0
        )
        self.max_retries = settings.max_retries
        self.graph = self._build_graph()

    def _build_graph(self):
        """Build the LangGraph state machine with async nodes."""

        async def retrieve(state: AgentState) -> dict:
            """
            Retrieve relevant context from the vector store.

            Modes:
              - 'llm'    : Skip retrieval entirely, return empty context.
              - 'rag'    : Retrieve docs and return formatted snippets directly (no LLM).
              - 'hybrid' : Retrieve docs and pass context through to the LLM synthesis node.
            """
            try:
                mode = state.get("mode", "hybrid")

                # LLM-only: skip retrieval
                if mode == "llm":
                    return {"context": ""}

                # Use the last human message as the query
                last_msg = state["messages"][-1]
                query = last_msg.content if hasattr(last_msg, "content") else str(last_msg)

                docs = rag_manager.retrieve(query)
                context = "\n\n".join([doc.page_content for doc in docs]) if docs else ""

                # RAG search-only mode: return formatted snippets, skip LLM
                if mode == "rag":
                    if docs:
                        formatted_response = "### 🔍 Retrieved Document Snippets\n\n"
                        for idx, doc in enumerate(docs, 1):
                            source = (
                                doc.metadata.get("source", "Unknown Source")
                                if hasattr(doc, "metadata") and doc.metadata
                                else "Unknown Source"
                            )
                            formatted_response += f"**Snippet {idx}** — Source: `{source}`\n\n"
                            formatted_response += f"> {doc.page_content.strip()}\n\n---\n\n"
                    else:
                        formatted_response = "❌ No relevant documents found in the database for your query."

                    return {
                        "context": context,
                        "messages": [AIMessage(content=formatted_response)],
                        "model_used": "retriever",
                    }

                # Hybrid mode: pass context along to process_message
                return {"context": context or "No relevant context found."}

            except Exception as e:
                return {"context": "", "error": f"Retrieval failed: {e}"}

        async def process_message(state: AgentState) -> dict:
            """
            Synthesize an answer using the primary LLM.

            Modes:
              - 'llm'    : General assistant, no document context injected.
              - 'hybrid' : RAG-augmented; retrieved context is injected into the system prompt
                           so the LLM can reason over documents and produce a grounded answer.
            """
            try:
                content = ""
                mode = state.get("mode", "hybrid")
                context = state.get("context", "")

                if mode == "llm":
                    # Pure LLM: general-purpose assistant, no document grounding
                    system_prompt = (
                        "You are a highly capable AI assistant. "
                        "Answer the user's question clearly, concisely, and accurately using your training knowledge."
                    )
                else:
                    # Hybrid (RAG + LLM): ground the answer in retrieved context
                    system_prompt = (
                        "You are an expert AI research assistant with access to a curated knowledge base.\n"
                        "Your task is to answer the user's question by synthesizing the retrieved document context below.\n\n"
                        "## Retrieved Context\n"
                        f"{context}\n\n"
                        "## Instructions\n"
                        "- Base your answer primarily on the provided context.\n"
                        "- If the context is insufficient, clearly state what is missing and supplement with your own knowledge.\n"
                        "- Cite specific details from the context when relevant.\n"
                        "- Be concise, accurate, and well-structured in your response."
                    )

                messages_to_send = [SystemMessage(content=system_prompt)] + state["messages"]

                async for chunk in self.primary_llm.astream(messages_to_send):
                    content += chunk.content

                return {
                    "messages": [AIMessage(content=content)],
                    "error": None,
                    "model_used": "primary",
                }
            except Exception as e:
                return {
                    "error": str(e),
                    "retry_count": state["retry_count"] + 1,
                    "model_used": "",
                }

        async def try_fallback(state: AgentState) -> dict:
            """Fallback to secondary model, preserving the same system prompt as process_message."""
            try:
                content = ""
                mode = state.get("mode", "hybrid")
                context = state.get("context", "")

                if mode == "hybrid" and context:
                    system_prompt = (
                        "You are an expert AI research assistant with access to a curated knowledge base.\n"
                        "Your task is to answer the user's question by synthesizing the retrieved document context below.\n\n"
                        "## Retrieved Context\n"
                        f"{context}\n\n"
                        "## Instructions\n"
                        "- Base your answer primarily on the provided context.\n"
                        "- If the context is insufficient, clearly state what is missing and supplement with your own knowledge.\n"
                        "- Cite specific details from the context when relevant.\n"
                        "- Be concise, accurate, and well-structured in your response."
                    )
                    messages_to_send = [SystemMessage(content=system_prompt)] + state["messages"]
                else:
                    messages_to_send = state["messages"]

                async for chunk in self.fallback_llm.astream(messages_to_send):
                    content += chunk.content

                return {
                    "messages": [AIMessage(content=content)],
                    "error": None,
                    "model_used": "fallback",
                }
            except Exception as e:
                return {
                    "error": str(e),
                    "model_used": "",
                }

        async def handle_error(state: AgentState) -> dict:
            """Return a graceful error message."""
            return {
                "messages": [
                    AIMessage(content=(
                        "I'm sorry, I'm having trouble processing your request "
                        "right now. Please try again in a moment."
                    ))
                ],
                "model_used": "error_handler",
            }

        def route_after_retrieve(state: AgentState) -> str:
            """
            Route after retrieval node.
              - 'rag'    : search-only, return formatted snippets directly → END
              - 'llm'    : skipped retrieval, go to LLM synthesis
              - 'hybrid' : retrieved context, go to LLM synthesis
            """
            if state.get("mode") == "rag":
                return "done"
            return "process"

        def route_after_process(state: AgentState) -> str:
            """Decide what to do after primary model attempt."""
            if state.get("error") is None:
                return "done"
            elif state["retry_count"] < self.max_retries:
                return "fallback"
            else:
                return "error"

        def route_after_fallback(state: AgentState) -> str:
            """Decide what to do after fallback attempt."""
            if state.get("error") is None:
                return "done"
            else:
                return "error"

        # Build the graph
        graph = StateGraph(AgentState)

        graph.add_node("retrieve", retrieve)
        graph.add_node("process", process_message)
        graph.add_node("fallback", try_fallback)
        graph.add_node("error", handle_error)

        graph.add_edge(START, "retrieve")
        graph.add_conditional_edges(
            "retrieve",
            route_after_retrieve,
            {"done": END, "process": "process"},
        )
        graph.add_conditional_edges(
            "process",
            route_after_process,
            {"done": END, "fallback": "fallback", "error": "error"},
        )
        graph.add_conditional_edges(
            "fallback",
            route_after_fallback,
            {"done": END, "error": "error"},
        )
        graph.add_edge("error", END)

        return graph.compile()

    @traceable(name="production_agent_invoke")
    def invoke(self, message: str, mode: str = "rag") -> dict:
        """
        Invoke the agent with a user message (synchronous wrapper for compatibility).
        Returns: {"response": str, "model_used": str, "error": str | None}
        """
        import asyncio
        # Run the async graph in a synchronous environment if needed
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        result = loop.run_until_complete(self.graph.ainvoke({
            "messages": [HumanMessage(content=message)],
            "context": "",
            "error": None,
            "retry_count": 0,
            "model_used": "",
            "mode": mode,
        }))

        return {
            "response": result["messages"][-1].content,
            "model_used": result.get("model_used", "unknown"),
            "error": result.get("error"),
        }

    async def astream_run(self, message: str, mode: str = "rag") -> AsyncGenerator[dict, None]:
        """
        Execute the agent graph asynchronously and stream intermediate nodes and tokens.
        Yields dicts containing 'event' and 'data'.
        """
        input_state = {
            "messages": [HumanMessage(content=message)],
            "context": "",
            "error": None,
            "retry_count": 0,
            "model_used": "",
            "mode": mode,
        }

        # Keep track of active nodes to avoid duplicate done emissions and measure duration
        node_start_times = {}
        active_nodes = set()
        tokens_emitted = False

        async for event in self.graph.astream_events(input_state, version="v2"):
            event_type = event["event"]
            node_name = event["metadata"].get("langgraph_node")

            # Capture streaming tokens first to avoid being shadowed by node check
            if event_type == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    tokens_emitted = True
                    yield {
                        "event": "token",
                        "data": {
                            "content": chunk.content
                        }
                    }

            # Ensure we only track top-level node execution chains to prevent sub-chains from messing with active_nodes
            elif node_name and (event.get("name") == node_name or "graph:step" in event.get("tags", [])) and node_name in ["retrieve", "process", "fallback", "error"]:
                if node_name == "retrieve":
                    fe_node = "vector_search"
                elif node_name == "process":
                    fe_node = "llm_primary"
                elif node_name == "fallback":
                    fe_node = "llm_fallback"
                else:
                    fe_node = "error_handler"
                
                # Check for node start
                if event_type == "on_chain_start" and fe_node not in active_nodes:
                    active_nodes.add(fe_node)
                    node_start_times[fe_node] = time.time()
                    yield {
                        "event": "graph_node",
                        "data": {
                            "node": fe_node,
                            "status": "start",
                            "duration_ms": None
                        }
                    }
                
                # Check for node end
                elif event_type == "on_chain_end" and fe_node in active_nodes:
                    active_nodes.remove(fe_node)
                    start_time = node_start_times.get(fe_node)
                    duration = (time.time() - start_time) * 1000 if start_time else None
                    
                    # Determine status
                    output = event["data"].get("output")
                    status = "done"
                    if isinstance(output, dict) and output.get("error"):
                        status = "error"
                    elif node_name == "retrieve" and mode == "llm":
                        status = "skip"
                    
                    # Safety fallback: if no tokens were emitted and node completed successfully, yield full text response
                    if status == "done" and not tokens_emitted:
                        node_response = ""
                        if isinstance(output, dict):
                            # Try directly from 'messages' in output
                            if "messages" in output and output["messages"]:
                                last_msg = output["messages"][-1]
                                if hasattr(last_msg, "content"):
                                    node_response = last_msg.content
                                elif isinstance(last_msg, dict) and "content" in last_msg:
                                    node_response = last_msg["content"]
                            # Try if whole state is wrapped in 'values'
                            elif "values" in output and isinstance(output["values"], dict):
                                vals = output["values"]
                                if "messages" in vals and vals["messages"]:
                                    last_msg = vals["messages"][-1]
                                    if hasattr(last_msg, "content"):
                                        node_response = last_msg.content
                        elif isinstance(output, list) and output:
                            last_msg = output[-1]
                            if hasattr(last_msg, "content"):
                                node_response = last_msg.content
                        
                        if node_response:
                            tokens_emitted = True
                            yield {
                                "event": "token",
                                "data": {
                                    "content": node_response
                                }
                            }
                        
                    yield {
                        "event": "graph_node",
                        "data": {
                            "node": fe_node,
                            "status": status,
                            "duration_ms": round(duration, 1) if duration else None
                        }
                    }

        # Post-stream synthetic skip events based on mode
        if mode == "rag":
            # RAG search-only: LLM was never called
            yield {
                "event": "graph_node",
                "data": {"node": "llm_primary", "status": "skip", "duration_ms": 0.0}
            }
        elif mode == "llm":
            # LLM-only: vector search was never called
            yield {
                "event": "graph_node",
                "data": {"node": "vector_search", "status": "skip", "duration_ms": 0.0}
            }

    async def health_check(self) -> dict:
        """Verify if the Ollama service is reachable and running."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{self.ollama_base_url}/api/tags")
                if r.status_code == 200:
                    return {"ollama": True, "status": "connected"}
                return {"ollama": False, "status": f"http_error_{r.status_code}"}
        except Exception as e:
            return {"ollama": False, "error": str(e)}