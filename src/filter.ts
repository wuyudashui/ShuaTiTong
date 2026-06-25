import type { Question } from './types';

export function getFiltered(
  questions: Question[],
  filterType: string,
  errorBook?: Record<number, boolean>,
  examErrorFilter?: number[],
): Question[] {
  if (filterType === 'exam-review') {
    if (!examErrorFilter || !examErrorFilter.length) return [];
    return questions.filter(q => examErrorFilter.includes(q.id));
  }
  if (filterType === 'wrong') {
    return questions.filter(q => errorBook?.[q.id]);
  }
  if (filterType === 'all') return questions;
  return questions.filter(q => q.type === filterType);
}
