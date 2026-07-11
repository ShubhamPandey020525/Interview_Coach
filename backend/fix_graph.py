
with open("backend/app/agents/graph.py", "r") as f:
    content = f.read()

# Replace all occurrences where "technical" is used as a variable (without quotes) in .get() defaults
content = content.replace('"agent_type": merged.get("current_stage", technical)', '"agent_type": merged.get("current_stage", "technical")')
content = content.replace('agent_type = state.get("current_stage", technical)', 'agent_type = state.get("current_stage", "technical")')
content = content.replace('next_agent = route.get("next_agent", technical)', 'next_agent = route.get("next_agent", "technical")')
content = content.replace('return state.get("next_agent", technical)', 'return state.get("next_agent", "technical")')

with open("backend/app/agents/graph.py", "w") as f:
    f.write(content)

print("Fixed!")
