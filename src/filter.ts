import type { Question } from './types';

export function getFiltered(
  questions: Question[],
  filterType: string,
  errorBook?: Record<number, boolean>,
): Question[] {
  if (filterType === 'wrong') {
    return questions.filter(q => errorBook?.[q.id]);
  }
  if (filterType === 'all') return questions;
  return questions.filter(q => q.type === filterType);
}
