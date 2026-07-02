import type { AppState, QuestionType, Question, ExamState, ExamGradedDetail, ExamSection, AISettings, RecentFileMeta, ExamRecord, AdaptedState, AdaptMode } from './types';
import { getFiltered } from './filter';
import { saveAppState, loadAppState, saveAISettings, loadAISettings, saveRecentFiles, loadRecentFiles, saveExamRecords, loadExamRecords } from './storage';

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
    examErrorFilter: [],
    searchQuery: '',
  };
}

// ─── Store ───

class Store {
  private _state: AppState;
  private _aiSettings: AISettings;
  private _recentFiles: RecentFileMeta[] = [];
  private _examRecords: ExamRecord[] = [];
  private _answered = false;
  private _aiLoading = false;
  private _thumbOpen = false;
  private _exam: ExamState = { active: false, questions: [], currentIndex: 0, answers: {}, answerDisplay: {}, total: 0, graded: false, gradeDetails: {}, sections: [] };
  private _adapted: AdaptedState = { questions: [], originalIds: [], mode: 'fill' };

  constructor() {
    this._state = createDefaultState();
    this._aiSettings = loadAISettings();
    this._recentFiles = loadRecentFiles();
    this._examRecords = loadExamRecords();
  }

  // ─── State accessors ───

  get state(): AppState {
    return this._state;
  }

  get aiSettings(): AISettings {
    return this._aiSettings;
  }

  /** Get API connection parameters for a given model preference */
  getApiConfig(prefer: 'remote' | 'local' = 'remote'): { apiKey: string; apiBaseUrl: string; apiModel: string } {
    if (prefer === 'local' && this._aiSettings.localApiBaseUrl) {
      return {
        apiKey: this._aiSettings.localApiKey || '',
        apiBaseUrl: this._aiSettings.localApiBaseUrl,
        apiModel: this._aiSettings.localApiModel || 'qwen2.5',
      };
    }
    return {
      apiKey: this._aiSettings.apiKey,
      apiBaseUrl: this._aiSettings.apiBaseUrl,
      apiModel: this._aiSettings.apiModel,
    };
  }

  get recentFiles(): RecentFileMeta[] {
    return this._recentFiles;
  }

  get examRecords(): ExamRecord[] {
    return this._examRecords;
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

  get adapted(): AdaptedState {
    return this._adapted;
  }

  startAdapt(questions: Question[], originalIds: number[], mode: AdaptMode): void {
    this._adapted = { questions, originalIds, mode };
  }

  clearAdapt(): void {
    this._adapted = { questions: [], originalIds: [], mode: 'fill' };
  }

  // ─── Computed ───

  get filtered(): Question[] {
    return getFiltered(this._state.questions, this._state.filterType, this._state.errorBook, this._state.examErrorFilter, this._state.searchQuery);
  }

  // ─── State mutations ───

  update(partial: Partial<AppState>): void {
    this._state = { ...this._state, ...partial };
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

  startExam(questions: Question[], sections: ExamSection[]): void {
    this._exam = { active: true, questions, currentIndex: 0, answers: {}, answerDisplay: {}, total: questions.length, graded: false, gradeDetails: {}, sections };
    this._answered = false;
  }

  exitExam(): void {
    this._exam = { active: false, questions: [], currentIndex: 0, answers: {}, answerDisplay: {}, total: 0, graded: false, gradeDetails: {}, sections: [] };
    this._answered = false;
  }

  markExamGraded(details: Record<number, { selected: string; correct: string; isCorrect: boolean }>): void {
    this._exam.graded = true;
    this._exam.gradeDetails = details;
  }

  setExamIndex(i: number): void {
    this._exam.currentIndex = i;
  }

  recordExamAnswer(qid: number, selected: string, selectedDisplay?: string): void {
    this._exam.answers[qid] = selected;
    if (selectedDisplay) this._exam.answerDisplay[qid] = selectedDisplay;
  }

  get examAnsweredCount(): number {
    return Object.keys(this._exam.answers).length;
  }

  /** Grade all exam answers at once: returns { correct, wrong, details } */
  gradeExam(): { correct: number; wrong: number; details: Record<number, ExamGradedDetail> } {
    const details: Record<number, ExamGradedDetail> = {};
    let correct = 0;
    let wrong = 0;

    const eq = (a: string, b: string) =>
      a.toUpperCase() === b.toUpperCase();
    const eqMulti = (a: string, b: string) =>
      a.split('').sort().join('').toUpperCase() === b.split('').sort().join('').toUpperCase();

    for (const q of this._exam.questions) {
      const selected = this._exam.answers[q.id] || '';
      const isCorrect = q.type === 'multi' ? eqMulti(selected, q.answer) : eq(selected, q.answer);
      isCorrect ? correct++ : wrong++;
      details[q.id] = { selected, correct: q.answer, isCorrect };
    }

    return { correct, wrong, details };
  }

  /** Add exam result to history (max 5) */
  addExamRecord(record: ExamRecord): void {
    this._examRecords.unshift(record);
    if (this._examRecords.length > 5) this._examRecords.length = 5;
    saveExamRecords(this._examRecords);
  }

  deleteExamRecord(id: string): void {
    this._examRecords = this._examRecords.filter(r => r.id !== id);
    saveExamRecords(this._examRecords);
  }

  // ─── Exam error review ───

  startExamErrorReview(wrongIds: number[]): void {
    this._state.examErrorFilter = wrongIds;
    this._state.filterType = 'exam-review';
    this._state.currentIndex = 0;
    this._answered = false;
  }

  exitExamErrorReview(): void {
    this._state.examErrorFilter = [];
    this._state.filterType = 'all';
    this.save();
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
    return true;
  }
}

/** Singleton store instance */
export const store = new Store();
