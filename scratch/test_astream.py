import asyncio
import sys
import os

# Add workspace root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.agent import ProductionAgent

async def main():
    agent = ProductionAgent()
    log_file = os.path.join(os.path.dirname(__file__), "astream_test.log")
    
    with open(log_file, "w", encoding="utf-8") as f:
        f.write("Starting astream_run test in RAG mode...\n")
        try:
            async for event in agent.astream_run("Hello, who is Charlotte?", mode="rag"):
                f.write(f"\nEVENT: {event['event']}\n")
                if "data" in event:
                    data = event["data"]
                    f.write(f"DATA KEYS: {list(data.keys())}\n")
                    if "node" in data:
                        f.write(f"NODE: {data['node']}, STATUS: {data.get('status')}\n")
                    if "content" in data:
                        f.write(f"CONTENT: {data['content']}\n")
                    # If it's a raw langchain event, we want to inspect the output of on_chain_end
                # Let's run a raw graph astream_events to inspect the raw LangGraph output structure
            f.write("\nFinished graph execution.\n")
        except Exception as e:
            f.write(f"ERROR: {e}\n")
            import traceback
            traceback.print_exc(file=f)

if __name__ == "__main__":
    asyncio.run(main())
