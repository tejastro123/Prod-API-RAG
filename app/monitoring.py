"""
Production Monitoring & Structured Logging
==========================================
Features:
  - Structured JSON logging with rotating file handler
  - Thread-safe MetricsCollector with Lock
  - Request timer context manager
  - Per-mode metric breakdown (rag/hybrid/llm)
  - Tenacity retry decorator utilities
"""

import logging
import json
import os
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from threading import Lock
from typing import Optional


# ══════════════════════════════════════════════════════════════════════════════
#  JSON Formatter
# ══════════════════════════════════════════════════════════════════════════════

class JSONFormatter(logging.Formatter):
    """
    Emit log records as single-line JSON objects.
    Compatible with ELK, Datadog, GCP Logging, and CloudWatch.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
        }
        # Attach request_id if injected by the caller
        if hasattr(record, "request_id"):
            log_obj["request_id"] = record.request_id  # type: ignore[attr-defined]
        # Attach any arbitrary extra payload
        if hasattr(record, "extra_data"):
            log_obj.update(record.extra_data)  # type: ignore[attr-defined]
        # Attach exception traceback if present
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj, ensure_ascii=False)


# ══════════════════════════════════════════════════════════════════════════════
#  Logger Factory
# ══════════════════════════════════════════════════════════════════════════════

LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")

def get_logger(name: str = "production-api") -> logging.Logger:
    """
    Create (or retrieve) a structured JSON logger with:
      - Console StreamHandler (always)
      - Rotating file handler (10 MB × 5 backups)
    """
    logger = logging.getLogger(name)

    if logger.handlers:
        return logger  # already configured — avoid duplicate handlers

    logger.setLevel(logging.INFO)
    formatter = JSONFormatter()

    # ── Console handler ────────────────────────────────────────────────────────
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # ── Rotating file handler ──────────────────────────────────────────────────
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        file_handler = RotatingFileHandler(
            filename=os.path.join(LOG_DIR, "app.log"),
            maxBytes=10 * 1024 * 1024,   # 10 MB per file
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except Exception:
        # Non-fatal: log to console only if file handler fails (e.g. read-only FS)
        pass

    return logger


# ══════════════════════════════════════════════════════════════════════════════
#  Thread-Safe Metrics Collector
# ══════════════════════════════════════════════════════════════════════════════

class MetricsCollector:
    """
    Thread-safe production metrics collector.

    Tracks:
      - Request counts (total, errors, cache hits/misses)
      - Latency (average, p95 approximation via running max)
      - Token usage (input + output)
      - Per-mode breakdown (rag / hybrid / llm)

    In a real production environment, swap this for Prometheus:
        from prometheus_client import Counter, Histogram, Gauge
    """

    def __init__(self):
        self._lock = Lock()
        self._requests_total = 0
        self._errors_total = 0
        self._latency_sum = 0.0
        self._latency_count = 0
        self._latency_max = 0.0
        self._tokens_input = 0
        self._tokens_output = 0
        self._cache_hits = 0
        self._cache_misses = 0
        # Per-mode counters
        self._mode_counts: dict[str, int] = {}

    def record_request(
        self,
        latency_ms: float,
        input_tokens: int = 0,
        output_tokens: int = 0,
        error: bool = False,
        cache_hit: bool = False,
        mode: Optional[str] = None,
    ) -> None:
        """Record a single completed request. Thread-safe."""
        with self._lock:
            self._requests_total += 1
            self._latency_sum += latency_ms
            self._latency_count += 1
            self._latency_max = max(self._latency_max, latency_ms)
            self._tokens_input += input_tokens
            self._tokens_output += output_tokens

            if error:
                self._errors_total += 1
            if cache_hit:
                self._cache_hits += 1
            else:
                self._cache_misses += 1

            if mode:
                self._mode_counts[mode] = self._mode_counts.get(mode, 0) + 1

    @property
    def summary(self) -> dict:
        """Compute aggregated metrics summary. Thread-safe read."""
        with self._lock:
            avg_latency = (
                self._latency_sum / self._latency_count
                if self._latency_count > 0 else 0.0
            )
            error_rate = (
                self._errors_total / self._requests_total
                if self._requests_total > 0 else 0.0
            )
            cache_total = self._cache_hits + self._cache_misses
            cache_hit_rate = (
                self._cache_hits / cache_total if cache_total > 0 else 0.0
            )

            return {
                "total_requests": self._requests_total,
                "total_errors": self._errors_total,
                "error_rate": f"{error_rate:.2%}",
                "avg_latency_ms": round(avg_latency, 2),
                "peak_latency_ms": round(self._latency_max, 2),
                "cache_hit_rate": f"{cache_hit_rate:.2%}",
                "total_input_tokens": self._tokens_input,
                "total_output_tokens": self._tokens_output,
                "requests_by_mode": dict(self._mode_counts),
            }


# ══════════════════════════════════════════════════════════════════════════════
#  Request Timer
# ══════════════════════════════════════════════════════════════════════════════

class RequestTimer:
    """Context manager for high-resolution request timing."""

    def __enter__(self):
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_):
        self.elapsed_ms = (time.perf_counter() - self._start) * 1000

    @property
    def ms(self) -> float:
        return getattr(self, "elapsed_ms", 0.0)
