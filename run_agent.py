import json
from app.agent import ProductionAgent

def main():
    agent = ProductionAgent()

    queries = [
        "What is LangGraph in one sentence?",
        "What is 2 + 2?",
        "Explain the difference between RAG and fine-tuning in 2 sentences.",
    ]

    for query in queries:
        print(f"Question: {query}")
        result = agent.invoke(query)
        response_preview = result["response"][:150]
        print(f"Response: {response_preview}")
        print(f"Model:    {result['model_used']}")
        if result.get("error"):
            print(f"Error:    {result['error']}")
        print()

if __name__ == "__main__":
    main()
