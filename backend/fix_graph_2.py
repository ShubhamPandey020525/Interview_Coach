
with open(r"c:\Users\pande\Interview_Coach\backend\app\agents\graph.py", "r", encoding="utf-8") as f:
    content = f.read()

# Now let's replace the problematic parts
# Replace line 32: return state.get("next_agent", "technical") → "technical" is okay
# Wait no, let's look for any occurrence of ", technical)" (without quotes)
content = content.replace('get("next_agent", technical)', 'get("next_agent", "technical")')
content = content.replace('get("current_stage", technical)', 'get("current_stage", "technical")')

with open(r"c:\Users\pande\Interview_Coach\backend\app\agents\graph.py", "w", encoding="utf-8") as f:
    f.write(content)

print("Fix applied!")
print(content)
