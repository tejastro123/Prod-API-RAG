# prod-api-rag — Production Upgrade Plan
> Codebase analysis → gap identification → upgrade roadmap
> Current state: working prototype. Target: production-grade system.

---

## Codebase Analysis

### What exists (strengths)

```
app/
├── agent.py        LangGraph StateGraph, primary/fallback LLM, retry routing
├── cache.py        In-memory TTL cache, SHA-256 key, hit/miss stats
├── config.py       pydantic-settings, lru_cache, .env loading
├── main.py         FastAPI lifespan, /chat /health /metrics /cache/stats
├── models.py       Pydantic ChatRequest/ChatResponse/HealthResponse/MetricsResponse
├── monitoring.py   JSON logger, MetricsCollector, RequestTimer
└── security.py     InputSanitizer (10 patterns), PIIDetector (4 types), OutputValidator
```

Architecture is sound. Security pipeline is well-structured. LangGraph graph is correct.

---

### Critical Gaps (Blocking Production)

#### 1. `app/agent.py` — No SSE / Streaming

```python
# CURRENT — blocks until full response
result = self.graph.invoke({...})
return {"response": result["messages"][-1].content, ...}
```

Blocks request thread. Render free tier = 30s timeout. Long responses = 504.  
No `graph_node` events emitted. LangGraph visualizer impossible.

**Risk: HIGH. Blocks Week 1A.**

---

#### 2. `app/main.py` — `/chat` returns JSON, not SSE

```python
@app.post("/chat", response_model=ChatResponse)
async def chat(...):
    result = agent.invoke(cleaned_message)   # ← synchronous, blocking
    return ChatResponse(...)                 # ← single JSON blob
```

No `StreamingResponse`. No token-by-token delivery.  
The entire `/chat` endpoint must be rewritten.

**Risk: HIGH. Core feature missing.**

---

#### 3. `app/main.py` — Global mutable state (NOT thread-safe)

```python
security: SecurityPipeline = None
cache: ResponseCache = None
metrics: MetricsCollector = None
agent: ProductionAgent = None
```

Module-level globals. Fine for single worker, breaks under:
- Multiple uvicorn workers (`--workers 4`)
- Gunicorn multiprocess
- Shared cache state: each worker has its own `ResponseCache` → cache misses multiply

**Risk: HIGH for multi-worker deploy.**

---

#### 4. `app/cache.py` — In-memory only, no persistence

```python
self._cache: dict[str, dict] = {}
```

Lost on every restart. Render free tier spins down after inactivity → cache always cold on wakeup.  
No shared state between workers.  
No eviction policy beyond TTL (unbounded growth if high traffic).

**Risk: MEDIUM-HIGH.**

---

#### 5. `app/config.py` — Ollama dependency in production

```python
self.primary_llm = ChatOllama(model=settings.primary_model, ...)
self.fallback_llm = ChatOllama(model=settings.fallback_model, ...)
```

`render.yml` sets `PRIMARY_MODEL=llama3`, `FALLBACK_MODEL=mistral`.  
Render free tier has no GPU. Ollama must run externally.  
No validation that `OLLAMA_BASE_URL` is reachable at startup.  
Cold start: if Ollama is down, agent init silently succeeds but all requests fail.

**Risk: HIGH — silent failure mode.**

---

#### 6. `app/monitoring.py` — MetricsCollector is in-memory, resets on restart

```python
self._requests_total = 0
```

No persistence. Metrics lost on every cold start.  
`/metrics` endpoint shows `0` after every wakeup.  
No time-series data. No alerting hooks.

**Risk: MEDIUM.**

---

#### 7. `app/security.py` — No rate limit per user/IP at security layer

SlowAPI rate limiting exists in `main.py` (20/min) but:
- Keyed on `get_remote_address` — all traffic behind same reverse proxy = same key
- No per-user rate limiting once auth is added
- No rate limit headers returned to client (no `X-RateLimit-*`)
- Injection patterns: 10 patterns is a start, but missing several common bypasses

**Risk: MEDIUM.**

---

#### 8. `app/models.py` — No request ID, no correlation

```python
class ChatResponse(BaseModel):
    response: str
    thread_id: str
    model_used: str
    ...
```

No `request_id` field. Cannot correlate frontend logs ↔ backend logs ↔ LangSmith traces.  
`ErrorResponse` has `request_id: str | None = None` but never populated.

**Risk: MEDIUM.**

---

#### 9. `app/main.py` — CORS not configured

```python
app = FastAPI(title="Production LangGraph API", ...)
# No CORSMiddleware
```

Web frontend on `*.vercel.app` cannot call this API from browser.  
Every frontend request will fail with CORS error.

**Risk: HIGH — frontend completely blocked.**

---

#### 10. `app/agent.py` — No `graph_node` event emission

```python
def process_message(state: AgentState) -> dict:
    try:
        response = self.primary_llm.invoke(state["messages"])
        return {"messages": [response], "error": None, "model_used": "primary"}
    except Exception as e:
        return {"error": str(e), ...}
```

No timing. No node entry/exit events. No way to surface execution pipeline to frontend.

**Risk: LOW now, HIGH for Week 3 visualizer.**

---

#### 11. No health check for Ollama connectivity

```python
@app.get("/health")
async def health():
    checks = {
        "agent": agent is not None,   # ← only checks Python object exists
        "security": security is not None,
        "cache": cache is not None,
    }
```

`agent is not None` is always True after startup. Does not verify Ollama is reachable.  
Docker `HEALTHCHECK` will show "healthy" even when all LLM calls will fail.

**Risk: HIGH — false positive health.**

---

#### 12. `app/main.py` — Lifespan indentation bug

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    ...
    yield  # App is running
    logger.info("Shutting down...", ...)
    
    
    # === Rate Limiter Setup ===        ← THIS IS INSIDE LIFESPAN
limiter = Limiter(key_func=get_remote_address)
```

`limiter` instantiation is at module scope but follows lifespan code — cosmetically confusing and may cause issues if linters/tools misread indentation. Minor but signals rushing.

**Risk: LOW (cosmetic but real).**

---

### Summary Gap Matrix

| File | Critical | High | Medium | Low |
|---|---|---|---|---|
| agent.py | No streaming | No graph_node events | | |
| main.py | No SSE endpoint, CORS missing | No request_id | | Indentation bug |
| cache.py | | In-memory only | No eviction | |
| config.py | | Ollama not validated | | |
| monitoring.py | | Metrics reset on restart | No time-series | |
| security.py | | Proxy IP issue | Missing injection patterns | |
| models.py | | No request_id | | |

---

## Upgrade Plan

### Sprint 0 — Foundation Fixes (Before Any New Feature)
**Unblock production. Fix the bugs that make the current code unsafe to deploy.**

---

#### 0.1 Add CORS middleware

```python
# app/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,   # ["https://*.vercel.app", "http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

Add to `Settings`:
```python
allowed_origins: list[str] = ["http://localhost:3000"]
```

**Effort: 30 min. Unblocks all frontend work.**

---

#### 0.2 Add request ID to every request

```python
# app/middleware.py
import uuid
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

Wire into all log calls: `logger.info("...", extra={"extra_data": {"request_id": request.state.request_id}})`

Update `ChatResponse`:
```python
class ChatResponse(BaseModel):
    ...
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
```

**Effort: 1h. Required for log correlation and LangSmith trace linking.**

---

#### 0.3 Fix health check — verify Ollama reachability

```python
# app/agent.py — add probe method
async def health_check(self) -> dict:
    """Verify LLM backend is reachable."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{self.ollama_base_url}/api/tags")
            return {"ollama": r.status_code == 200, "models_available": r.status_code == 200}
    except Exception as e:
        return {"ollama": False, "error": str(e)}

# app/main.py
@app.get("/health")
async def health():
    ollama_status = await agent.health_check()
    checks = {
        "agent": agent is not None,
        "ollama_reachable": ollama_status.get("ollama", False),
        "security": security is not None,
        "cache": cache is not None,
    }
    all_healthy = all(checks.values())
    return HealthResponse(
        status="healthy" if all_healthy else "degraded",
        ...
        checks=checks,
    )
```

**Effort: 1h. Makes health check trustworthy.**

---

#### 0.4 Add startup validation for Ollama

```python
# app/main.py — inside lifespan, after agent init
logger.info("Validating Ollama connectivity...")
ollama_status = await agent.health_check()
if not ollama_status.get("ollama"):
    logger.warning(
        "Ollama not reachable at startup",
        extra={"extra_data": {"url": settings.ollama_base_url, "error": ollama_status.get("error")}}
    )
    # Do NOT crash — Ollama might come up later. Log and continue.
```

**Effort: 30 min. Surfaces misconfiguration immediately.**

---

#### 0.5 Fix SlowAPI IP key for reverse proxy

```python
# app/main.py
from slowapi.util import get_remote_address

def get_real_ip(request: Request) -> str:
    """Extract real IP, respecting X-Forwarded-For from Render's proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host

limiter = Limiter(key_func=get_real_ip)
```

Add to `Settings`:
```python
trusted_proxy: bool = True
```

**Effort: 30 min. Prevents all traffic from sharing one rate limit bucket.**

---

### Sprint 1 — Streaming Architecture
**The core AI experience. Everything in Week 1A of frontend plan depends on this.**

---

#### 1.1 Add `graph_node` event emitter to AgentState

```python
# app/agent.py

import asyncio
import time
from typing import Optional, AsyncGenerator
from typing_extensions import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from langchain_core.callbacks import AsyncCallbackHandler
from langsmith import traceable

class GraphNodeEvent(TypedDict):
    node: str
    status: str   # "start" | "done" | "skip" | "error"
    duration_ms: float | None

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    error: Optional[str]
    retry_count: int
    model_used: str
    graph_events: list[GraphNodeEvent]   # ← NEW: accumulates node events
```

---

#### 1.2 Instrument each LangGraph node with timing

```python
# app/agent.py — inside _build_graph()

def process_message(state: AgentState) -> dict:
    t0 = time.time()
    events = list(state.get("graph_events", []))
    events.append({"node": "llm_primary", "status": "start", "duration_ms": None})
    
    try:
        response = self.primary_llm.invoke(state["messages"])
        duration = (time.time() - t0) * 1000
        events[-1] = {"node": "llm_primary", "status": "done", "duration_ms": round(duration, 1)}
        return {
            "messages": [response],
            "error": None,
            "model_used": "primary",
            "graph_events": events,
        }
    except Exception as e:
        duration = (time.time() - t0) * 1000
        events[-1] = {"node": "llm_primary", "status": "error", "duration_ms": round(duration, 1)}
        return {
            "error": str(e),
            "retry_count": state["retry_count"] + 1,
            "model_used": "",
            "graph_events": events,
        }
```

Apply same pattern to `try_fallback`, `handle_error`. Add `security_check` and `cache_lookup` as pseudo-nodes emitted from `main.py`.

---

#### 1.3 Add async streaming invoke to ProductionAgent

```python
# app/agent.py

async def stream_invoke(
    self,
    message: str,
    security_notes: list[str],
    cache_hit: bool,
) -> AsyncGenerator[dict, None]:
    """
    Yields structured SSE events:
      {"event": "graph_node", "data": {...}}
      {"event": "token",      "data": {"content": "..."}}
      {"event": "metadata",   "data": {...}}
      {"event": "done",       "data": {full ChatResponse}}
      {"event": "error",      "data": {"message": "...", "code": 500}}
    """
    import asyncio

    # Emit pre-LLM graph nodes (already processed in security/cache layer)
    if security_notes:
        yield {"event": "graph_node", "data": {
            "node": "security_scan", "status": "done", "duration_ms": 1.0
        }}
    
    if cache_hit:
        # Caller handles cache hit before calling stream_invoke
        return

    yield {"event": "graph_node", "data": {
        "node": "cache_lookup", "status": "skip", "duration_ms": 1.0
    }}

    # Run LangGraph in thread to avoid blocking event loop
    loop = asyncio.get_event_loop()
    result_future = loop.run_in_executor(None, self._invoke_sync, message)

    # While waiting for full response, poll for partial tokens
    # NOTE: For true token streaming, swap ChatOllama for streaming-capable client
    # This approach yields the full response as one token block (non-streaming Ollama)
    try:
        result = await result_future
    except Exception as e:
        yield {"event": "error", "data": {"message": str(e), "code": 500}}
        return

    # Emit graph_node events collected during invoke
    for event in result.get("graph_events", []):
        yield {"event": "graph_node", "data": event}

    # Emit response as token stream (simulate streaming for non-streaming Ollama)
    # Replace with actual token streaming when using OpenAI/Anthropic
    response_text = result["response"]
    chunk_size = 8  # characters per fake token
    for i in range(0, len(response_text), chunk_size):
        yield {"event": "token", "data": {"content": response_text[i:i+chunk_size]}}
        await asyncio.sleep(0)  # yield control

    yield {"event": "metadata", "data": {
        "cached": False,
        "model_used": result["model_used"],
        "processing_time_ms": result.get("processing_time_ms", 0),
    }}

    yield {"event": "done", "data": result}

def _invoke_sync(self, message: str) -> dict:
    """Synchronous invoke for use with run_in_executor."""
    return self.invoke(message)
```

**Note on true token streaming:** Ollama supports streaming via `ChatOllama(streaming=True)` + `stream()`. To emit real tokens, replace `run_in_executor` approach with `astream()` callback pattern. This is the upgrade path for Sprint 3.

---

#### 1.4 Rewrite `/chat` endpoint as SSE stream

```python
# app/main.py
import json
from fastapi.responses import StreamingResponse

@app.post("/chat")
@limiter.limit(get_settings().rate_limit)
async def chat(request: Request, body: ChatRequest):
    """
    SSE streaming chat endpoint.
    
    Emits typed events: graph_node | token | metadata | security | done | error
    """
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    security_notes = []
    
    # ---- Step 1: Security Check ----
    t_security = time.time()
    is_allowed, cleaned_message, notes = security.check_input(body.message)
    security_duration = (time.time() - t_security) * 1000
    security_notes.extend(notes)

    if not is_allowed:
        # For blocked requests, return JSON error (not SSE — client needs to handle)
        logger.warning("Request blocked", extra={"extra_data": {
            "reason": notes, "request_id": request_id
        }})
        metrics.record_request(latency_ms=0, error=True)
        raise HTTPException(status_code=400, detail={
            "error": "blocked_by_security",
            "message": "Your message was blocked by our security filters.",
            "notes": notes,
            "request_id": request_id,
        })

    # ---- Step 2: Cache Lookup ----
    t_cache = time.time()
    cached_response = cache.get(cleaned_message)
    cache_duration = (time.time() - t_cache) * 1000

    async def event_stream():
        encoder = lambda event, data: f"event: {event}\ndata: {json.dumps(data)}\n\n"

        # Always emit security node result
        yield encoder("graph_node", {
            "node": "security_scan",
            "status": "done",
            "duration_ms": round(security_duration, 1),
        })

        if security_notes:
            yield encoder("security", {"notes": security_notes})

        # Emit cache node result
        if cached_response is not None:
            yield encoder("graph_node", {
                "node": "cache_lookup",
                "status": "hit",
                "duration_ms": round(cache_duration, 1),
            })
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
                "request_id": request_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            metrics.record_request(latency_ms=0, cache_hit=True)
            return

        yield encoder("graph_node", {
            "node": "cache_lookup",
            "status": "miss",
            "duration_ms": round(cache_duration, 1),
        })

        # Stream from agent
        full_response = ""
        model_used = "unknown"
        processing_time_ms = 0.0
        t_start = time.time()

        try:
            async for sse_event in agent.stream_invoke(
                cleaned_message, security_notes, cache_hit=False
            ):
                event_type = sse_event["event"]
                event_data = sse_event["data"]

                if event_type == "token":
                    full_response += event_data.get("content", "")
                    yield encoder("token", event_data)

                elif event_type == "metadata":
                    model_used = event_data.get("model_used", "unknown")
                    processing_time_ms = event_data.get("processing_time_ms", 0)
                    yield encoder("metadata", event_data)

                elif event_type == "graph_node":
                    yield encoder("graph_node", event_data)

                elif event_type == "error":
                    yield encoder("error", event_data)
                    metrics.record_request(latency_ms=(time.time()-t_start)*1000, error=True)
                    return

                elif event_type == "done":
                    pass  # We'll emit done ourselves after output validation

        except Exception as e:
            logger.error(f"Stream error: {e}", extra={"extra_data": {"request_id": request_id}})
            yield encoder("error", {"message": "Internal error during streaming", "code": 500})
            metrics.record_request(latency_ms=(time.time()-t_start)*1000, error=True)
            return

        # Output validation on complete response
        validated_response, output_warnings = security.check_output(full_response)
        if output_warnings:
            security_notes.extend(output_warnings)
            yield encoder("security", {"notes": output_warnings})

        # Cache store
        cache.set(cleaned_message, validated_response)

        total_latency = (time.time() - t_start) * 1000
        input_tokens = int(len(cleaned_message.split()) * 1.3)
        output_tokens = int(len(validated_response.split()) * 1.3)
        metrics.record_request(
            latency_ms=total_latency,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_hit=False,
        )

        yield encoder("done", {
            "response": validated_response,
            "thread_id": body.thread_id,
            "model_used": model_used,
            "cached": False,
            "processing_time_ms": round(total_latency, 2),
            "security_notes": security_notes,
            "request_id": request_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        logger.info("Stream completed", extra={"extra_data": {
            "request_id": request_id,
            "thread_id": body.thread_id,
            "model_used": model_used,
            "latency_ms": round(total_latency, 2),
        }})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Request-ID": request_id,
        }
    )
```

---

### Sprint 2 — Persistence & Cache Upgrade

---

#### 2.1 Redis cache (replaces in-memory ResponseCache)

```python
# app/cache.py — Redis-backed version

import hashlib
import json
from typing import Optional
import redis.asyncio as aioredis

class ResponseCache:
    """
    Redis-backed cache. Falls back to in-memory if Redis unavailable.
    Shared across all workers. Persists through restarts.
    """

    def __init__(self, redis_url: str, ttl_seconds: int = 300):
        self.ttl = ttl_seconds
        self._redis_url = redis_url
        self._redis: Optional[aioredis.Redis] = None
        self._fallback: dict = {}   # in-memory fallback
        self._hits = 0
        self._misses = 0

    async def connect(self):
        try:
            self._redis = aioredis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2,
            )
            await self._redis.ping()
        except Exception as e:
            self._redis = None
            # Log warning, continue with in-memory fallback

    def _make_key(self, query: str) -> str:
        return f"rag:cache:{hashlib.sha256(query.lower().strip().encode()).hexdigest()}"

    async def get(self, query: str) -> Optional[str]:
        key = self._make_key(query)
        if self._redis:
            try:
                value = await self._redis.get(key)
                if value:
                    self._hits += 1
                    return value
            except Exception:
                pass  # fall through to miss
        self._misses += 1
        return None

    async def set(self, query: str, response: str) -> None:
        key = self._make_key(query)
        if self._redis:
            try:
                await self._redis.setex(key, self.ttl, response)
                return
            except Exception:
                pass
        # Fallback: in-memory with no eviction
        self._fallback[key] = response

    @property
    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{self._hits/total:.1%}" if total else "0.0%",
            "backend": "redis" if self._redis else "memory_fallback",
        }
```

Add to `Settings`:
```python
redis_url: str = "redis://localhost:6379"
```

Render: add Redis add-on (free tier available).

---

#### 2.2 Turso persistence for request log

```python
# app/db.py

import libsql_client
from app.config import get_settings
import json, time, uuid

_client = None

async def get_db():
    global _client
    if _client is None:
        settings = get_settings()
        _client = libsql_client.create_client(
            url=settings.database_url,
            auth_token=settings.database_auth_token,
        )
    return _client

async def log_request(
    *,
    thread_id: str,
    prompt_raw: str,
    prompt_sanitized: str,
    response: str | None,
    model_used: str,
    cached: bool,
    latency_ms: float,
    security_notes: list[str],
    error: str | None,
    request_id: str,
):
    db = await get_db()
    await db.execute(
        """INSERT INTO request_log
           (id, thread_id, prompt_raw, prompt_sanitized, response, model_used,
            cached, latency_ms, security_notes, error, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            request_id,
            thread_id,
            prompt_raw,
            prompt_sanitized,
            response,
            model_used,
            1 if cached else 0,
            latency_ms,
            json.dumps(security_notes),
            error,
            int(time.time() * 1000),
        ]
    )
```

Schema (run once):
```sql
CREATE TABLE IF NOT EXISTS request_log (
    id               TEXT PRIMARY KEY,
    thread_id        TEXT,
    prompt_raw       TEXT NOT NULL,
    prompt_sanitized TEXT,
    response         TEXT,
    model_used       TEXT,
    cached           INTEGER DEFAULT 0,
    latency_ms       REAL,
    security_notes   TEXT,
    error            TEXT,
    timestamp        INTEGER NOT NULL
);
CREATE INDEX idx_request_log_timestamp ON request_log(timestamp DESC);
CREATE INDEX idx_request_log_thread ON request_log(thread_id);
```

Add to Settings:
```python
database_url: str = ""
database_auth_token: str = ""
```

---

### Sprint 3 — True Token Streaming (Ollama native)

Replace `stream_invoke` simulation with real token streaming:

```python
# app/agent.py — true streaming with ChatOllama

from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

class ProductionAgent:
    def __init__(self):
        settings = get_settings()
        self.primary_llm = ChatOllama(
            model=settings.primary_model,
            temperature=0,
            timeout=30,
            streaming=True,   # ← enable streaming
        )
        ...

    async def stream_tokens(
        self,
        message: str,
    ) -> AsyncGenerator[str, None]:
        """Yield raw token strings as they arrive from Ollama."""
        msgs = [HumanMessage(content=message)]
        async for chunk in self.primary_llm.astream(msgs):
            if chunk.content:
                yield chunk.content
```

Update `stream_invoke` to use `stream_tokens`:

```python
async for token in agent.stream_tokens(cleaned_message):
    full_response += token
    yield encoder("token", {"content": token})
```

This delivers real token-by-token streaming. First token appears in ~100ms instead of waiting for full response.

---

### Sprint 4 — Observability Upgrade

---

#### 4.1 OpenTelemetry instrumentation

```python
# app/telemetry.py

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

def setup_telemetry(app, service_name: str, otlp_endpoint: str):
    provider = TracerProvider()
    
    if otlp_endpoint:
        exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
    
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
    
    return trace.get_tracer(service_name)
```

Call from lifespan:
```python
tracer = setup_telemetry(app, "prod-api-rag", settings.otlp_endpoint)
```

Add span context to each request:
```python
with tracer.start_as_current_span("chat_request") as span:
    span.set_attribute("thread_id", body.thread_id)
    span.set_attribute("cached", cached_response is not None)
    # ... rest of request handling
```

Add to Settings:
```python
otlp_endpoint: str = ""   # empty = no export (dev mode)
```

---

#### 4.2 Prometheus metrics endpoint

Replace in-memory `MetricsCollector` with Prometheus client:

```python
# app/monitoring.py — add Prometheus

from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

REQUEST_COUNT    = Counter("chat_requests_total", "Total chat requests", ["status", "model", "cached"])
REQUEST_LATENCY  = Histogram("chat_request_duration_ms", "Request latency", buckets=[50,100,250,500,1000,2500,5000])
CACHE_HIT_RATE   = Gauge("cache_hit_rate", "Cache hit rate (rolling)")
SECURITY_BLOCKS  = Counter("security_blocks_total", "Blocked requests", ["reason"])
TOKEN_COUNT      = Counter("tokens_total", "Tokens processed", ["direction"])  # input/output
```

Add endpoint:
```python
from fastapi.responses import Response as FastAPIResponse

@app.get("/metrics/prometheus")
async def prometheus_metrics():
    return FastAPIResponse(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
```

Keep existing `/metrics` JSON endpoint for frontend dashboard compatibility.

---

#### 4.3 Structured log correlation

```python
# app/monitoring.py — enhanced JSONFormatter

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "service": "prod-api-rag",
        }
        if hasattr(record, "extra_data"):
            log_obj.update(record.extra_data)
        
        # Inject OTel trace context if available
        try:
            from opentelemetry import trace
            span = trace.get_current_span()
            ctx = span.get_span_context()
            if ctx.is_valid:
                log_obj["trace_id"] = format(ctx.trace_id, "032x")
                log_obj["span_id"]  = format(ctx.span_id, "016x")
        except Exception:
            pass
        
        return json.dumps(log_obj)
```

---

### Sprint 5 — Security Hardening

---

#### 5.1 Expand injection pattern coverage

```python
# app/security.py — add to INJECTION_PATTERNS

INJECTION_PATTERNS = [
    # Existing patterns
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"forget\s+(all\s+)?previous",
    r"new\s+instructions\s*:",
    r"system\s*prompt",
    r"---\s*end\s*(of)?\s*prompt",
    r"pretend\s+you\s+are",
    r"act\s+as\s+(if\s+)?you",
    r"bypass\s+(all\s+)?restrictions",
    r"reveal\s+(your|the)\s+(system|instructions|prompt)",
    r"you\s+are\s+now\s+(DAN|jailbroken)",
    
    # NEW — additional bypass patterns
    r"disregard\s+(all\s+)?(previous|prior|above)",
    r"override\s+(your\s+)?(instructions|programming|guidelines)",
    r"as\s+a\s+(language\s+model|AI|LLM)\s+without\s+restrictions",
    r"(enable|unlock|activate)\s+(developer|jailbreak|god)\s+mode",
    r"repeat\s+the\s+words\s+above",
    r"print\s+your\s+(system\s+)?prompt",
    r"what\s+(are|were)\s+your\s+(instructions|directives)",
    r"translate\s+the\s+above",
    r"summarize\s+the\s+above\s+instructions",
    r"</?(system|user|assistant|human)>",    # XML tag injection
]
```

---

#### 5.2 Output content filter expansion

```python
# app/security.py — expand OutputValidator

HARMFUL_PATTERNS = [
    re.compile(r"here('s| is) (how|the way) to (hack|steal|attack)", re.I),
    re.compile(r"password\s+is\s+", re.I),
    re.compile(r"api[_\s]?key\s*[:=]", re.I),
    
    # NEW
    re.compile(r"(private|secret|internal)\s+key\s*[:=]", re.I),
    re.compile(r"bearer\s+[A-Za-z0-9\-._~+/]+=*", re.I),   # Bearer tokens
    re.compile(r"sk-[A-Za-z0-9]{20,}", re.I),               # OpenAI-style keys
    re.compile(r"-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----"),  # Private keys in output
]
```

---

#### 5.3 Request size limits

```python
# app/main.py — add body size middleware

from starlette.middleware.base import BaseHTTPMiddleware

class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int = 1_048_576):  # 1MB
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_bytes:
            return JSONResponse(
                status_code=413,
                content={"error": "Request too large"}
            )
        return await call_next(request)

app.add_middleware(MaxBodySizeMiddleware, max_bytes=1_048_576)
```

---

### Sprint 6 — Deployment Hardening

---

#### 6.1 Multi-worker safe config

```python
# app/config.py

class Settings(BaseSettings):
    ...
    # Worker config
    workers: int = 1              # override to 4 in production
    worker_timeout: int = 30
    
    # Connection pool sizes (per worker)
    redis_pool_size: int = 10
    db_pool_size: int = 5
```

---

#### 6.2 Graceful shutdown

```python
# app/main.py — inside lifespan

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    ...
    await cache.connect()
    await db_init()
    
    yield  # Running
    
    # Graceful shutdown — wait for in-flight requests
    logger.info("Graceful shutdown initiated...")
    if cache._redis:
        await cache._redis.close()
    if _db_client:
        await _db_client.close()
    logger.info("Shutdown complete", extra={"extra_data": metrics.summary})
```

---

#### 6.3 Update Dockerfile for production

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN useradd --create-home appuser && chown appuser:appuser /app
RUN pip install uv

COPY --chown=appuser:appuser pyproject.toml uv.lock* ./
USER appuser

RUN uv sync --frozen --no-dev

COPY --chown=appuser:appuser app/ app/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD python -c "import httpx; r=httpx.get('http://localhost:8000/health',timeout=5); exit(0 if r.json()['status']=='healthy' else 1)" || exit 1

# Production: multiple workers + proper timeout
CMD [".venv/bin/uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", \
     "--timeout-keep-alive", "30", \
     "--access-log"]
```

---

#### 6.4 Update render.yml

```yaml
services:
  - type: web
    name: production-langgraph-api
    runtime: python
    region: oregon
    plan: starter         # upgrade from free — free tier spins down
    buildCommand: pip install uv && uv sync --frozen --no-dev
    startCommand: uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2
    envVars:
      - key: APP_ENV
        value: production
      - key: REDIS_URL
        fromService:
          type: redis        # Render Redis add-on
          name: rag-cache
          property: connectionString
      - key: DATABASE_URL
        sync: false
      - key: DATABASE_AUTH_TOKEN
        sync: false
      - key: OLLAMA_BASE_URL
        sync: false
      - key: LANGCHAIN_API_KEY
        sync: false
      - key: ALLOWED_ORIGINS
        value: "https://your-app.vercel.app"
      - key: OTLP_ENDPOINT
        sync: false         # Grafana Cloud / Datadog
    healthCheckPath: /health
    autoDeploy: true

databases:
  - name: rag-cache
    type: redis
    plan: free
```

---

### Sprint 7 — New Endpoints for Frontend

---

#### 7.1 SSE metrics stream endpoint

```python
# app/main.py

@app.get("/metrics/stream")
async def metrics_stream():
    """Push metrics every 5s over SSE."""
    async def generator():
        encoder = lambda event, data: f"event: {event}\ndata: {json.dumps(data)}\n\n"
        while True:
            yield encoder("metrics", metrics.summary)
            yield encoder("health", {
                "status": "healthy",
                "checks": {"agent": agent is not None, "cache": cache is not None},
            })
            yield encoder("cache", cache.stats)
            await asyncio.sleep(5)
    
    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

---

#### 7.2 Request log endpoint (replay infrastructure)

```python
# app/main.py

@app.get("/requests")
async def list_requests(
    limit: int = 20,
    offset: int = 0,
    thread_id: str | None = None,
):
    """List recent requests for replay UI."""
    db = await get_db()
    query = "SELECT * FROM request_log"
    params = []
    if thread_id:
        query += " WHERE thread_id = ?"
        params.append(thread_id)
    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    result = await db.execute(query, params)
    return {"requests": [dict(row) for row in result.rows]}


@app.get("/requests/{request_id}")
async def get_request(request_id: str):
    """Get single request detail."""
    db = await get_db()
    result = await db.execute(
        "SELECT * FROM request_log WHERE id = ?", [request_id]
    )
    if not result.rows:
        raise HTTPException(status_code=404, detail="Request not found")
    return dict(result.rows[0])


@app.post("/requests/{request_id}/replay")
async def replay_request(request_id: str, request: Request, body: dict = {}):
    """Re-run a stored request through the full pipeline."""
    db = await get_db()
    result = await db.execute(
        "SELECT prompt_raw FROM request_log WHERE id = ?", [request_id]
    )
    if not result.rows:
        raise HTTPException(status_code=404, detail="Request not found")
    
    original_prompt = result.rows[0][0]
    # Replay through /chat SSE endpoint
    return await chat(request, ChatRequest(message=original_prompt))
```

---

## Dependencies to Add

```toml
# pyproject.toml additions

[project]
dependencies = [
    # Existing
    "fastapi>=0.136.3",
    "langchain-ollama>=1.1.0",
    "langgraph>=1.2.2",
    "langsmith>=0.8.7",
    "pydantic-settings>=2.14.1",
    "python-dotenv>=1.2.2",
    "slowapi>=0.1.9",
    "uvicorn>=0.48.0",
    
    # Sprint 0
    "httpx>=0.28.0",               # Ollama health check, replaces requests

    # Sprint 2
    "redis[asyncio]>=5.0.0",       # Redis cache backend
    "libsql-client>=0.3.0",        # Turso/libSQL client
    
    # Sprint 4
    "opentelemetry-api>=1.24.0",
    "opentelemetry-sdk>=1.24.0",
    "opentelemetry-exporter-otlp-proto-http>=1.24.0",
    "opentelemetry-instrumentation-fastapi>=0.45b0",
    "opentelemetry-instrumentation-httpx>=0.45b0",
    "prometheus-client>=0.20.0",
]
```

---

## Environment Variables — Complete Set

```env
# Core
APP_ENV=production
LOG_LEVEL=INFO
ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:3000

# LLM
OLLAMA_BASE_URL=https://your-ollama-instance.com
PRIMARY_MODEL=llama3
FALLBACK_MODEL=mistral
MAX_RETRIES=3

# Rate limiting
RATE_LIMIT=20/minute

# Cache
REDIS_URL=redis://...                 # from Render Redis add-on
CACHE_TTL_SECONDS=300

# Database (Turso)
DATABASE_URL=libsql://...turso.io
DATABASE_AUTH_TOKEN=...

# LangSmith
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=...
LANGCHAIN_PROJECT=production-api

# Observability
OTLP_ENDPOINT=https://...            # Grafana Cloud / Datadog / Jaeger
```

---

## Execution Order

```
Sprint 0  CORS + request_id + real health check + IP fix    ← 1 day. Unblocks frontend.
Sprint 1  Streaming endpoint + graph_node events            ← 2 days. Core AI experience.
Sprint 2  Redis cache + Turso request_log                   ← 1 day. Persistence.
Sprint 3  True token streaming via Ollama astream()         ← 1 day. Real-time feel.
Sprint 4  OTel + Prometheus metrics stream                  ← 1 day. Observability.
Sprint 5  Security hardening                                ← 1 day. Production safety.
Sprint 6  Multi-worker Docker + render.yml upgrade          ← 0.5 day. Deploy hardening.
Sprint 7  /requests + /requests/replay + /metrics/stream    ← 1 day. Frontend API surface.
```

**Total: ~8.5 developer-days to production-ready.**

---

## Files Changed Per Sprint

| Sprint | Files Modified | Files Created |
|---|---|---|
| 0 | main.py, agent.py, config.py | middleware.py |
| 1 | main.py, agent.py, models.py | — |
| 2 | main.py, cache.py, config.py | db.py |
| 3 | agent.py | — |
| 4 | monitoring.py, main.py, config.py | telemetry.py |
| 5 | security.py, main.py | — |
| 6 | Dockerfile, render.yml, config.py | — |
| 7 | main.py, models.py | — |

**No file deletions. Every sprint is additive.  
No breaking changes to existing `/health`, `/metrics`, `/cache/stats` endpoints.**
