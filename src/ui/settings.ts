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
  const fetchModelsBtn = document.getElementById('fetchModelsBtn') as HTMLButtonElement;
  const modelFetchStatus = document.getElementById('modelFetchStatus') as HTMLElement;
  const manualToggle = document.getElementById('modelCustomToggle') as HTMLInputElement;

  // Local model fields
  const localBaseUrlInput = document.getElementById('localApiBaseUrl') as HTMLInputElement;
  const localKeyInput = document.getElementById('localApiKey') as HTMLInputElement;
  const localModelInput = document.getElementById('localApiModel') as HTMLInputElement;

  // Feature mapping
  const modelForAISelect = document.getElementById('modelForAI') as HTMLSelectElement;
  const modelForAdaptSelect = document.getElementById('modelForAdapt') as HTMLSelectElement;

  // Preferences
  const autoNextCheck = document.getElementById('autoNextCheck') as HTMLInputElement;

  if (!modal || !openBtn || !cancelBtn || !saveBtn) return;
  let modelRequest: AbortController | null = null;
  let loadedModels: string[] = [];
  let loadedAddress = '';
  const showModelInput = () => { modelSelect.classList.toggle('hidden', manualToggle.checked); modelCustom.style.display = manualToggle.checked ? 'block' : 'none'; };

  function updateModelAvailability(): void {
    const enabled = !!baseUrlInput.value.trim();
    modelSelect.disabled = !enabled || !loadedModels.length;
    manualToggle.disabled = !enabled;
    fetchModelsBtn.disabled = !enabled;
    if (!enabled) modelFetchStatus.textContent = '先填写 API 地址后获取模型列表';
    else if (!modelFetchStatus.textContent || modelFetchStatus.textContent === '先填写 API 地址后获取模型列表') modelFetchStatus.textContent = '';
  }

  function setModels(models: string[], selected = ''): void {
    const current = selected || modelSelect.value;
    const unique = [...new Set(models.filter(Boolean))];
    loadedModels = unique;
    modelSelect.innerHTML = '';
    for (const model of unique) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    }
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = unique.length ? '请选择模型' : '先获取模型列表，或手动填写';
    modelSelect.appendChild(custom);
    if (unique.includes(current)) {
      modelSelect.value = current;
      manualToggle.checked = false;
    } else {
      modelSelect.value = '';
      modelCustom.value = current;
      manualToggle.checked = !!current;
    }
    showModelInput();
    updateModelAvailability();
  }

  function open(): void {
    const s = store.aiSettings;

    // Remote
    baseUrlInput.value = s.apiBaseUrl;
    keyInput.value = s.apiKey;
    setModels(loadedAddress === s.apiBaseUrl.trim().replace(/\/+$/, '') ? loadedModels : [], s.apiModel);
    updateModelAvailability();

    // Local
    localBaseUrlInput.value = s.localApiBaseUrl || '';
    localKeyInput.value = s.localApiKey || '';
    localModelInput.value = s.localApiModel || '';

    // Feature mapping
    modelForAISelect.value = s.modelForAI || 'remote';
    modelForAdaptSelect.value = s.modelForAdapt || 'remote';

    // Preferences
    if (autoNextCheck) autoNextCheck.checked = s.autoNext ?? false;

    modal.classList.remove('hidden');
  }

  function close(): void { modelRequest?.abort(); modelRequest = null; modal.classList.add('hidden'); }

  openBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modelSelect.addEventListener('change', () => { if (modelSelect.value) modelCustom.value = modelSelect.value; });
  manualToggle.addEventListener('change', () => { if (manualToggle.checked && modelSelect.value) modelCustom.value = modelSelect.value; showModelInput(); });
  const invalidateModels = () => {
    modelRequest?.abort(); modelRequest = null;
    modelFetchStatus.textContent = '';
    loadedAddress = '';
    setModels([], modelSelect.value || modelCustom.value.trim());
    updateModelAvailability();
  };
  baseUrlInput.addEventListener('input', invalidateModels);
  keyInput.addEventListener('input', invalidateModels);
  fetchModelsBtn.addEventListener('click', async () => {
    const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, '');
    if (!baseUrl) return;
    modelRequest?.abort();
    const controller = new AbortController();
    modelRequest = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    fetchModelsBtn.disabled = true;
    modelFetchStatus.textContent = '正在获取模型列表…';
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (keyInput.value.trim()) headers.Authorization = `Bearer ${keyInput.value.trim()}`;
      const response = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (modelRequest !== controller) return;
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `HTTP ${response.status}`);
      const models = (Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [])
        .map((item: unknown) => typeof item === 'string' ? item : (item as { id?: string })?.id || '')
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
      if (!models.length) throw new Error('接口未返回可用模型');
      const current = modelSelect.value || modelCustom.value.trim();
      loadedAddress = baseUrl;
      setModels(models, models.includes(current) ? current : models[0]);
      modelFetchStatus.textContent = `已获取 ${loadedModels.length} 个模型，请选择要使用的模型。`;
    } catch (error) {
      if (modelRequest !== controller) return;
      modelFetchStatus.textContent = `获取失败：${error instanceof Error ? error.message : '接口响应无效'}`;
    } finally {
      window.clearTimeout(timeout);
      if (modelRequest !== controller) return;
      modelRequest = null;
      updateModelAvailability();
      fetchModelsBtn.disabled = !baseUrlInput.value.trim();
    }
  });

  saveBtn.addEventListener('click', () => {
    const model = manualToggle.checked ? modelCustom.value.trim() : modelSelect.value;
    if (baseUrlInput.value.trim() && !model) { modelFetchStatus.textContent = '请选择模型，或勾选手动填写模型名。'; return; }
    store.updateAISettings({
      // Remote
      apiBaseUrl: baseUrlInput.value.trim(),
      apiModel: model,
      apiKey: keyInput.value.trim(),
      // Local
      localApiBaseUrl: localBaseUrlInput.value.trim() || '',
      localApiKey: localKeyInput.value.trim() || '',
      localApiModel: localModelInput.value.trim() || '',
      // Feature mapping
      modelForAI: modelForAISelect.value as any || 'remote',
      modelForAdapt: modelForAdaptSelect.value as any || 'remote',
      // Preferences
      autoNext: autoNextCheck ? autoNextCheck.checked : false,
    });
    close();
  });
}
