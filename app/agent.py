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
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from langsmith import traceable

from app.config import get_settings


# === Agent State ===
class AgentState(TypedDict):
    """
    State for the production agent.
    Uses Annotated with add_messages reducer for message accumulation.
    """
    messages: Annotated[list[BaseMessage], add_messages]
    error: Optional[str]
    retry_count: int
    model_used: str
    
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

        async def process_message(state: AgentState) -> dict:
            """Try to process the message with the primary model."""
            try:
                content = ""
                async for chunk in self.primary_llm.astream(state["messages"]):
                    content += chunk.content
                
                response = AIMessage(content=content)
                return {
                    "messages": [response],
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
            """Fallback to secondary model."""
            try:
                content = ""
                async for chunk in self.fallback_llm.astream(state["messages"]):
                    content += chunk.content
                
                response = AIMessage(content=content)
                return {
                    "messages": [response],
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

        graph.add_node("process", process_message)
        graph.add_node("fallback", try_fallback)
        graph.add_node("error", handle_error)

        graph.add_edge(START, "process")
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
    def invoke(self, message: str) -> dict:
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
            "error": None,
            "retry_count": 0,
            "model_used": "",
        }))

        return {
            "response": result["messages"][-1].content,
            "model_used": result.get("model_used", "unknown"),
            "error": result.get("error"),
        }

    async def astream_run(self, message: str) -> AsyncGenerator[dict, None]:
        """
        Execute the agent graph asynchronously and stream intermediate nodes and tokens.
        Yields dicts containing 'event' and 'data'.
        """
        input_state = {
            "messages": [HumanMessage(content=message)],
            "error": None,
            "retry_count": 0,
            "model_used": "",
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

            elif node_name and node_name in ["process", "fallback", "error"]:
                fe_node = "llm_primary" if node_name == "process" else ("llm_fallback" if node_name == "fallback" else "error_handler")
                
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
                    
                    # Safety fallback: if no tokens were emitted and node completed successfully, yield full text response
                    if status == "done" and not tokens_emitted:
                        node_response = ""
                        if isinstance(output, dict) and "messages" in output and output["messages"]:
                            last_msg = output["messages"][-1]
                            if hasattr(last_msg, "content"):
                                node_response = last_msg.content
                            elif isinstance(last_msg, dict) and "content" in last_msg:
                                node_response = last_msg["content"]
                        
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