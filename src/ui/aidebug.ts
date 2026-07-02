import { store } from '../state';

export function showAIDebug(): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'aiDebugModal';
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px;height:80vh;display:flex;flex-direction:column;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 style="margin:0;font-size:1.1rem">🤖 AI 调试</h2>
        <button id="aiDebugClose" class="btn-sm" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-secondary)">✕</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">模型来源</div>
          <select id="aiDebugSource" class="edit-input" style="margin-bottom:0">
            <option value="remote">☁️ 远程</option>
            <option value="local">💻 本地</option>
          </select>
        </div>
        <div style="flex:2;min-width:140px">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">模型名称</div>
          <select id="aiDebugModel" class="edit-input" style="margin-bottom:0"><option value="">默认模型</option></select>
        </div>
        <div style="flex:1;min-width:60px">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">温度</div>
          <input type="number" id="aiDebugTemp" class="edit-input" value="0.7" step="0.05" min="0" max="2" style="margin-bottom:0">
        </div>
        <div style="flex:1;min-width:70px">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">最大 Token</div>
          <input type="number" id="aiDebugTokens" class="edit-input" value="1024" step="64" min="64" max="4096" style="margin-bottom:0">
        </div>
        <div style="display:flex;align-items:flex-end"><button id="aiDebugClear" class="btn-sm btn-outline" style="margin-bottom:0">清空</button></div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:6px">
        <div style="flex:2">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">System Prompt</div>
          <input type="text" id="aiDebugSystem" class="edit-input" value="你是一个有帮助的AI助手" style="margin-bottom:0">
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:10px">
        <div style="flex:2">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">API 地址</div>
          <input type="text" id="aiDebugApiUrl" class="edit-input" style="margin-bottom:0;background:var(--filter-bg);color:var(--text-secondary)" readonly>
        </div>
        <div style="flex:1">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">API Key</div>
          <input type="password" id="aiDebugApiKey" class="edit-input" style="margin-bottom:0;background:var(--filter-bg);color:var(--text-secondary)" readonly>
        </div>
      </div>

      <div id="aiDebugMessages" style="flex:1;overflow-y:auto;background:var(--bg);border-radius:8px;padding:12px;font-size:.85rem;line-height:1.6;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">
        <div style="color:var(--text-secondary);text-align:center;padding:20px">输入消息开始调试 AI</div>
      </div>

      <div style="display:flex;gap:8px">
        <textarea id="aiDebugInput" class="edit-input" rows="2" placeholder="输入消息..." style="flex:1;margin-bottom:0;resize:none"></textarea>
        <button id="aiDebugSend" class="btn-primary" style="align-self:flex-end;padding:8px 20px">发送</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ─── Refs ───
  const sourceSelect = overlay.querySelector('#aiDebugSource') as HTMLSelectElement;
  const modelSelect = overlay.querySelector('#aiDebugModel') as HTMLSelectElement;
  const apiUrlInput = overlay.querySelector('#aiDebugApiUrl') as HTMLInputElement;
  const apiKeyInput = overlay.querySelector('#aiDebugApiKey') as HTMLInputElement;
  const messagesDiv = overlay.querySelector('#aiDebugMessages') as HTMLElement;
  const inputEl = overlay.querySelector('#aiDebugInput') as HTMLTextAreaElement;
  const sendBtn = overlay.querySelector('#aiDebugSend') as HTMLButtonElement;
  const clearBtn = overlay.querySelector('#aiDebugClear') as HTMLButtonElement;
  const closeBtn = overlay.querySelector('#aiDebugClose') as HTMLElement;

  // ─── Update API info when source changes ───
  function updateApiInfo(): void {
    const prefer = sourceSelect.value as 'remote' | 'local';
    const config = store.getApiConfig(prefer);
    apiUrlInput.value = config.apiBaseUrl;
    apiKeyInput.value = config.apiKey ? config.apiKey.slice(0, 20) + '...' : '(空)';
    // Pre-fill model with saved config
    const saved = config.apiModel;
    const opts = modelSelect.options;
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].value === saved) { opts[i].selected = true; break; }
    }
  }

  sourceSelect.addEventListener('change', updateApiInfo);

  // ─── Populate model select ───
  const models = ['deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner', 'deepseek-coder', 'deepseek-v4-pro', 'gpt-4o', 'gpt-4o-mini', 'claude-3-sonnet', 'claude-3-haiku', 'qwen2.5', 'qwen2.5-coder', 'llama3.1'];
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    modelSelect.appendChild(opt);
  });
  updateApiInfo();

  // ─── Messages ───
  function addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    const div = document.createElement('div');
    div.style.cssText = `padding:8px 12px;border-radius:8px;max-width:85%;white-space:pre-wrap;word-break:break-word;font-size:.85rem;line-height:1.6`;
    if (role === 'user') div.style.cssText += `background:var(--primary);color:#fff;align-self:flex-end`;
    else if (role === 'assistant') div.style.cssText += `background:var(--card-bg);border:1px solid var(--border);align-self:flex-start`;
    else div.style.cssText += `background:var(--tag-bg);color:var(--text-secondary);align-self:flex-start;font-size:.78rem`;
    div.textContent = content;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ─── Send ───
  async function sendMessage(): Promise<void> {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    addMessage('user', text);
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳';

    const prefer = sourceSelect.value as 'remote' | 'local';
    const apiCfg = store.getApiConfig(prefer);
    const system = (overlay.querySelector('#aiDebugSystem') as HTMLInputElement).value.trim() || '你是一个有帮助的AI助手';
    const model = modelSelect.value || apiCfg.apiModel;
    const temp = parseFloat((overlay.querySelector('#aiDebugTemp') as HTMLInputElement).value) || 0.7;
    const maxTokens = parseInt((overlay.querySelector('#aiDebugTokens') as HTMLInputElement).value) || 1024;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiCfg.apiKey) headers['Authorization'] = `Bearer ${apiCfg.apiKey}`;
      const res = await fetch(`${apiCfg.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST', headers,
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: text }], max_tokens: maxTokens, temperature: temp }),
      });
      if (!res.ok) { const errText = await res.text().catch(() => ''); addMessage('system', `❌ HTTP ${res.status}: ${errText.slice(0, 500)}`); return; }
      const data = await res.json();
      const reply = (data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || data.response || JSON.stringify(data, null, 2).slice(0, 2000)).toString().trim();
      addMessage('assistant', reply || '(空响应)');
    } catch (err: unknown) { addMessage('system', `❌ 请求失败: ${(err as Error).message}`); }
    finally { sendBtn.disabled = false; sendBtn.textContent = '发送'; }
  }

  // ─── Bind ───
  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  clearBtn.addEventListener('click', () => { messagesDiv.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:20px">已清空</div>'; });
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
