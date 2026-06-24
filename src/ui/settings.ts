import { store } from '../state';

export function initSettings(): void {
  const modal = document.getElementById('settingsModal') as HTMLElement;
  const openBtn = document.getElementById('settingsBtn');
  const cancelBtn = document.getElementById('settingsCancelBtn');
  const saveBtn = document.getElementById('settingsSaveBtn');
  const baseUrlInput = document.getElementById('apiBaseUrl') as HTMLInputElement;
  const keyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
  const modelSelect = document.getElementById('apiModelSelect') as HTMLSelectElement;
  const modelCustom = document.getElementById('apiModelCustom') as HTMLInputElement;
  const modeBtns = document.querySelectorAll<HTMLButtonElement>('.ai-mode-btn');

  if (!modal || !openBtn || !cancelBtn || !saveBtn) return;

  let currentMode: 'detailed' | 'simple' = 'detailed';

  function setMode(mode: 'detailed' | 'simple'): void {
    currentMode = mode;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setMode(btn.dataset.mode as 'detailed' | 'simple');
    });
  });

  function open(): void {
    const s = store.aiSettings;
    baseUrlInput.value = s.apiBaseUrl;
    keyInput.value = s.apiKey;
    setMode(s.aiMode || 'detailed');
    const opts = [...modelSelect.options].map(o => o.value);
    if (opts.includes(s.apiModel)) {
      modelSelect.value = s.apiModel;
      modelCustom.style.display = 'none';
    } else {
      modelSelect.value = '';
      modelCustom.style.display = 'block';
      modelCustom.value = s.apiModel;
    }
    modal.classList.remove('hidden');
  }

  function close(): void {
    modal.classList.add('hidden');
  }

  openBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modelSelect.addEventListener('change', () => {
    modelCustom.style.display = modelSelect.value === '' ? 'block' : 'none';
  });

  function updateAiButton(mode: 'detailed' | 'simple'): void {
    const btn = document.getElementById('aiExplainBtn');
    if (!btn) return;
    const svg = '<span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.34-.64 2.61-1.74 3.39A4 4 0 0 1 16 13a4 4 0 0 1-2 3.46"/><path d="M12 2a4 4 0 0 0-4 4c0 1.34.64 2.61 1.74 3.39A4 4 0 0 0 8 13a4 4 0 0 0 2 3.46"/><path d="M12 22v-6"/><path d="M8 17c-2 0-4-1-4-4 0-1.5 1-2.5 2-3"/><path d="M16 17c2 0 4-1 4-4 0-1.5-1-2.5-2-3"/></svg></span>';
    btn.innerHTML = mode === 'simple' ? svg + 'AI 纠错' : svg + 'AI 解析';
  }

  saveBtn.addEventListener('click', () => {
    store.updateAISettings({
      apiBaseUrl: baseUrlInput.value.trim() || 'https://api.deepseek.com/v1',
      apiModel: modelSelect.value || modelCustom.value.trim() || 'deepseek-v4-flash',
      apiKey: keyInput.value.trim(),
      aiMode: currentMode,
    });
    updateAiButton(currentMode);
    close();
  });
}
