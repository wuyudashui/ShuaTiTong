# 题库内容块格式设计方案

## 1. 动机

当前题库 JSON 格式中，题目和选项以纯字符串存储。当包含 LaTeX 公式时，需要转义反斜杠（如 `\frac` → `\\frac`），导致 JSON 原始文件可读性极差，且无法区分文本、公式、图片等不同类型的内容。

需要一种结构化的内容表达方式，既能容纳公式渲染需求，又能保持向后兼容。

## 2. ContentBlock 类型定义

```typescript
// 内容块类型
export type ContentBlock =
  | { t: 'text';  c: string }                              // 纯文本
  | { t: 'f';     c: string; d?: boolean }                  // LaTeX 公式
  | { t: 'code';  c: string }                               // 代码块
  | { t: 'image'; c: string; alt?: string };                // 图片
```

| 类型 | t 值 | 字段 | 说明 |
|------|------|------|------|
| 文本 | `text` | `c` | 纯文本，转义后直接输出 |
| 公式 | `f` | `c` = LaTeX 源码, `d` = 是否块级显示 | 调用 KaTeX 渲染 |
| 代码 | `code` | `c` | 包裹 `<pre><code>` |
| 图片 | `image` | `c` = URL, `alt` = 替代文本 | 输出 `<img>` |

使用短字段名（`t`/`c`/`d`）以减少 JSON 体积。

## 3. Question 接口变更

```typescript
export interface Question {
  id: number;
  type: QuestionType;
  question: ContentBlock[] | string;          // ← 改
  options: Record<string, ContentBlock[] | string>;  // ← 改
  answer: string;
  difficulty: Difficulty;
  explanation: string;
  simpleExplanation?: string;
}
```

`question` 和 `options` 值同时接受 `ContentBlock[]`（新格式）和 `string`（旧格式），实现**完全向后兼容**。

### 示例（纯文本题目）

```json
{
  "id": 1,
  "type": "single",
  "question": [{ "t": "text", "c": "在数据管理技术的发展过程中，经历了人工管理阶段、文件系统阶段和数据库系统阶段。在这几个阶段中，数据独立性最高的是__阶段。" }],
  "options": {
    "A": [{ "t": "text", "c": "数据库系统" }],
    "B": [{ "t": "text", "c": "文件系统" }],
    "C": [{ "t": "text", "c": "人工管理" }],
    "D": [{ "t": "text", "c": "数据项管理" }]
  },
  "answer": "A",
  "difficulty": "中",
  "explanation": ""
}
```

### 示例（含公式题目）

```json
{
  "id": 100,
  "type": "single",
  "question": [
    { "t": "text", "c": "已知" },
    { "t": "f", "c": "f(x) = \\int_{0}^{x} e^{-t^2} dt" },
    { "t": "text", "c": "，求" },
    { "t": "f", "c": "f'(1)" },
    { "t": "text", "c": "。" }
  ],
  "options": {
    "A": [{ "t": "f", "c": "e^{-1}" }],
    "B": [{ "t": "f", "c": "e^{-1} + 1" }],
    "C": [{ "t": "f", "c": "2e^{-1}" }],
    "D": [{ "t": "f", "c": "0" }]
  },
  "answer": "A",
  "difficulty": "中"
}
```

## 4. 渲染层改造

### 4.1 format.ts

新增 `renderBlocks()` 函数，支持按类型分发渲染：

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

改造 `renderText()` 接受联合类型，内部判断数组则走块渲染，字符串则走原逻辑：

```typescript
export function renderText(str: ContentBlock[] | string): string {
  if (Array.isArray(str)) return renderBlocks(str);
  // ... 原有字符串正则处理逻辑不变 ...
}
```

### 4.2 改动范围

| 文件 | 改动 |
|------|------|
| `src/types.ts` | 新增 `ContentBlock` 类型；`Question.question` 和 `options` 改为联合类型 |
| `src/format.ts` | 新增 `renderBlocks()`；`renderText()` 入参重载；`autoExplanation()` 兼容块格式 |
| `src/renderers/*.ts` | 无改动（已调用 `renderText()`） |
| `src/main.ts` | 无改动（已调用 `renderText(q.question)`） |
| `shuatitong.html` | 无改动（不包含渲染逻辑的副本） |

## 5. Excel 转换工具

### 5.1 技术选型

- 语言：Python 3
- 依赖：openpyxl（已安装 3.1.5）

### 5.2 输入输出

- 输入：`题库文件/数据库.xlsx`
- 输出：`题库文件/数据库.json`

### 5.3 字段映射

| Excel 列 | 字段 | 映射规则 |
|----------|------|----------|
| A: 题干 | `question` | `cell_to_blocks()`, 含 `$...$` 时自动切分 |
| B: 题型 | `type` | `单选题→single`, `判断题→judge`, `多选题→multi` |
| C-J: 选项 A-H | `options.A/B/...` | `cell_to_blocks()`, 过滤空选项 |
| K: 正确答案 | `answer` | 判断题将"正确/错误"映射为 A/B |
| N: 难度 | `difficulty` | `适中→中`, `简单→易`, `困难→难` |
| L: 解析 | `explanation` | 原样传入 |

### 5.4 `cell_to_blocks()` 核心逻辑

```python
import re

def cell_to_blocks(text):
    """将单元格文本转为 ContentBlock 列表"""
    if not text or not str(text).strip():
        return None
    text = str(text).strip()

    # 检测 LaTeX 公式 $$...$$ 和 $...$
    parts = re.split(r'(\$\$[^$]+\$\$|\$[^$]+\$)', text)
    if len(parts) == 1:
        return [{"t": "text", "c": text}]

    blocks = []
    for part in parts:
        if part.startswith('$$') and part.endswith('$$'):
            blocks.append({"t": "f", "c": part[2:-2].strip(), "d": True})
        elif part.startswith('$') and part.endswith('$'):
            blocks.append({"t": "f", "c": part[1:-1].strip()})
        elif part:
            blocks.append({"t": "text", "c": part})
    return blocks
```

## 6. 向后兼容

- 旧 JSON 文件（纯字符串格式）**无需修改**，应用直接加载
- 类型系统使用联合类型自动适配
- `renderText()` 运行时类型检测决定处理路径
- 转换工具输出的 JSON 使用新格式，与旧文件共存

## 7. 实施顺序

1. 更新 `types.ts`：添加 `ContentBlock` 类型，修改 `Question` 接口
2. 更新 `format.ts`：实现 `renderBlocks()`，改造 `renderText()` 和 `autoExplanation()`
3. 验证：加载旧 JSON 文件确认无回归
4. 编写 Python 转换脚本 `excel2json.py`
5. 运行转换脚本生成 `数据库.json`
6. 加载新 JSON 到应用验证渲染正确
