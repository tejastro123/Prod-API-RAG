"""
API Request and Response Models
Pydantic models for input validation and response structure.
"""

from pydantic import BaseModel, Field
from datetime import datetime, timezone


class ChatRequest(BaseModel):
    """Incoming chat request."""
    message: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="The user's message to the agent",
    )
    thread_id: str = Field(default="default", description="Conversation thread ID")
    mode: str = Field(default="hybrid", description="Chat mode: 'rag' (search-only), 'hybrid' (RAG+LLM), or 'llm' (LLM-only)")


class ChatResponse(BaseModel):
    """Chat response returned to the client."""
    response: str
    thread_id: str
    model_used: str
    cached: bool = False
    processing_time_ms: float
    security_notes: list[str] = Field(default_factory=list)
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    environment: str
    version: str = "1.1.0"
    checks: dict = {}


class MetricsResponse(BaseModel):
    """Metrics endpoint response."""
    total_requests: int
    total_errors: int
    error_rate: str
    avg_latency_ms: float
    cache_hit_rate: str
    total_input_tokens: int
    total_output_tokens: int


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    detail: str | None = None
    request_id: str | None = None

class ThreadModel(BaseModel):
    id: str
    user_id: str
    title: str | None = None
    created_at: int
    updated_at: int
    message_count: int

class MessageModel(BaseModel):
    id: str
    thread_id: str
    role: str
    content: str
    model_used: str | None = None
    cached: bool = False
    processing_time_ms: float | None = None
    security_notes: list[str] | None = None
    created_at: int

class RequestLogModel(BaseModel):
    id: str
    thread_id: str | None = None
    user_id: str | None = None
    prompt_raw: str
    prompt_sanitized: str | None = None
    response: str | None = None
    model_used: str | None = None
    cached: bool | None = None
    latency_ms: float | None = None
    cache_hit: bool | None = None
    security_notes: list[str] | None = None
    error: str | None = None
    timestamp: int