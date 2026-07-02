import type { Question, ContentBlock, QuestionType, Difficulty } from '../types';

const TYPE_MAP: Record<string, QuestionType> = {
  '单选题': 'single', '单选': 'single',
  '判断题': 'judge', '判断': 'judge',
  '多选题': 'multi', '多选': 'multi',
  '填空题': 'fill', '填空': 'fill',
};

const DIFFICULTY_MAP: Record<string, Difficulty> = {
  '简单': '易', '易': '易',
  '适中': '中', '中': '中',
  '困难': '难', '难': '难',
};

const JUDGE_ANSWER_MAP: Record<string, string> = {
  '正确': 'A', '对': 'A', 'true': 'A', 'T': 'A',
  '错误': 'B', '错': 'B', 'false': 'B', 'F': 'B',
};

function decodeEntities(text: string): string {
  // Only available in browser context, so do it manually
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function norm(val: unknown): string {
  if (val == null) return '';
  return String(val).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}


function normDecode(val: unknown): string {
  return decodeEntities(norm(val));
}

function cellToBlocks(text: string): ContentBlock[] {
  // Auto-detect LaTeX $$...$$ and $...$ 
  if (text.includes('$')) {
    const parts = text.split(/(\$\$[^$]+\$\$|\$[^$]+?\$)/);
    const blocks: ContentBlock[] = [];
    for (const part of parts) {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        blocks.push({ t: 'f', c: part.slice(2, -2).trim(), d: true });
      } else if (part.startsWith('$') && part.endsWith('$')) {
        blocks.push({ t: 'f', c: part.slice(1, -1).trim() });
      } else if (part) {
        blocks.push({ t: 'text', c: part });
      }
    }
    return blocks.length > 0 ? blocks : [{ t: 'text', c: text }];
  }
  return [{ t: 'text', c: text }];
}

function textBlock(text: string): ContentBlock[] {
  return [{ t: 'text', c: text }];
}

export async function parseExcel(buffer: ArrayBuffer): Promise<Question[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const header = (rows[0] || []).map((h: any) => norm(h).replace(/[\s\n]/g, ''));

  const idx = (...keywords: string[]): number => {
    for (let i = 0; i < header.length; i++) {
      if (keywords.some(k => header[i].includes(k))) return i;
    }
    return -1;
  };

  const colStem = idx('题干', '题目', '问题');
  const colType = idx('题型', '类型');
  let colAns = idx('正确答案', '答案');
  const colDiff = idx('难度');
  const colExp = idx('解析');
  const optCols: Record<string, number> = {};
  // Try matching "选项A", "选项B" first (standard template)
  'ABCDEFGH'.split('').forEach(k => {
    const ci = idx('选项' + k);
    if (ci >= 0) optCols[k] = ci;
  });
  // Fallback: match "A", "B", "C", "D" directly (simple template like 1单项选择.xlsx)
  if (Object.keys(optCols).length === 0) {
    // Only match single-letter columns that appear after stem and before answer
    'ABCDEFGH'.split('').forEach(k => {
      const ci = idx(k);
      if (ci >= 0 && ci !== colStem && ci !== colType && ci !== colAns && ci !== colDiff) {
        optCols[k] = ci;
      }
    });
  }

  // Check if any opt column actually contains multi-choice answers instead of option text
  // (e.g. 3多项选择.xlsx where column 'E' is the answer key, not option E)
  if (colAns < 0) {
    const letterKeys = Object.keys(optCols).filter(k => /^[A-H]$/.test(k)).sort();
    if (letterKeys.length > 0) {
      // Check the first data row for this heuristic
      let colToRemove: string | null = null;
      for (let r = 1; r < Math.min(3, rows.length); r++) {
        const row = rows[r];
        if (!row) continue;
        for (const k of letterKeys) {
          const val = norm(row[optCols[k]] || '');
          if (/^[A-H]{2,}$/.test(val)) {
            colToRemove = k;
            break;
          }
        }
        if (colToRemove) break;
      }
      if (colToRemove) {
        colAns = optCols[colToRemove];
        delete optCols[colToRemove];
      }
    }
  }

  // Detect fill-specific format (columns named "空1", "空2" etc. without 题型 column)
  const blankCols: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    const m = header[i].match(/^空(\d+)$/);
    if (m) blankCols['空' + m[1]] = i;
  }
  const isFillFormat = Object.keys(blankCols).length > 0 && colType < 0;

  // Detect judge-specific format (has 答案 column but no option columns and no 题型)
  // Judge-only files like 2判断题.xlsx have header: ['题干', '答案', '难度', ...]
  const isJudgeFormat = colType < 0 && colAns >= 0 && colStem >= 0 && !isFillFormat && Object.keys(optCols).length === 0;

  if (colStem < 0) return [];

  const questions: Question[] = [];
  let id = 1;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !norm(row[colStem])) continue;

    const stem = normDecode(row[colStem]);

    // Determine type
    let qtype: QuestionType;
    let rawType = '';
    if (isFillFormat) {
      qtype = 'fill';
    } else if (isJudgeFormat) {
      qtype = 'judge';
    } else {
      rawType = colType >= 0 ? normDecode(row[colType]) : '';
      qtype = TYPE_MAP[rawType] || 'single';
    }

    const options: Record<string, ContentBlock[]> = {};
    if (isFillFormat || qtype === 'fill') {
      // Fill format: use blank columns for answers
      if (isFillFormat) {
        Object.entries(blankCols).forEach(([k, ci]) => {
          if (normDecode(row[ci])) options[k] = cellToBlocks(normDecode(row[ci]));
        });
      } else {
        // Standard format: parse answer from answer column
        const ansRaw = colAns >= 0 ? norm(row[colAns]) : '';
        ansRaw.split(/[,，]/).forEach(pair => {
          const parts = pair.split('=');
          if (parts.length === 2) {
            const bk = parts[0].trim();
            const bv = parts[1].trim();
            if (bk && bv) options[bk] = textBlock(bv);
          }
        });
      }
    } else if (qtype === 'judge') {
      options['A'] = textBlock('正确');
      options['B'] = textBlock('错误');
    } else {
      'ABCDEFGH'.split('').forEach(k => {
        const ci = optCols[k];
        if (ci !== undefined && norm(row[ci])) {
          options[k] = cellToBlocks(norm(row[ci]));
        }
      });
    }

    let answer = '';
    if (isFillFormat) {
      // Fill format: answer comes from blank columns
      answer = Object.entries(blankCols).map(([k, ci]) => normDecode(row[ci])).filter(Boolean).join('、');
    } else {
      answer = colAns >= 0 ? normDecode(row[colAns]) : '';
      if (qtype === 'judge') {
        // Map Y/N to A/B as well
        if (answer === 'Y' || answer === 'y') answer = '正确';
        if (answer === 'N' || answer === 'n') answer = '错误';
        answer = JUDGE_ANSWER_MAP[answer] || answer;
      } else {
        answer = answer.toUpperCase();
      }
    }

    questions.push({
      id: id++,
      type: qtype,
      question: cellToBlocks(stem),
      options,
      answer,
      difficulty: (colDiff >= 0 ? DIFFICULTY_MAP[norm(row[colDiff])] : undefined) || '中',
      explanation: colExp >= 0 ? norm(row[colExp]) : '',
    });
  }

  // Post-processing: detect multi-choice questions by answer pattern
  for (const q of questions) {
    if (q.type !== 'fill' && q.type !== 'judge' && /^[A-H]{2,}$/.test(q.answer)) {
      (q as any).type = 'multi';
    }
  }
  return questions;
}
