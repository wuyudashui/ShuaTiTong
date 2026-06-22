import { store } from '../state';

export function applyTheme(): void {
  document.documentElement.classList.toggle('dark', store.state.isDark);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = store.state.isDark ? '☀️' : '🌙';
}

export function initTheme(btn: HTMLElement): void {
  applyTheme();
  btn.addEventListener('click', () => {
    store.update({ isDark: !store.state.isDark });
    applyTheme();
    store.save();
  });
}
