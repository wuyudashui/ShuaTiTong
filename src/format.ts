import type { Question } from './types';

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
  return h;
}

/**
 * Generate an auto explanation string based on the question's answer.
 */
export function autoExplanation(q: Question): string {
  if (q.type === 'fill') {
    const blanks = q.options || {};
    return `参考答案：${Object.entries(blanks).map(([k, v]) => `${k}：${v}`).join('；')}`;
  }
  if (q.type === 'judge') {
    return `正确答案是 ${q.answer}（${q.answer === 'A' ? '正确' : '错误'}）`;
  }
  const ansOption = q.options ? q.options[q.answer] : '';
  return ansOption
    ? `正确答案是 ${q.answer}：${ansOption}`
    : `正确答案是 ${q.answer}`;
}

/**
 * Escape HTML special characters in a string (for safe innerHTML assignment).
 */
export function escapeHtml(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
