import type { AppState, QuestionType, Question, AnswerResult, ExamState } from './types';
import { getFiltered } from './filter';
import { saveAppState, loadAppState, saveAISettings, loadAISettings, saveRecentFiles, loadRecentFiles } from './storage';
import type { AISettings, RecentFileMeta } from './types';

// ─── Default state ───

export function createDefaultState(): AppState {
  return {
    questions: [],
    currentIndex: 0,
    filterType: 'all',
    correctCount: 0,
    wrongCount: 0,
    answeredMap: {},
    errorBook: {},
    isDark: false,
  };
}

// ─── Store ───

type Listener = () => void;

class Store {
  private _state: AppState;
  private _aiSettings: AISettings;
  private _recentFiles: RecentFileMeta[] = [];
  private _answered = false;
  private _aiLoading = false;
  private _thumbOpen = false;
  private _exam: ExamState = { active: false, questions: [], currentIndex: 0, answers: {}, total: 0 };
  private listeners: Set<Listener> = new Set();

  constructor() {
    this._state = createDefaultState();
    this._aiSettings = loadAISettings();
    this._recentFiles = loadRecentFiles();
  }

  // ─── State accessors ───

  get state(): AppState {
    return this._state;
  }

  get aiSettings(): AISettings {
    return this._aiSettings;
  }

  get recentFiles(): RecentFileMeta[] {
    return this._recentFiles;
  }

  get answered(): boolean {
    return this._answered;
  }

  get aiLoading(): boolean {
    return this._aiLoading;
  }

  get thumbOpen(): boolean {
    return this._thumbOpen;
  }

  get exam(): ExamState {
    return this._exam;
  }

  // ─── Computed ───

  get filtered(): import('./types').Question[] {
    return getFiltered(this._state.questions, this._state.filterType);
  }

  // ─── State mutations ───

  update(partial: Partial<AppState>): void {
    this._state = { ...this._state, ...partial };
    this.notify();
  }

  setAnswered(v: boolean): void {
    this._answered = v;
  }

  setAILoading(v: boolean): void {
    this._aiLoading = v;
  }

  updateAISettings(settings: Partial<AISettings>): void {
    this._aiSettings = { ...this._aiSettings, ...settings };
    saveAISettings(this._aiSettings);
  }

  setRecentFiles(files: RecentFileMeta[]): void {
    this._recentFiles = files;
    saveRecentFiles(files);
  }

  // ─── Thumbnails ───

  toggleThumbnails(): void {
    this._thumbOpen = !this._thumbOpen;
  }

  // ─── Exam mode ───

  startExam(questions: Question[]): void {
    this._exam = { active: true, questions, currentIndex: 0, answers: {}, total: questions.length };
    this._answered = false;
  }

  exitExam(): void {
    this._exam = { active: false, questions: [], currentIndex: 0, answers: {}, total: 0 };
    this._answered = false;
  }

  setExamIndex(i: number): void {
    this._exam.currentIndex = i;
  }

  recordExamAnswer(qid: number, result: AnswerResult): void {
    this._exam.answers[qid] = result;
  }

  get examAnsweredCount(): number {
    return Object.keys(this._exam.answers).length;
  }

  get examCorrectCount(): number {
    return Object.values(this._exam.answers).filter(a => a === 'correct').length;
  }

  // ─── Pub/sub ───

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  // ─── Persistence ───

  save(): void {
    saveAppState(this._state);
  }

  restore(): boolean {
    const saved = loadAppState();
    if (!saved) return false;
    this._state = saved;
    this._answered = false;
    this.notify();
    return true;
  }
}

/** Singleton store instance */
export const store = new Store();
