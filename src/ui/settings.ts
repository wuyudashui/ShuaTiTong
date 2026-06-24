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

  saveBtn.addEventListener('click', () => {
    store.updateAISettings({
      apiBaseUrl: baseUrlInput.value.trim() || 'https://api.deepseek.com/v1',
      apiModel: modelSelect.value || modelCustom.value.trim() || 'deepseek-v4-flash',
      apiKey: keyInput.value.trim(),
      aiMode: currentMode,
    });
    close();
  });
}
