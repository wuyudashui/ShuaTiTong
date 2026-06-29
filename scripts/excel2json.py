#!/usr/bin/env python3
"""Convert Excel question bank to structured JSON format with ContentBlock[]."""

import html
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("openpyxl not found. Install: pip install openpyxl")
    sys.exit(1)


TYPE_MAP = {
    '单选题': 'single',
    '判断题': 'judge',
    '多选题': 'multi',
    '填空题': 'fill',
}

DIFFICULTY_MAP = {
    '简单': '易',
    '适中': '中',
    '困难': '难',
}

ANSWER_MAP = {
    '正确': 'A',
    '错误': 'B',
}


def cell_to_blocks(text):
    """Convert cell text to ContentBlock list. Detects LaTeX $$...$$ and $...$."""
    if not text:
        return None
    text = str(text).strip()
    if not text:
        return None

    # Quick check: no $ sign means pure text
    if '$' not in text:
        return [{"t": "text", "c": text}]

    # Split by $$...$$ and $...$ (non-greedy inner match for inline $)
    parts = re.split(r'(\$\$[^$]+\$\$|\$[^$]+?\$)', text)
    blocks = []
    for part in parts:
        if part.startswith('$$') and part.endswith('$$'):
            blocks.append({"t": "f", "c": html.unescape(part[2:-2].strip()), "d": True})
        elif part.startswith('$') and part.endswith('$'):
            blocks.append({"t": "f", "c": html.unescape(part[1:-1].strip())})
        elif part:
            blocks.append({"t": "text", "c": part})
    return blocks


def normalize_answer(answer, qtype):
    """Normalize answer field: convert Chinese booleans for judge type."""
    if not answer:
        return ''
    answer = str(answer).strip()
    if qtype == 'judge':
        return ANSWER_MAP.get(answer, answer)
    return answer


def excel_to_json(excel_path, output_path=None):
    """Convert Excel file to structured JSON question bank."""
    wb = openpyxl.load_workbook(excel_path)
    ws = wb.active

    questions = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 1):
        stem, qtype = row[0], row[1]
        options_raw = row[2:10]  # columns A-H
        answer = row[10] if len(row) > 10 else None
        explanation = str(row[11]).strip() if len(row) > 11 and row[11] else ''
        difficulty = row[13] if len(row) > 13 else None

        if not stem or not qtype:
            continue

        qtype = qtype.strip()
        mapped_type = TYPE_MAP.get(qtype)
        if mapped_type is None:
            print(f"Row {i}: unknown type '{qtype}', skipping", file=sys.stderr)
            continue

        option_keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        options = {}
        for k, val in zip(option_keys, options_raw):
            block = cell_to_blocks(val)
            if block:
                options[k] = block

        question = {
            "id": i,
            "type": mapped_type,
            "question": cell_to_blocks(stem),
            "options": options,
            "answer": normalize_answer(answer, mapped_type),
            "difficulty": DIFFICULTY_MAP.get(difficulty.strip(), '中') if difficulty else '中',
            "explanation": explanation,
        }
        questions.append(question)

    if output_path is None:
        stem = Path(excel_path).stem
        output_path = Path(excel_path).parent / f'{stem}.json'

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"Converted {len(questions)} questions → {output_path}")
    return questions


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python scripts/excel2json.py <excel_path> [output_path]")
        sys.exit(1)
    excel_to_json(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
