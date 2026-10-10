import { store } from '../state';

export function applyTheme(): void {
  document.documentElement.classList.toggle('dark', store.state.isDark);
  const btn = document.getElementById('themeBtn');
  if (btn) {
    const label = store.state.isDark ? '亮色' : '暗色';
    btn.innerHTML = `<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${store.state.isDark ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10l2 2M5 19l2-2M17 7l2-2"/>' : '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'}</svg></span><span>${label}</span>`;
    btn.setAttribute('aria-label', `切换至${label}主题`);
  }
}

export function initTheme(btn: HTMLElement): void {
  applyTheme();
  btn.addEventListener('click', () => {
    store.update({ isDark: !store.state.isDark });
    applyTheme();
    store.save();
  });
}
