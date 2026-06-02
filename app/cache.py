"""
Production Response Cache
=========================
Features:
  - TTL-based in-memory cache with normalised SHA-256 keys
  - Thread-safe read/write with Lock
  - LRU eviction (max_entries) to prevent unbounded memory growth
  - Cache stats with hit-rate, entry count, and size estimate
  - Simple semantic-hash extension: strips punctuation before hashing
    so 'What is Python?' and 'what is python' share the same cache key
"""

import hashlib
import re
import time
from threading import Lock
from typing import Optional


class ResponseCache:
    """
    Thread-safe in-memory response cache with:
      - TTL expiry
      - LRU-style eviction (oldest entries pruned when max_entries hit)
      - Normalised key hashing for basic semantic deduplication

    Upgrade path: swap _cache for a Redis client and TTL becomes native.
    """

    def __init__(self, ttl_seconds: int = 300, max_entries: int = 500):
        self.ttl = ttl_seconds
        self.max_entries = max_entries
        self._cache: dict[str, dict] = {}
        self._lock = Lock()
        self._hits = 0
        self._misses = 0

    # ── Key normalisation ──────────────────────────────────────────────────────

    def _make_key(self, query: str) -> str:
        """
        Normalise query → SHA-256 hex digest.
        Strips punctuation, lowercases, and collapses whitespace so that
        'What is Python?' and 'what is python' map to the same key.
        """
        normalised = query.lower().strip()
        normalised = re.sub(r"[^\w\s]", "", normalised)   # remove punctuation
        normalised = re.sub(r"\s+", " ", normalised)       # collapse whitespace
        return hashlib.sha256(normalised.encode()).hexdigest()

    # ── LRU eviction ──────────────────────────────────────────────────────────

    def _evict_oldest(self) -> None:
        """Remove the oldest cache entry (by insertion timestamp)."""
        if not self._cache:
            return
        oldest_key = min(self._cache, key=lambda k: self._cache[k]["timestamp"])
        del self._cache[oldest_key]

    # ── Public API ─────────────────────────────────────────────────────────────

    def get(self, query: str) -> Optional[str]:
        """
        Return cached response if it exists and has not expired.
        Returns None on miss or expiry.
        """
        key = self._make_key(query)

        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if time.time() - entry["timestamp"] < self.ttl:
                    self._hits += 1
                    return entry["response"]
                # Expired — evict
                del self._cache[key]

            self._misses += 1
            return None

    def set(self, query: str, response: str) -> None:
        """Store a response in the cache."""
        key = self._make_key(query)

        with self._lock:
            # Enforce max_entries cap before inserting
            if len(self._cache) >= self.max_entries and key not in self._cache:
                self._evict_oldest()

            self._cache[key] = {
                "response": response,
                "timestamp": time.time(),
                "query": query,
            }

    def invalidate(self, query: str) -> bool:
        """Explicitly remove a specific query from the cache. Returns True if found."""
        key = self._make_key(query)
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> int:
        """Flush all entries. Returns the number of entries cleared."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            return count

    @property
    def stats(self) -> dict:
        """Return cache performance statistics."""
        with self._lock:
            total = self._hits + self._misses
            hit_rate = self._hits / total if total > 0 else 0.0
            # Rough memory estimate: avg 2 KB per entry
            estimated_mb = (len(self._cache) * 2048) / (1024 * 1024)

            return {
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": f"{hit_rate:.1%}",
                "cached_entries": len(self._cache),
                "max_entries": self.max_entries,
                "ttl_seconds": self.ttl,
                "estimated_size_mb": round(estimated_mb, 3),
            }
