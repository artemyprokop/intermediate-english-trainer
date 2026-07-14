import json
import os
import sys
import io
import re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

sys.path.insert(0, os.path.dirname(__file__))
from parse_unit import parse_unit

VOCAB_DIR = r"c:\PersonalProjects\IntermediateEnglishTrainer\Vocabulary"
DATA_DIR = r"c:\PersonalProjects\IntermediateEnglishTrainer\data"

os.makedirs(DATA_DIR, exist_ok=True)

files = os.listdir(VOCAB_DIR)

unit_file_map = {}
for f in files:
    m = re.search(r'Unit(\d+)', f)
    if m:
        unit_file_map[int(m.group(1))] = f

summary = []
all_issues = []

for unit_num in range(1, 17):
    fname = unit_file_map.get(unit_num)
    if not fname:
        summary.append((unit_num, None, 0, ['FILE NOT FOUND']))
        continue
    path = os.path.join(VOCAB_DIR, fname)
    entries, issues = parse_unit(path, unit_num)
    out_path = os.path.join(DATA_DIR, f'unit{unit_num:02d}.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    summary.append((unit_num, fname, len(entries), issues))
    all_issues.extend(issues)

print(f"{'Unit':<6}{'File':<45}{'Words':<8}{'Issues'}")
total = 0
for unit_num, fname, count, issues in summary:
    total += count
    print(f"{unit_num:<6}{(fname or '-'):<45}{count:<8}{len(issues)}")
print(f"\nTOTAL words: {total}")
print(f"TOTAL issues: {len(all_issues)}")

issues_path = os.path.join(DATA_DIR, 'parse-issues.md')
with open(issues_path, 'w', encoding='utf-8') as f:
    f.write('# Проблемные записи при парсинге\n\n')
    if not all_issues:
        f.write('Проблем не обнаружено.\n')
    else:
        for issue in all_issues:
            f.write(f"- Unit {issue['unit']}: `{issue['word']}` — {issue['reason']}\n")

print(f"\nIssues written to {issues_path}")
