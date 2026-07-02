import type { Question, ContentBlock } from './types';
import katex from 'katex';

/**
 * Convert LLM markdown output into safe HTML for display.
 */
export function formatExplanation(text: string): string {
  if (!text) return '';
  // 1. HTML-escape first (prevent XSS)
  let h = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // 2. Code blocks (```)
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });
  // 3. Headings
  h = h.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  h = h.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^# (.+)$/gm, '<h3>$1</h3>');
  // 4. Horizontal rule
  h = h.replace(/^---$/gm, '<hr>');
  // 5. Bold & italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 6. Inline code
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 7. Ordered lists — process before unordered to prevent the <ul> regex from capturing them
  h = h.replace(/^\d+\.\s(.+)$/gm, '<ol_li>$1</ol_li>');
  h = h.replace(/((?:<ol_li>[\s\S]*?<\/ol_li>\n?)+)/g, (match) => {
    const inner = match.replace(/<ol_li>/g, '<li>').replace(/<\/ol_li>/g, '</li>');
    return '<!--OL-->' + inner + '<!--/OL-->';
  });
  // 8. Unordered lists
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // 9. Restore ordered list blocks
  h = h.replace(/<!--OL-->([\s\S]*?)<!--\/OL-->/g, '<ol>$1</ol>');
  // 10. Blockquote
  h = h.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // 11. Clean <br> after block tags
  h = h.replace(/(<\/(?:li|ul|ol|blockquote|pre|h[34])>)\s*<br>/g, '$1');
  // 12. Double newlines → paragraph breaks
  h = h.replace(/\n\n+/g, '</p><p>');
  // 13. Single newlines → <br>
  h = h.replace(/\n/g, '<br>');
  // 14. Clean <br> after </li> (leftover from step 13)
  h = h.replace(/<\/li><br>/g, '</li>');
  // 15. Wrap in paragraph if not already wrapped by block tags
  if (!h.startsWith('<')) h = '<p>' + h;
  if (!h.endsWith('>')) h = h + '</p>';
  // Clean up nested <p> artifacts
  h = h.replace(/<p><\/p>/g, '');
  h = h.replace(/<\/p><p><\/p><p>/g, '</p><p>');

  return `<div class="exp-content">${h}</div>`;
}

/**
 * Generate an auto explanation string based on the question's answer.
 */
export function autoExplanation(q: Question): string {
  if (q.type === 'fill') {
    const blanks = q.options || {};
    return `参考答案：${Object.entries(blanks).map(([k, v]) => `${k}：${contentBlocksToText(v)}`).join('；')}`;
  }
  if (q.type === 'judge') {
    return `正确答案是 ${q.answer}（${q.answer === 'A' ? '正确' : '错误'}）`;
  }
  const ansOption = q.options ? q.options[q.answer] : '';
  const displayText = Array.isArray(ansOption)
    ? ansOption.map(b => b.c).join('')
    : ansOption;
  return displayText
    ? `正确答案是 ${q.answer}：${displayText}`
    : `正确答案是 ${q.answer}`;
}

/**
 * Convert ContentBlock[] or plain string to plain text (for AI prompts, etc.).
 * Strips all markup — extracts text content only.
 */
export function contentBlocksToText(input: ContentBlock[] | string | undefined | null): string {
  if (!input) return '';
  if (Array.isArray(input)) {
    return input.map(b => b.c).join('');
  }
  return input;
}

/**
 * Render structured content blocks into HTML.
 */
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
        return '';
    }
  }).join('');
}

/**
 * Render question/option text: escape HTML, then process images and KaTeX formulas.
 * Accepts both structured ContentBlock[] and legacy plain text.
 */
export function renderText(str: ContentBlock[] | string): string {
  if (Array.isArray(str)) return renderBlocks(str);
  if (!str) return '';

  // 1. HTML-escape first (XSS prevention)
  let h = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Protect inline code `...` from being processed
  const codeBlocks: string[] = [];
  h = h.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code);
    return `§CODE${idx}§`;
  });

  // 3. Markdown images: ![alt](url)
  h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');

  // 4. KaTeX block formulas $$...$$
  h = h.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
    try {
      return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<span class="katex-error">$$${formula}$$</span>`;
    }
  });

  // 5. KaTeX inline formulas $...$
  // Only match $ that are not adjacent to digits (avoid $100)
  h = h.replace(/(?<=^|[^$\d])\$([^$\n]+?)\$(?=[^$\d]|$)/g, (_, formula) => {
    try {
      return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<span class="katex-error">$${formula}$</span>`;
    }
  });

  // 6. Restore protected code blocks
  h = h.replace(/§CODE(\d+)§/g, (_, idx) => `<code>${codeBlocks[parseInt(idx)]}</code>`);

  // 7. Newlines to <br>
  h = h.replace(/\n/g, '<br>');

  return h;
}

/**
 * Escape HTML special characters in a string (for safe innerHTML assignment).
 */
export function escapeHtml(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
