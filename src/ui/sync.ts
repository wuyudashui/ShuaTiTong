import { store } from '../state';
import { escapeHtml } from '../format';

async function api(path: string, options?: RequestInit): Promise<any> {
  const server = store.aiSettings.syncServer || 'http://localhost:3001';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (store.aiSettings.syncToken) headers['Authorization'] = 'Bearer ' + store.aiSettings.syncToken;
  const res = await fetch(server + path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function showSyncModal(): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const hasToken = !!store.aiSettings.syncToken;

  overlay.innerHTML = `
    <div class="modal" style="max-width:440px">
      <h2><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>数据同步</h2>
      ${hasToken ? `
        <p style="color:var(--text-secondary);margin-bottom:12px">
          已登录：<strong>${escapeHtml(store.aiSettings.syncUsername || 'root')}</strong>
        </p>
        <div style="background:var(--tag-bg);padding:14px;border-radius:8px;margin-bottom:16px;font-size:.85rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span>服务器</span>
            <span>${escapeHtml(store.aiSettings.syncServer || 'http://localhost:3001')}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>状态</span>
            <span id="syncStatusText">检查中...</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button id="syncDownloadBtn" class="btn-primary" style="flex:1"><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>从服务器下载</button>
          <button id="syncUploadBtn" class="btn-outline" style="flex:1"><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span>上传到服务器</button>
        </div>
        <div id="syncResult" style="font-size:.85rem;margin-bottom:8px"></div>
        <div class="modal-actions">
          <button id="syncLogout" class="btn-outline" style="color:var(--wrong)">退出登录</button>
          <button id="syncClose" class="btn-primary">完成</button>
        </div>
      ` : `
        <p style="color:var(--text-secondary);margin-bottom:16px">登录后可在多设备间同步题库数据。游客模式使用本地数据即可。</p>
        <label>服务器地址</label>
        <input type="text" id="syncServerInput" class="edit-input" value="${escapeHtml(store.aiSettings.syncServer || 'http://')}" placeholder="http://电脑IP:3001" style="margin-bottom:12px">
        <label>用户名</label>
        <input type="text" id="syncUsername" class="edit-input" value="root" style="margin-bottom:12px">
        <label>密码</label>
        <input type="password" id="syncPassword" class="edit-input" value="linux" style="margin-bottom:16px">
        <div class="modal-actions">
          <button id="syncLoginBtn" class="btn-primary">🔐 登录</button>
          <button id="syncClose2" class="btn-outline">取消</button>
        </div>
      `}
    </div>
  `;
  document.body.appendChild(overlay);

  if (hasToken) {
    api('/api/status').then(() => {
      document.getElementById('syncStatusText')!.textContent = '✅ 已连接';
    }).catch(() => {
      document.getElementById('syncStatusText')!.textContent = '❌ 无法连接';
    });

    overlay.querySelector('#syncClose')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#syncLogout')?.addEventListener('click', () => {
      store.updateAISettings({ syncToken: undefined, syncUsername: undefined });
      overlay.remove();
    });
    overlay.querySelector('#syncDownloadBtn')?.addEventListener('click', async () => {
      const result = document.getElementById('syncResult')!;
      result.textContent = '⏳ 下载中...';
      try {
        const qs = await api('/api/questions');
        store.state.questions.splice(0, store.state.questions.length, ...qs);
        store.update({ currentIndex: 0, filterType: 'all', correctCount: 0, wrongCount: 0, answeredMap: {}, errorBook: {} });
        store.save();
        result.innerHTML = '✅ 已下载 ' + qs.length + ' 题';
      } catch (e: any) { result.innerHTML = '❌ ' + e.message; }
    });
    overlay.querySelector('#syncUploadBtn')?.addEventListener('click', async () => {
      const result = document.getElementById('syncResult')!;
      result.textContent = '⏳ 上传中...';
      try {
        const qs = store.state.questions;
        const res = await api('/api/questions', { method: 'PUT', body: JSON.stringify(qs) });
        result.innerHTML = '✅ 已上传 ' + res.count + ' 题';
      } catch (e: any) { result.innerHTML = '❌ ' + e.message; }
    });
  } else {
    overlay.querySelector('#syncClose2')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#syncLoginBtn')?.addEventListener('click', async () => {
      const server = (overlay.querySelector('#syncServerInput') as HTMLInputElement).value.trim();
      const username = (overlay.querySelector('#syncUsername') as HTMLInputElement).value.trim();
      const password = (overlay.querySelector('#syncPassword') as HTMLInputElement).value;
      if (!server || !username || !password) { alert('请填写完整信息'); return; }
      try {
        const res = await fetch(server + '/api/auth/root/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error); return; }
        store.updateAISettings({ syncToken: data.token, syncUsername: data.username, syncServer: server });
        overlay.remove();
        alert('登录成功！请重新打开同步面板下载数据。');
      } catch { alert('无法连接服务器，请检查地址和网络。'); }
    });
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
