/** Fisher-Yates shuffle — returns a new shuffled copy */
export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Identify the bank content without storing another copy of it in exam history. */
export function bankFingerprint(questions: import('./types').Question[]): string {
  const value = JSON.stringify(questions.map(q => [q.id, q.type, q.question, q.options, q.answer]));
  let first = 2166136261, second = 5381;
  for (let i = 0; i < value.length; i++) { first = Math.imul(first ^ value.charCodeAt(i), 16777619); second = Math.imul(second, 33) ^ value.charCodeAt(i); }
  return `${questions.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}
