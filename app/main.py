"""
Production-Ready FastAPI + LangGraph Application

Wires together:
- Security pipeline (input sanitization, PII masking)
- Response caching
- Rate limiting (slowapi)
- LangGraph agent (with retries + fallback)
- Structured logging + metrics
- LangSmith tracing
- Health checks
"""

import time
import os
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from langsmith import traceable
from dotenv import load_dotenv

from app.config import get_settings
from app.models import (
    ChatRequest, ChatResponse,
    HealthResponse, MetricsResponse,
)
from app.security import SecurityPipeline
from app.cache import ResponseCache
from app.monitoring import get_logger, MetricsCollector
from app.agent import ProductionAgent
from starlette.middleware.base import BaseHTTPMiddleware

load_dotenv()
logger = get_logger()

# === Rate Limiter Setup ===
def get_real_ip(request: Request) -> str:
    """Extract real IP, respecting X-Forwarded-For from proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

limiter = Limiter(key_func=get_real_ip)

# === Request ID Middleware ===
class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

# === Lifespan (startup/shutdown) ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize all components on startup, clean up on shutdown.
    Thread-safe implementation: instances are attached to app.state.
    """
    settings = get_settings()

    logger.info("Starting production API...", extra={"extra_data": {
        "environment": settings.app_env,
        "primary_model": settings.primary_model,
        "tracing_enabled": settings.langchain_tracing_v2,
    }})

    # Initialize components on app.state
    app.state.security = SecurityPipeline()
    app.state.cache = ResponseCache(ttl_seconds=settings.cache_ttl_seconds)
    app.state.metrics = MetricsCollector()
    app.state.agent = ProductionAgent()

    # Startup validation for Ollama connectivity
    logger.info("Validating Ollama connectivity...")
    ollama_status = await app.state.agent.health_check()
    if not ollama_status.get("ollama"):
        logger.warning(
            "Ollama not reachable at startup",
            extra={"extra_data": {"url": settings.ollama_base_url, "error": ollama_status.get("error")}}
        )
    else:
        logger.info("Ollama is reachable at startup.")

    logger.info("All components initialized. Ready to serve requests.")

    yield  # App is running

    # Shutdown
    logger.info("Shutting down...", extra={"extra_data": app.state.metrics.summary})


# === FastAPI App ===
app = FastAPI(
    title="Production LangGraph API",
    description="A production-ready chat API with security, caching, and observability.",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter

# Add middlewares
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === Exception Handlers ===
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Handle rate limit exceeded errors."""
    logger.warning("Rate limit exceeded", extra={"extra_data": {
        "client_ip": get_real_ip(request),
        "request_id": getattr(request.state, "request_id", None),
    }})
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "detail": "Too many requests. Please slow down.",
        },
    )


# =============================================
# ENDPOINTS
# =============================================

@app.post("/chat")
@limiter.limit(get_settings().rate_limit)
@traceable(name="chat_endpoint")
async def chat(request: Request, body: ChatRequest):
    """
    Main chat endpoint with Server-Sent Events (SSE) streaming.

    Flow:
    1. Security check (injection + PII masking)
    2. Cache lookup
    3. LangGraph agent token streaming (if cache miss)
    4. Output validation
    5. Cache store
    """
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    security_notes = []
    
    security_pipeline = request.app.state.security
    response_cache = request.app.state.cache
    metrics_collector = request.app.state.metrics
    prod_agent = request.app.state.agent

    # ---- Step 1: Security Check ----
    t_security = time.time()
    is_allowed, cleaned_message, notes = security_pipeline.check_input(body.message)
    security_duration = (time.time() - t_security) * 1000
    security_notes.extend(notes)

    if not is_allowed:
        logger.warning("Request blocked by security", extra={"extra_data": {
            "reason": notes,
            "thread_id": body.thread_id,
            "request_id": request_id,
        }})
        metrics_collector.record_request(latency_ms=0, error=True)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "blocked_by_security",
                "message": "Your message was blocked by our security filters.",
                "notes": notes,
                "request_id": request_id,
            }
        )

    # ---- Step 2: Cache Lookup ----
    t_cache = time.time()
    cached_response = response_cache.get(cleaned_message)
    cache_duration = (time.time() - t_cache) * 1000

    async def event_generator():
        import json
        encoder = lambda event, data: f"event: {event}\ndata: {json.dumps(data)}\n\n"

        # Always yield the security scan node status
        yield encoder("graph_node", {
            "node": "security_scan",
            "status": "done",
            "duration_ms": round(security_duration, 1)
        })

        if security_notes:
            yield encoder("security", {"notes": security_notes})

        # Cache Hit flow
        if cached_response is not None:
            yield encoder("graph_node", {
                "node": "cache_lookup",
                "status": "done",
                "duration_ms": round(cache_duration, 1)
            })
            
            # Since it is a cache hit, yield it as a token (for streaming UX)
            yield encoder("token", {"content": cached_response})
            yield encoder("metadata", {
                "cached": True,
                "model_used": "cache",
                "processing_time_ms": 0,
            })
            yield encoder("done", {
                "response": cached_response,
                "thread_id": body.thread_id,
                "model_used": "cache",
                "cached": True,
                "processing_time_ms": 0,
                "security_notes": security_notes,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            metrics_collector.record_request(latency_ms=0, cache_hit=True)
            return

        # Cache Miss flow
        yield encoder("graph_node", {
            "node": "cache_lookup",
            "status": "skip",
            "duration_ms": round(cache_duration, 1)
        })

        # Run agent streaming
        full_response = ""
        model_used = "primary"
        t_start = time.time()

        try:
            async for sse_event in prod_agent.astream_run(cleaned_message):
                event_type = sse_event["event"]
                event_data = sse_event["data"]

                if event_type == "token":
                    full_response += event_data.get("content", "")
                    yield encoder("token", event_data)
                elif event_type == "graph_node":
                    # Update model_used based on what node executes
                    if event_data["node"] == "llm_fallback" and event_data["status"] == "start":
                        model_used = "fallback"
                    yield encoder("graph_node", event_data)

        except Exception as e:
            logger.error(f"Stream error: {e}", extra={"extra_data": {"request_id": request_id}})
            yield encoder("error", {"message": "Internal error during streaming", "code": 500})
            metrics_collector.record_request(latency_ms=(time.time()-t_start)*1000, error=True)
            return

        total_latency = (time.time() - t_start) * 1000
        
        # ---- Step 4: Output Validation ----
        validated_response, output_warnings = security_pipeline.check_output(full_response)
        if output_warnings:
            security_notes.extend(output_warnings)
            yield encoder("security", {"notes": output_warnings})

        # Yield output filter node status
        yield encoder("graph_node", {
            "node": "output_filter",
            "status": "done",
            "duration_ms": 1.0
        })

        # ---- Step 5: Cache Store ----
        response_cache.set(cleaned_message, validated_response)

        # Record metrics
        input_tokens = int(len(cleaned_message.split()) * 1.3)
        output_tokens = int(len(validated_response.split()) * 1.3)
        metrics_collector.record_request(
            latency_ms=total_latency,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_hit=False,
        )

        logger.info("Request completed", extra={"extra_data": {
            "thread_id": body.thread_id,
            "model_used": model_used,
            "latency_ms": round(total_latency, 2),
            "request_id": request_id,
        }})

        # Yield done event
        yield encoder("done", {
            "response": validated_response,
            "thread_id": body.thread_id,
            "model_used": model_used,
            "cached": False,
            "processing_time_ms": round(total_latency, 2),
            "security_notes": security_notes,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Request-ID": request_id,
        }
    )


@app.get("/health", response_model=HealthResponse)
async def health(request: Request):
    """Health check for Docker/Kubernetes."""
    settings = get_settings()
    
    agent = request.app.state.agent
    security = request.app.state.security
    cache = request.app.state.cache

    ollama_status = await agent.health_check()

    checks = {
        "agent": agent is not None,
        "security": security is not None,
        "cache": cache is not None,
        "ollama_reachable": ollama_status.get("ollama", False),
    }

    all_healthy = all(checks.values())

    return HealthResponse(
        status="healthy" if all_healthy else "degraded",
        environment=settings.app_env,
        checks=checks,
    )


@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics(request: Request):
    """Metrics for monitoring dashboards."""
    summary = request.app.state.metrics.summary
    return MetricsResponse(**summary)


@app.get("/cache/stats")
async def cache_stats(request: Request):
    """Cache performance statistics."""
    return request.app.state.cache.stats