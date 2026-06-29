/**
 * SVG Icon set — feather-style, 20×20 viewBox, 1.5px stroke
 * Usage: set innerHTML to the desired icon string, or use inline.
 */
const SVG = 'http://www.w3.org/2000/svg';

function icon(path: string, w = 20, h = 20): string {
  return `<svg xmlns="${SVG}" width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

/** Replace emoji/text prefix with SVG icon in an element */
export function setIcon(el: HTMLElement, iconSvg: string): void {
  const existing = el.querySelector('.svg-icon');
  if (existing) existing.remove();
  const span = document.createElement('span');
  span.className = 'svg-icon';
  span.innerHTML = iconSvg;
  el.prepend(span);
}

/** Prepend SVG icon to a button that has text+emoji (removes leading emoji) */
export function upgradeIcon(el: HTMLElement, iconSvg: string): void {
  // Remove leading emoji/icon text
  const text = el.childNodes[0];
  if (text && text.nodeType === Node.TEXT_NODE) {
    text.textContent = text.textContent?.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}]\s*/u, '') ?? '';
  }
  setIcon(el, iconSvg);
}

// ─── Icons ───

export const BOOK = icon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/>');

export const MOON = icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>');

export const SUN = icon('<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>');

export const SETTINGS = icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>');

export const CLIPBOARD = icon('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>');

export const REFRESH = icon('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>');

export const UPLOAD = icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>');

export const FOLDER = icon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');

export const FILE_TEXT = icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>');

export const X = icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');

export const CHECK = icon('<polyline points="20 6 9 17 4 12"/>');

export const CHEVRON_LEFT = icon('<polyline points="15 18 9 12 15 6"/>');

export const CHEVRON_RIGHT = icon('<polyline points="9 18 15 12 9 6"/>');

export const SHUFFLE = icon('<polyline points="16 3 21 3 21 8"/><polyline points="4 17 10 17 15 22"/><polyline points="21 3 12 14 9 11 4 6"/><line x1="4" y1="6" x2="8" y2="10"/>');

export const BRAIN = icon('<path d="M12 2a4 4 0 0 1 4 4c0 1.34-.64 2.61-1.74 3.39A4 4 0 0 1 16 13a4 4 0 0 1-2 3.46"/><path d="M12 2a4 4 0 0 0-4 4c0 1.34.64 2.61 1.74 3.39A4 4 0 0 0 8 13a4 4 0 0 0 2 3.46"/><path d="M12 22v-6"/><path d="M8 17c-2 0-4-1-4-4 0-1.5 1-2.5 2-3"/><path d="M16 17c2 0 4-1 4-4 0-1.5-1-2.5-2-3"/>');

export const EYE = icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');

export const BAR_CHART = icon('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>');

export const TARGET = icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>');

export const GRID = icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>');

export const ALERT_CIRCLE = icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>');

export const CHECK_CIRCLE = icon('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>');

export const BOOK_OPEN = icon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>');

export const SEND = icon('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>');

export const HOME = icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>');

export const EDIT = icon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>');

export const DOWNLOAD = icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');

export const CODE = icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');

export const CLOSE = X;
