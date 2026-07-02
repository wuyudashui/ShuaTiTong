import type { Question, ContentBlock } from './types';

function questionText(q: Question): string {
  const parts: string[] = [];
  if (Array.isArray(q.question)) {
    q.question.forEach(b => { if (b.t !== 'image') parts.push(b.c); });
  } else {
    parts.push(q.question);
  }
  Object.values(q.options).forEach(v => {
    if (Array.isArray(v)) v.forEach(b => { if (b.t !== 'image') parts.push(b.c); });
    else parts.push(v as string);
  });
  return parts.join(' ').toLowerCase();
}

export function getFiltered(
  questions: Question[],
  filterType: string,
  errorBook?: Record<number, boolean>,
  examErrorFilter?: number[],
  searchQuery?: string,
): Question[] {
  if (filterType === 'adapted') return [];
  if (filterType === 'exam-review') {
    if (!examErrorFilter || !examErrorFilter.length) return [];
    return questions.filter(q => examErrorFilter.includes(q.id));
  }
  if (filterType === 'wrong') {
    return questions.filter(q => errorBook?.[q.id]);
  }
  let filtered = filterType === 'all' ? questions : questions.filter(q => q.type === filterType);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(item => questionText(item).includes(q));
  }
  return filtered;
}
