import type { AppState, AISettings, RecentFileMeta } from './types';

const LS_KEY = 'shuatitong_state';
const AI_KEY = 'shuatitong_ai_settings';
const RECENT_KEY = 'shuatitong_recent';

// ─── App state ───

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('刷题通: 保存进度失败，localStorage 可能已满', e);
  }
}

export function loadAppState(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.questions || !s.questions.length) return null;
    return s as AppState;
  } catch (e) {
    return null;
  }
}

// ─── AI settings ───

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (!raw) return { apiKey: '', apiBaseUrl: 'https://api.deepseek.com', apiModel: 'deepseek-v4-flash' };
    const s = JSON.parse(raw);
    return {
      apiKey: s.apiKey || '',
      apiBaseUrl: s.apiBaseUrl || 'https://api.deepseek.com',
      apiModel: s.apiModel || 'deepseek-v4-flash',
    };
  } catch (e) {
    return { apiKey: '', apiBaseUrl: 'https://api.deepseek.com', apiModel: 'deepseek-v4-flash' };
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
    return JSON.parse(raw) as RecentFileMeta[];
  } catch (e) {
    return [];
  }
}
