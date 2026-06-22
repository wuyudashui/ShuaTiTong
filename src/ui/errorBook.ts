import type { Question } from '../types';
import { TYPE_LABELS } from '../types';
import { escapeHtml } from '../format';

export function renderErrorBook(
  errorBook: Record<number, boolean>,
  questions: Question[],
): string {
  const ids = Object.keys(errorBook);
  if (!ids.length) {
    return `<div class="empty-state"><div class="icon">🎉</div><h3>暂无错题</h3><p>继续刷题，答错的题目会自动收集在这里。</p></div>`;
  }

  let html = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
    <p style="margin:0;color:var(--text-secondary)">共 ${ids.length} 道错题</p>
    <button id="redoWrongBtn" class="btn-sm btn-outline">📝 练习全部错题</button>
  </div>`;
  ids.forEach(id => {
    const q = questions.find(qq => String(qq.id) === String(id));
    if (!q) return;
    let correctAns = q.answer;
    if (q.type === 'fill') {
      correctAns = Object.entries(q.options || {}).map(([k, v]) => `${k}:${v}`).join(' | ');
    } else if (q.type === 'judge') {
      correctAns += q.answer === 'A' ? '（正确）' : '（错误）';
    }
    const label = TYPE_LABELS[q.type] || q.type;
    html += `<div class="error-item" data-id="${q.id}"><div class="q-text-sm">${escapeHtml(q.question)}</div><div class="meta"><span>🏷 ${label}</span><span>📌 难度：${q.difficulty}</span><span>✅ 正确答案：${correctAns}</span></div></div>`;
  });

  // Delegate click handling to caller after innerHTML assignment
  // by setting a data attribute for each error-item
  return html;
}

export function bindErrorBookClicks(
  container: HTMLElement,
  questions: Question[],
  onJumpToQuestion: (q: Question) => void,
): void {
  container.querySelectorAll('.error-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt((el as HTMLElement).dataset.id ?? '');
      const q = questions.find(qq => qq.id === id);
      if (q) onJumpToQuestion(q);
    });
  });
}
