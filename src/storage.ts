import type { AppState, AISettings, RecentFileMeta, ExamRecord } from './types';
import { normalizeQuestions } from './questions';

const LS_KEY = 'shuatitong_state';
const AI_KEY = 'shuatitong_ai_settings';
const RECENT_KEY = 'shuatitong_recent';

// ─── App state ───

const EXAM_RECORDS_KEY = 'shuatitong_exam_records';

export function saveExamRecords(records: ExamRecord[]): void {
  try {
    localStorage.setItem(EXAM_RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.warn('刷题通: 保存考试记录失败', e);
  }
}

export function loadExamRecords(): ExamRecord[] {
  try {
    const raw = localStorage.getItem(EXAM_RECORDS_KEY);
    if (!raw) return [];
    const records = JSON.parse(raw);
    return Array.isArray(records) ? records.filter(r => r && typeof r.id === 'string' && Number.isFinite(r.date) && Number.isFinite(r.total) && Number.isFinite(r.correct) && Number.isFinite(r.wrong) && Array.isArray(r.wrongIds)) : [];
  } catch (e) {
    return [];
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('刷题通: 保存进度失败，localStorage 可能已满', e);
    window.dispatchEvent(new CustomEvent('storage-save-failed'));
  }
}

export function loadAppState(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.questions) || !s.questions.length) return null;
    const map = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { ...s, questions: normalizeQuestions(s.questions), currentIndex: Number.isSafeInteger(s.currentIndex) && s.currentIndex >= 0 ? s.currentIndex : 0,
      filterType: ['all','single','multi','judge','fill','wrong','exam-review'].includes(s.filterType) ? s.filterType : 'all',
      correctCount: Number.isFinite(s.correctCount) && s.correctCount >= 0 ? s.correctCount : 0, wrongCount: Number.isFinite(s.wrongCount) && s.wrongCount >= 0 ? s.wrongCount : 0,
      answeredMap: map(s.answeredMap), errorBook: map(s.errorBook), examErrorFilter: Array.isArray(s.examErrorFilter) ? s.examErrorFilter : [], searchQuery: typeof s.searchQuery === 'string' ? s.searchQuery : '', isDark: !!s.isDark } as AppState;
  } catch (e) {
    return null;
  }
}

// ─── AI settings ───

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (!raw) return { apiKey: '', apiBaseUrl: '', apiModel: '', autoNext: false };
    const s = JSON.parse(raw);
    return {
      ...s,
      devMode: sessionStorage.getItem('shuatitong_dev') === 'true',
      userTier: sessionStorage.getItem('shuatitong_dev') === 'true' ? 'root' : 'guest',
      apiKey: s.apiKey || '',
      apiBaseUrl: s.apiBaseUrl || '',
      apiModel: s.apiModel || '',
      autoNext: s.autoNext ?? false,
    };
  } catch (e) {
    return { apiKey: '', apiBaseUrl: '', apiModel: '', autoNext: false };
  }
}

export function saveAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(AI_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('刷题通: 保存 AI 设置失败', e);
  }
}

// ─── Recent files ───

export function saveRecentFiles(files: RecentFileMeta[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(files));
  } catch (e) {
    console.warn('刷题通: 保存最近文件记录失败', e);
  }
}

export function loadRecentFiles(): RecentFileMeta[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const files = JSON.parse(raw);
    return Array.isArray(files) ? files.filter(f => f && typeof f.name === 'string' && Array.isArray(f.questions) && Number.isFinite(f.count)) : [];
  } catch (e) {
    return [];
  }
}
