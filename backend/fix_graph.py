# Utility script to verify that app/agents/graph.py has no syntax/name errors.
import sys

def verify_graph():
    try:
        from app.agents.graph import get_interview_graph
        print("Success: graph.py compiled and imported successfully without any name errors!")
        sys.exit(0)
    except Exception as e:
        print(f"Error importing graph: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    verify_graph()
