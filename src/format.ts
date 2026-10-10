import type { Question, ContentBlock } from './types';
import katex from 'katex';
import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false });
const formulaDelimiters = [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']] as const;

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderFormula(source: string, display: boolean): string {
  const formula = source.trim();
  const options = { displayMode: display, throwOnError: true, trust: false, strict: 'ignore' as const, maxExpand: 1000 };
  try {
    return katex.renderToString(formula, options);
  } catch {
    // Only repair AI double escapes if the original is invalid and has no matrix environment.
    if (!/\\begin\{/.test(formula)) {
      const repaired = formula.replace(/(^|[^\\])\\\\(?=(?:frac|sqrt|sum|int|prod|left|right|text|mathrm|mathbf|alpha|beta|gamma|theta|pi|infty|cdot|times|leq|geq|neq)\b)/g, '$1\\');
      if (repaired !== formula) { try { return katex.renderToString(repaired, options); } catch { /* Preserve original below. */ } }
    }
    return `<span class="formula-fallback" title="公式暂时无法渲染">${escapeHtml(source)}</span>`;
  }
}

// Parse math before Markdown escapes; fenced and inline code retain their own rules.
markdown.inline.ruler.before('escape', 'math', (state, silent) => {
  for (const [open, close] of formulaDelimiters) {
    if (!state.src.startsWith(open, state.pos)) continue;
    if (open === '$' && (/\s/.test(state.src[state.pos + 1] ?? '') || state.src[state.pos + 1] === '$')) continue;
    let end = state.src.indexOf(close, state.pos + open.length);
    while (end > 0 && state.src[end - 1] === '\\' && close === '$') end = state.src.indexOf(close, end + 1);
    if (end < 0) continue;
    const source = state.src.slice(state.pos + open.length, end);
    if (!source.trim() || (open === '$' && (/\n/.test(source) || /\s$/.test(source)))) continue;
    if (!silent) {
      const token = state.push('math', '', 0);
      token.content = source;
      token.meta = { display: open === '$$' || open === '\\[' };
    }
    state.pos = end + close.length;
    return true;
  }
  return false;
});
markdown.renderer.rules.math = (tokens, index) => renderFormula(tokens[index].content, !!tokens[index].meta?.display);

markdown.block.ruler.before('fence', 'math_block', (state, start, end, silent) => {
  const offset = state.bMarks[start] + state.tShift[start];
  const first = state.src.slice(offset, state.eMarks[start]);
  const open = first.startsWith('$$') ? '$$' : first.startsWith('\\[') ? '\\[' : null;
  if (!open) return false;
  const close = open === '$$' ? '$$' : '\\]';
  let line = start;
  let text = first.slice(open.length);
  while (!text.includes(close) && ++line < end) text += '\n' + state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
  const closing = text.indexOf(close);
  if (closing < 0 || text.slice(closing + close.length).trim()) return false;
  if (silent) return true;
  const token = state.push('math', '', 0);
  token.content = text.slice(0, closing);
  token.meta = { display: true };
  token.block = true;
  state.line = line + 1;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

export function isImageSource(source: string): boolean {
  return /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(source)
    || (!/^[a-z][a-z\d+.-]*:/i.test(source) && !source.startsWith('//') && !/[<>"\x00-\x1f]/.test(source));
}

export function formatExplanation(text: string): string {
  return text ? `<div class="exp-content">${markdown.render(text)}</div>` : '';
}

export function contentBlocksToText(input: ContentBlock[] | string | undefined | null): string {
  if (!input) return '';
  return Array.isArray(input) ? input.map(b => b.c).join('') : input;
}

function contentForExplanation(input: ContentBlock[] | string): string {
  return Array.isArray(input) ? input.map(b => b.t === 'f' ? ` $${b.c}$ ` : b.t === 'code' ? `\n\`\`\`\n${b.c}\n\`\`\`\n` : b.t === 'image' ? (b.alt || '') : b.c).join('') : input;
}

export function autoExplanation(q: Question): string {
  if (q.type === 'fill') return `参考答案：${Object.entries(q.options || {}).map(([k, v]) => `${k}：${contentForExplanation(v)}`).join('；')}`;
  if (q.type === 'judge') return `正确答案是 ${q.answer}（${q.answer === 'A' ? '正确' : '错误'}）`;
  const answers = q.answer.split('').map(key => q.options[key] ? `${key}：${contentForExplanation(q.options[key])}` : key);
  return `正确答案是 ${answers.join('；')}`;
}

export function renderText(input: ContentBlock[] | string): string {
  if (!Array.isArray(input)) return input ? markdown.render(input) : '';
  return input.map(b => {
    switch (b.t) {
      case 'text': return markdown.renderInline(b.c);
      case 'f': return renderFormula(b.c, b.d ?? false);
      case 'code': return `<pre><code>${escapeHtml(b.c)}</code></pre>`;
      case 'image': return isImageSource(b.c) ? `<img src="${escapeHtml(b.c)}" alt="${escapeHtml(b.alt || '')}" loading="lazy">` : '';
    }
  }).join('');
}
