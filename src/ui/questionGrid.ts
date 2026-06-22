import type { Question, AnswerResult } from '../types';
import { TYPE_LABELS } from '../types';

export function renderThumbnails(
  questions: Question[],
  answeredMap: Record<number, AnswerResult>,
  currentOrigId: number,
): string {
  if (!questions.length) return '';

  return questions.map((q, i) => {
    const isCurrent = q.id === currentOrigId;
    let cls = 'thumb-item';
    if (isCurrent) cls += ' current';

    const result = answeredMap[q.id];
    if (result === 'correct') cls += ' correct';
    else if (result === 'wrong') cls += ' wrong';

    const label = TYPE_LABELS[q.type] || q.type;
    return `<div class="${cls}" data-index="${i}" data-qid="${q.id}" title="#${i + 1} [${label}] ${q.question.slice(0, 40)}">${i + 1}</div>`;
  }).join('');
}

// Single shared click handler — stored here so main.ts only binds once
let jumpHandler: ((index: number) => void) | null = null;

export function setThumbnailJumpHandler(fn: (index: number) => void): void {
  jumpHandler = fn;
}

export function handleThumbnailClick(target: HTMLElement): void {
  const el = target.closest('.thumb-item') as HTMLElement | null;
  if (!el || !jumpHandler) return;
  const idx = parseInt(el.dataset.index ?? '');
  if (!isNaN(idx)) jumpHandler(idx);
}
