// ─── Question types ───

export type QuestionType = 'single' | 'multi' | 'judge' | 'fill';
export type Difficulty = '易' | '中' | '难';
export type AnswerResult = 'correct' | 'wrong';

/** Structured content block for rendering text, formulas, code, and images. */
export type ContentBlock =
  | { t: 'text';  c: string }
  | { t: 'f';     c: string; d?: boolean }
  | { t: 'code';  c: string }
  | { t: 'image'; c: string; alt?: string };

export interface Question {
  id: number;
  type: QuestionType;
  /** Question content as structured blocks (new) or plain text (legacy) */
  question: ContentBlock[] | string;
  /** Options keyed by letter (A/B/C/D) for single/multi/judge,
   *  or keyed by blank name (空1/空2) for fill.
   *  Values can be structured blocks or plain text. */
  options: Record<string, ContentBlock[] | string>;
  /** Correct answer. For multi, a concatenated string like "ACD" */
  answer: string;
  difficulty: Difficulty;
  /** Detailed AI explanation */
  explanation: string;
  /** Simple AI explanation (error-spotting only) */
  simpleExplanation?: string;
}

// ─── App state ───

export type AdaptMode = 'fill' | 'single-to-multi';

export interface AdaptedState {
  questions: Question[];
  originalIds: number[];
  mode: AdaptMode;
}

export interface AppState {
  questions: Question[];
  currentIndex: number;
  filterType: QuestionType | 'all' | 'wrong' | 'exam-review' | 'adapted';
  correctCount: number;
  wrongCount: number;
  answeredMap: Record<number, AnswerResult>;
  errorBook: Record<number, boolean>;
  isDark: boolean;
  /** Question IDs to show when filterType is 'exam-review' */
  examErrorFilter: number[];
  /** Full-text search query */
  searchQuery: string;
}

export interface ExamRecord {
  id: string;
  date: number;
  correct: number;
  wrong: number;
  total: number;
  wrongIds: number[];
  sections: { label: string; correct: number; total: number }[];
}

export type ModelPrefer = 'remote' | 'local';
export type UserTier = 'guest' | 'premium' | 'root';

export interface AISettings {
  /* ── Remote model (cloud API) ── */
  apiKey: string;
  apiBaseUrl: string;
  apiModel: string;
  /* ── Local model (Ollama etc.) ── */
  localApiKey?: string;
  localApiBaseUrl?: string;
  localApiModel?: string;
  /* ── Feature-to-model mapping ── */
  modelForAI?: ModelPrefer;     // AI 解析/纠错
  modelForAdapt?: ModelPrefer;  // AI 改编
  modelForParse?: ModelPrefer;  // AI 解析导入
  /* ── Account ── */
  userTier?: UserTier;         // guest / premium / root
  premiumPassword?: string;    // local password to unlock premium
  /* ── Sync (root only) ── */
  syncToken?: string;
  syncUsername?: string;
  syncServer?: string;
  /* ── Dev mode ── */
  devMode?: boolean;
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
  onAnswered: (result: { isCorrect: boolean; selected?: string; selectedDisplay?: string }) => void;
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
  /** In exam mode, stores selected answer string (e.g. "B" or "ACD") — original keys for grading */
  answers: Record<number, string>;
  /** Maps question id to the display letter(s) the user saw (shuffled labels) */
  answerDisplay: Record<number, string>;
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
