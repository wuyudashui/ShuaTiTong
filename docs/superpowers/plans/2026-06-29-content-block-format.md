# Content Block Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce ContentBlock[] format for question/options to support structured content (text, LaTeX, code, image blocks) while maintaining backward compatibility.

**Architecture:** Types-first (types.ts), then rendering logic (format.ts), then conversion tool (Python script).

**Tech Stack:** TypeScript (frontend), Python 3 + openpyxl (conversion)

## Global Constraints

- All existing JSON files must continue to load without modification
- Short field names: `t` for type, `c` for content, `d` for display mode
- renderText() accepts both ContentBlock[] and string
- LaTeX block content passes single backslashes (not JSON-escaped)

---

### Task 1: Update types.ts

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `ContentBlock` type, updated `Question.question` and `Question.options` types

- [ ] Add ContentBlock type before Question interface:

```typescript
export type ContentBlock =
  | { t: 'text';  c: string }
  | { t: 'f';     c: string; d?: boolean }
  | { t: 'code';  c: string }
  | { t: 'image'; c: string; alt?: string };
```

- [ ] Update Question interface fields:

```typescript
export interface Question {
  id: number;
  type: QuestionType;
  question: ContentBlock[] | string;
  options: Record<string, ContentBlock[] | string>;
  answer: string;
  difficulty: Difficulty;
  explanation: string;
  simpleExplanation?: string;
}
```

- [ ] Verify file reads correctly: `npx tsc --noEmit`

---

### Task 2: Update format.ts

**Files:**
- Modify: `src/format.ts`

**Interfaces:**
- Consumes: `ContentBlock` from types.ts
- Produces: `renderText(ContentBlock[] | string): string`, `renderBlocks(ContentBlock[]): string`

- [ ] Add renderBlocks function before renderText:

```typescript
function renderBlocks(blocks: ContentBlock[]): string {
  return blocks.map(b => {
    switch (b.t) {
      case 'text':
        return escapeHtml(b.c).replace(/\n/g, '<br>');
      case 'f':
        try {
          return katex.renderToString(b.c, { displayMode: b.d ?? false, throwOnError: false });
        } catch {
          return `<span class="katex-error">${escapeHtml(b.c)}</span>`;
        }
      case 'code':
        return `<pre><code>${escapeHtml(b.c)}</code></pre>`;
      case 'image':
        return `<img src="${escapeHtml(b.c)}" alt="${escapeHtml(b.alt || '')}" loading="lazy">`;
      default:
        return escapeHtml(b.c);
    }
  }).join('');
}
```

- [ ] Update renderText signature to accept `ContentBlock[] | string`:

```typescript
export function renderText(str: ContentBlock[] | string): string {
  if (Array.isArray(str)) return renderBlocks(str);
  // ... rest unchanged
}
```

- [ ] Update renderText caller in autoExplanation to handle ContentBlock[]:

```typescript
export function autoExplanation(q: Question): string {
  if (q.type === 'fill') { ... }
  if (q.type === 'judge') {
    return `正确答案是 ${q.answer}（${q.answer === 'A' ? '正确' : '错误'}）`;
  }
  const ansOption = q.options ? q.options[q.answer] : '';
  if (!ansOption) return `正确答案是 ${q.answer}`;
  // Render ContentBlock[] or string to display text
  const displayText = Array.isArray(ansOption)
    ? ansOption.map(b => b.c).join('')
    : ansOption;
  return `正确答案是 ${q.answer}：${displayText}`;
}
```

- [ ] Add import for ContentBlock:
```typescript
import type { Question, ContentBlock } from './types';
```

- [ ] Verify: `npx tsc --noEmit`

---

### Task 3: Write Excel conversion script

**Files:**
- Create: `scripts/excel2json.py`

**Interfaces:**
- Consumes: `题库文件/数据库.xlsx`
- Produces: `题库文件/数据库.json`

- [ ] Write the conversion script:

```python
#!/usr/bin/env python3
"""Convert Excel question bank to structured JSON format."""

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

    # Check if contains LaTeX markers
    if '$' not in text:
        return [{"t": "text", "c": text}]

    # Split by $$...$$ and $...$
    parts = re.split(r'(\$\$[^$]+\$\$|\$[^$]+?\$)', text)
    blocks = []
    for part in parts:
        if part.startswith('$$') and part.endswith('$$'):
            blocks.append({"t": "f", "c": part[2:-2].strip(), "d": True})
        elif part.startswith('$') and part.endswith('$'):
            blocks.append({"t": "f", "c": part[1:-1].strip()})
        elif part:
            blocks.append({"t": "text", "c": part})
    return blocks


def normalize_answer(answer, qtype):
    """Normalize answer field."""
    if not answer:
        return ''
    answer = str(answer).strip()
    if qtype == 'judge':
        return ANSWER_MAP.get(answer, answer)
    return answer


def excel_to_json(excel_path, output_path=None):
    """Convert Excel file to JSON question bank."""
    wb = openpyxl.load_workbook(excel_path)
    ws = wb.active

    questions = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 1):
        stem, qtype = row[0], row[1]
        options_raw = row[2:10]  # A-H
        answer = row[10] if len(row) > 10 else None
        difficulty = row[13] if len(row) > 13 else None

        if not stem or not qtype:
            continue

        qtype = qtype.strip()
        mapped_type = TYPE_MAP.get(qtype, 'single')

        # Build options dict, skip None/empty
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
            "explanation": '',
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
```

- [ ] Run on database.xlsx:

```bash
python3 scripts/excel2json.py 题库文件/数据库.xlsx
```

---

### Task 4: Verify in app

- [ ] Start dev server: `npm run dev`
- [ ] Load old JSON file (e.g. data_structures.json) — verify it renders correctly
- [ ] Load new 数据库.json — verify it renders correctly
- [ ] Check all 4 question types render without error
