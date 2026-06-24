// ─── Question types ───

export type QuestionType = 'single' | 'multi' | 'judge' | 'fill';
export type Difficulty = '易' | '中' | '难';
export type AnswerResult = 'correct' | 'wrong';

export interface Question {
  id: number;
  type: QuestionType;
  question: string;
  /** Options keyed by letter (A/B/C/D) for single/multi/judge,
   *  or keyed by blank name (空1/空2) for fill */
  options: Record<string, string>;
  /** Correct answer. For multi, a concatenated string like "ACD" */
  answer: string;
  difficulty: Difficulty;
  explanation: string;
}

// ─── App state ───

export interface AppState {
  questions: Question[];
  currentIndex: number;
  filterType: QuestionType | 'all' | 'wrong';
  correctCount: number;
  wrongCount: number;
  answeredMap: Record<number, AnswerResult>;
  errorBook: Record<number, boolean>;
  isDark: boolean;
}

export interface AISettings {
  apiKey: string;
  apiBaseUrl: string;
  apiModel: string;
}

export interface RecentFileMeta {
  name: string;
  questions: Question[];
  count: number;
  time: number;
}

// ─── Renderer ───

export interface RenderConfig {
  optContainer: HTMLElement;
  fillContainer: HTMLElement;
  feedback: HTMLElement;
  feedbackResult: HTMLElement;
  explanation: HTMLElement;
  examMode?: boolean;
  onAnswered: (result: { isCorrect: boolean; selected?: string }) => void;
}

export interface QuestionRenderer {
  type: QuestionType;
  render(q: Question, config: RenderConfig): void;
  /** Highlight correct answer(s) and disable interaction */
  showAnswer(q: Question): void;
  destroy(): void;
}

// ─── Exam state ───

export interface ExamGradedDetail {
  selected: string;
  correct: string;
  isCorrect: boolean;
}

export interface ExamSection {
  type: QuestionType;
  label: string;
  start: number;
  end: number;
}

export interface ExamState {
  active: boolean;
  questions: Question[];
  currentIndex: number;
  /** In exam mode, stores selected answer string (e.g. "B" or "ACD") */
  answers: Record<number, string>;
  total: number;
  /** After grading, stores per-question grading details for review */
  graded: boolean;
  gradeDetails: Record<number, ExamGradedDetail>;
  /** Type-based sections for grouped-by-type display */
  sections: ExamSection[];
}

// ─── Type labels ───

export const TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选',
  judge: '判断',
  multi: '多选',
  fill: '填空',
};
