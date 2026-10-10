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

  const close = () => overlay.remove();
  overlay.querySelector('#devLoginCancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const confirm = overlay.querySelector('#devLoginConfirm') as HTMLButtonElement;
  confirm.addEventListener('click', async () => {
    const user = (overlay.querySelector('#devLoginUser') as HTMLInputElement).value.trim();
    const pwd = (overlay.querySelector('#devLoginPwd') as HTMLInputElement).value;
    const err = overlay.querySelector('#loginErr') as HTMLElement;

    confirm.disabled = true;
    try {
    // UI unlock only. GitHub writes require separate server authentication.
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
    const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    if (user === 'yuhao' && hash === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92') {
      sessionStorage.setItem('shuatitong_dev', 'true');
      store.updateAISettings({ userTier: 'root', devMode: true });
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
    } catch {
      err.textContent = '无法完成验证，请使用 HTTPS 或 localhost 打开网页。';
      err.style.display = '';
    } finally { confirm.disabled = false; }
  });
  overlay.addEventListener('keydown', e => { if (e.key === 'Enter') confirm.click(); if (e.key === 'Escape') close(); });
  (overlay.querySelector('#devLoginUser') as HTMLInputElement).focus();
}
