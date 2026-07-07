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

  // Local model fields
  const localBaseUrlInput = document.getElementById('localApiBaseUrl') as HTMLInputElement;
  const localKeyInput = document.getElementById('localApiKey') as HTMLInputElement;
  const localModelInput = document.getElementById('localApiModel') as HTMLInputElement;

  // Feature mapping
  const modelForAISelect = document.getElementById('modelForAI') as HTMLSelectElement;
  const modelForAdaptSelect = document.getElementById('modelForAdapt') as HTMLSelectElement;
  const modelForParseSelect = document.getElementById('modelForParse') as HTMLSelectElement;

  // Preferences
  const autoNextCheck = document.getElementById('autoNextCheck') as HTMLInputElement;

  if (!modal || !openBtn || !cancelBtn || !saveBtn) return;

  function open(): void {
    const s = store.aiSettings;

    // Remote
    baseUrlInput.value = s.apiBaseUrl;
    keyInput.value = s.apiKey;
    const opts = [...modelSelect.options].map(o => o.value);
    if (opts.includes(s.apiModel)) {
      modelSelect.value = s.apiModel;
      modelCustom.style.display = 'none';
    } else {
      modelSelect.value = '';
      modelCustom.style.display = 'block';
      modelCustom.value = s.apiModel;
    }

    // Local
    localBaseUrlInput.value = s.localApiBaseUrl || '';
    localKeyInput.value = s.localApiKey || '';
    localModelInput.value = s.localApiModel || '';

    // Feature mapping
    modelForAISelect.value = s.modelForAI || 'remote';
    modelForAdaptSelect.value = s.modelForAdapt || 'remote';
    modelForParseSelect.value = s.modelForParse || 'remote';

    // Preferences
    if (autoNextCheck) autoNextCheck.checked = s.autoNext ?? false;

    modal.classList.remove('hidden');
  }

  function close(): void { modal.classList.add('hidden'); }

  openBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modelSelect.addEventListener('change', () => {
    modelCustom.style.display = modelSelect.value === '' ? 'block' : 'none';
  });

  saveBtn.addEventListener('click', () => {
    store.updateAISettings({
      // Remote
      apiBaseUrl: baseUrlInput.value.trim() || 'https://api.deepseek.com/v1',
      apiModel: modelSelect.value || modelCustom.value.trim() || 'deepseek-v4-flash',
      apiKey: keyInput.value.trim(),
      // Local
      localApiBaseUrl: localBaseUrlInput.value.trim() || '',
      localApiKey: localKeyInput.value.trim() || '',
      localApiModel: localModelInput.value.trim() || '',
      // Feature mapping
      modelForAI: modelForAISelect.value as any || 'remote',
      modelForAdapt: modelForAdaptSelect.value as any || 'remote',
      modelForParse: modelForParseSelect.value as any || 'remote',
      // Preferences
      autoNext: autoNextCheck ? autoNextCheck.checked : false,
    });
    close();
  });
}
