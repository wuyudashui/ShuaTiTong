import { store } from '../state';
import type { UserTier } from '../types';
import { defaultPublisherServer, publisherServer, saveDeveloperSession, clearDeveloperSession, getDeveloperSession } from '../developerSession';
import { escapeHtml } from '../format';

export function getUserTier(): UserTier {
  return store.aiSettings.userTier || 'guest';
}

export function isAtLeast(tier: UserTier): boolean {
  const levels: Record<UserTier, number> = { guest: 0, premium: 1, root: 2 };
  return levels[getUserTier()] >= levels[tier];
}

export function logout(): void {
  clearDeveloperSession();
  sessionStorage.removeItem('shuatitong_dev');
  store.updateAISettings({
    userTier: undefined, devMode: false,
    syncToken: undefined, syncUsername: undefined, syncServer: undefined,
  });
  location.reload();
}

export function showDevLogin(callback: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:360px">
      <h2>开发者验证</h2>
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:16px">输入账号密码解锁对应权限</p>
      <details class="developer-service"><summary>发布服务地址</summary><label for="devLoginServer">开发者主机</label><input id="devLoginServer" type="text" class="edit-input" value="${escapeHtml(getDeveloperSession()?.server || defaultPublisherServer())}"><p class="muted">登录时同步连接公共题库发布服务，无需在题库池重复验证。</p></details>
      <label for="devLoginUser">账号</label>
      <input type="text" id="devLoginUser" class="edit-input" autocomplete="username" placeholder="输入账号" style="margin-bottom:12px">
      <label for="devLoginPwd">密码</label>
      <input type="password" id="devLoginPwd" class="edit-input" autocomplete="current-password" placeholder="输入密码" style="margin-bottom:16px">
      <div id="loginErr" style="display:none;color:var(--wrong);font-size:.82rem;margin-bottom:12px"></div>
      <div class="modal-actions">
        <button id="devLoginCancel" class="btn-outline">取消</button>
        <button id="devLoginConfirm" class="btn-primary">验证</button>
      </div>
      <p class="developer-note">此模式用于开发者统一管理平台公共题库。如需共同管理，请联系 <a href="mailto:2442078047@qq.com">2442078047@qq.com</a>。</p>
    </div>
  `;
  document.body.appendChild(overlay);

  let loginRequest: AbortController | null = null;
  const close = () => { loginRequest?.abort(); overlay.remove(); };
  overlay.querySelector('#devLoginCancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const confirm = overlay.querySelector('#devLoginConfirm') as HTMLButtonElement;
  confirm.addEventListener('click', async () => {
    const user = (overlay.querySelector('#devLoginUser') as HTMLInputElement).value.trim();
    const pwd = (overlay.querySelector('#devLoginPwd') as HTMLInputElement).value;
    const err = overlay.querySelector('#loginErr') as HTMLElement;

    confirm.disabled = true;
    loginRequest = new AbortController();
    const timeout = window.setTimeout(() => loginRequest?.abort(), 5000);
    let notice = '';
    try {
    const server = publisherServer((overlay.querySelector('#devLoginServer') as HTMLInputElement).value);
    let response: Response | null = null;
    let networkError = false;
    try {
      response = await fetch(`${server}/api/auth/root/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pwd }), signal: loginRequest.signal });
    } catch { networkError = true; }
    if (!overlay.isConnected) return;
    let accepted = false;
    if (response?.ok) {
      const session = await response.json();
      if (session.tier !== 'root' || typeof session.token !== 'string' || !session.token) throw new Error('发布服务返回无效的登录信息');
      if (!overlay.isConnected) return;
      saveDeveloperSession({ server, token: session.token, username: session.username || user });
      accepted = true;
    } else if (networkError || response?.status === 502 || response?.status === 503 || response?.status === 504) {
      // Offline local editing remains available; it never grants GitHub write access.
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
      const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
      accepted = user === 'yuhao' && hash === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
      if (accepted) { clearDeveloperSession(); notice = '开发者模式已开启；发布服务暂未连接，可先编辑本地题库。'; }
    }
    if (accepted) {
      if (!overlay.isConnected) return;
      sessionStorage.setItem('shuatitong_dev', 'true');
      store.updateAISettings({ userTier: 'root', devMode: true });
      close();
      callback();
      // Show brief notification
      const tip = document.createElement('div');
      tip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:var(--correct);color:#fff;padding:12px 24px;border-radius:8px;font-size:.88rem;box-shadow:0 4px 12px rgba(0,0,0,.15)';
      tip.textContent = notice || '开发者模式已开启，题库池复用本次登录。';
      document.body.appendChild(tip);
      setTimeout(() => tip.remove(), 2000);
      return;
    }

    err.textContent = '账号或密码错误';
    err.style.display = '';
    } catch (error) {
      err.textContent = error instanceof Error ? error.message : '无法完成验证，请使用 HTTPS 或 localhost 打开网页。';
      err.style.display = '';
    } finally { window.clearTimeout(timeout); confirm.disabled = false; }
  });
  overlay.addEventListener('keydown', e => { if (e.key === 'Enter') confirm.click(); if (e.key === 'Escape') close(); });
  (overlay.querySelector('#devLoginUser') as HTMLInputElement).focus();
}
