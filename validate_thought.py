#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'thought.json')

def fail(msg: str):
    print(f"ERROR: {msg}")
    sys.exit(1)

if not path.exists():
    fail(f"{path} not found")

with path.open('r', encoding='utf-8') as f:
    data = json.load(f)

sections = data.get('sections')
summary = data.get('summary', '')

if not isinstance(sections, list):
    fail('sections is not a list')

count = len(sections)
print(f"Sections: {count}")
print(f"Summary length: {len(summary)}")

if count < 3:
    fail(f"thought.json only has {count} sections (minimum 3)")

expected = [
    '今天的世界',
    'AI前沿',
    '国内热点',
    '国际动态',
    '商业实战',
    '明一的思考',
]
headings = [s.get('heading', '') for s in sections]
print('Headings:')
for h in headings:
    print(f" - {h}")

if count >= 6 and headings[:6] != expected:
    fail('first 6 headings do not match required six-section order')

if len(summary) > 150:
    print(f"WARNING: summary is {len(summary)} chars (should be under 100)")

markdown_h3_count = 0
bold_count = 0
code_count = 0

for idx, section in enumerate(sections, start=1):
    content = section.get('content', '')
    heading = section.get('heading', f'section-{idx}')
    if not isinstance(content, str) or not content.strip():
        fail(f"section {idx} ({heading}) has empty content")

    if re.search(r'(^|\n)###\s+', content):
        markdown_h3_count += 1
    if '**' in content:
        bold_count += 1
    if '`' in content:
        code_count += 1

if markdown_h3_count == 0:
    fail('no section content contains markdown ### subheadings')
if bold_count == 0:
    fail('no section content contains markdown bold emphasis **...**')
if code_count == 0:
    print('WARNING: no section content contains markdown code spans `...`')

print(f"Markdown sections with ###: {markdown_h3_count}")
print(f"Sections with bold emphasis: {bold_count}")
print(f"Sections with code spans: {code_count}")
print('VALID')
