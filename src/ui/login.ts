import { store } from '../state';
import type { UserTier } from '../types';

export function getUserTier(): UserTier {
  return store.aiSettings.userTier || 'guest';
}

export function isAtLeast(tier: UserTier): boolean {
  const levels: Record<UserTier, number> = { guest: 0, premium: 1, root: 2 };
  return levels[getUserTier()] >= levels[tier];
}

export function logout(): void {
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
      <label>账号</label>
      <input type="text" id="devLoginUser" class="edit-input" placeholder="输入账号" style="margin-bottom:12px">
      <label>密码</label>
      <input type="password" id="devLoginPwd" class="edit-input" placeholder="输入密码" style="margin-bottom:16px">
      <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:16px;padding:10px 12px;background:var(--tag-bg);border-radius:8px;line-height:1.6">
        <strong>user</strong> / <strong>123456</strong> — 开发者模式<br>
      <div id="loginErr" style="display:none;color:var(--wrong);font-size:.82rem;margin-bottom:12px"></div>
      <div class="modal-actions">
        <button id="devLoginCancel" class="btn-outline">取消</button>
        <button id="devLoginConfirm" class="btn-primary">验证</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#devLoginCancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#devLoginConfirm')?.addEventListener('click', () => {
    const user = (overlay.querySelector('#devLoginUser') as HTMLInputElement).value.trim();
    const pwd = (overlay.querySelector('#devLoginPwd') as HTMLInputElement).value;
    const err = overlay.querySelector('#loginErr') as HTMLElement;

    if (user === 'root' && pwd === 'linux') {
      store.updateAISettings({ userTier: 'root', devMode: true, syncServer: 'http://localhost:3001' });
      close();
      callback();
      return;
    }
    if (user === 'user' && pwd === '123456') {
      store.updateAISettings({ userTier: 'premium', devMode: true });
      close();
      callback();
      // Show brief notification
      const tip = document.createElement('div');
      tip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:var(--correct);color:#fff;padding:12px 24px;border-radius:8px;font-size:.88rem;box-shadow:0 4px 12px rgba(0,0,0,.15)';
      tip.textContent = '\u2705 开发者模式已开启';
      document.body.appendChild(tip);
      setTimeout(() => tip.remove(), 2000);
      return;
    }

    err.textContent = '账号或密码错误';
    err.style.display = '';
  });
}
