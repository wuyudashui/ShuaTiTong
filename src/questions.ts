import type { ContentBlock, Question } from './types';
import { isImageSource } from './format';

function content(value: unknown): value is string | ContentBlock[] {
  return typeof value === 'string' || (Array.isArray(value) && value.every(block =>
    block && ['text', 'f', 'code', 'image'].includes(block.t) && typeof block.c === 'string'
    && (block.t !== 'image' || isImageSource(block.c)) && (block.d === undefined || typeof block.d === 'boolean')));
}

export function normalizeQuestions(input: unknown): Question[] {
  if (!Array.isArray(input) || !input.length) throw new Error('题库需要包含至少一道题目的 JSON 数组');
  const ids = new Set<number>();
  return input.map((q, index) => {
    const error = (message: string): never => { throw new Error(`第 ${index + 1} 题：${message}`); };
    if (!q || !Number.isSafeInteger(q.id) || q.id < 1 || ids.has(q.id)) error('题号必须是唯一的正整数');
    ids.add(q.id);
    if (!['single', 'multi', 'judge', 'fill'].includes(q.type)) error('题型无效');
    if (!content(q.question) || !q.options || Array.isArray(q.options) || typeof q.options !== 'object') error('题干或选项格式无效');
    if (!Object.values(q.options).every(content)) error('选项内容或图片引用无效');
    if (typeof q.answer !== 'string') error('答案必须是字符串');
    const options: Record<string, string | ContentBlock[]> = { ...q.options };
    const answer = q.type === 'fill' ? q.answer : q.answer.trim().toUpperCase();
    if (q.type !== 'fill') {
      const keys = answer.split('');
      if (!keys.length || keys.some((key: string) => !Object.prototype.hasOwnProperty.call(options, key)) || (q.type !== 'multi' && keys.length !== 1)) error('答案没有对应的选项');
      if (q.type === 'multi' && new Set(keys).size !== keys.length) error('多选答案不能重复');
    } else {
      if (!Object.keys(options).length) error('填空题缺少标准答案');
      const blanks = Object.values(options);
      Object.keys(options).forEach(key => delete options[key]);
      blanks.forEach((value, i) => { options[`空${i + 1}`] = value; });
    }
    return { ...q, options, answer: q.type === 'multi' ? answer.split('').sort().join('') : answer, difficulty: ['易', '中', '难'].includes(q.difficulty) ? q.difficulty : '中', explanation: typeof q.explanation === 'string' ? q.explanation : '' };
  });
}
