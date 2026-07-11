
with open(r"c:\Users\pande\Interview_Coach\backend\app\agents\graph.py", "r", encoding="utf-8") as f:
    content = f.read()

# Fix all occurrences of ', technical)'
fixed_content = content.replace(", technical)", ', "technical")')

with open(r"c:\Users\pande\Interview_Coach\backend\app\agents\graph.py", "w", encoding="utf-8") as f:
    f.write(fixed_content)

print("Final fix applied!")
