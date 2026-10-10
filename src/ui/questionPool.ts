import type { Question } from '../types';
import { store } from '../state';
import { escapeHtml, renderText } from '../format';
import { normalizeQuestions } from '../questions';
import { BOOK_OPEN, DOWNLOAD } from '../icons';

interface Bank {
  filename: string; name: string; subject: string; description: string;
  path: string; count: number; updatedAt?: string;
}

const staticUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export function initQuestionPool(load: (questions: Question[], name?: string) => void): void {
  const button = document.getElementById('questionPoolBtn')!;
  button.addEventListener('click', () => showQuestionPool(load));
  document.getElementById('chooseBankBtn')!.addEventListener('click', () => showQuestionPool(load));
  const download = document.getElementById('appDownloadBtn') as HTMLAnchorElement;
  download.href = import.meta.env.VITE_APP_DOWNLOAD_URL || 'https://github.com/wuyudashui/ShuaTiTong/releases/download/android-latest/shuatitong.apk';
  download.addEventListener('click', event => {
    event.preventDefault();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay'; overlay.id = 'appDownloadModal';
    overlay.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="appDownloadTitle">
      <h2 id="appDownloadTitle">下载 Android APP</h2>
      <p class="download-notice">题库和学习进度保存在当前设备本机，网页与 APP 不共享进度。卸载重装或清除应用数据后，学习进度会重置，请先备份自己的题库。</p>
      <p class="muted">单纯下载 APK 文件不会清除已安装 APP 的数据。当前为测试安装包，若需卸载旧版才能安装，请留意本地数据备份。</p>
      <div class="modal-actions"><button id="appDownloadCancel" class="btn-outline">取消</button><a id="appDownloadConfirm" class="btn-primary app-download" href="${escapeHtml(download.href)}">了解并下载</a></div>
    </section>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.querySelector('#appDownloadCancel')!.addEventListener('click', close);
    overlay.querySelector('#appDownloadConfirm')!.addEventListener('click', () => window.setTimeout(close, 0));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    (overlay.querySelector('#appDownloadConfirm') as HTMLElement).focus();
  });
}

function showQuestionPool(load: (questions: Question[], name?: string) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'questionPoolModal';
  const developer = !!store.aiSettings.devMode;
  overlay.innerHTML = `<section class="modal pool-modal" role="dialog" aria-modal="true" aria-labelledby="poolTitle">
    <div class="pool-heading"><div><span class="eyebrow">QUESTION LIBRARY</span><h2 id="poolTitle">题库池</h2></div><div class="pool-header-actions">${developer ? '<button id="poolManageBtn" class="btn-outline">维护题库</button>' : ''}<button id="poolClose" class="btn-outline" aria-label="关闭题库池">关闭</button></div></div>
    <div class="pool-body">
    <p class="muted">选择科目，开始练习。题库由开发者维护，学习进度保存在本机。</p>
    <label class="sr-only" for="poolSearch">搜索题库</label><input id="poolSearch" type="search" placeholder="搜索科目或题库名称" class="edit-input">
    <div id="poolSubjects" class="pool-subjects"></div>
    <div id="poolStatus" class="pool-status" role="status">正在加载题库目录…</div>
    <div id="poolList" class="pool-list"></div>
    ${developer ? `<details id="publisherPanel" class="publisher-panel"><summary>开发者题库维护</summary>
      <p class="muted">在开发者主机连接发布服务，验证后可发布题库。发布后网站会自动更新。</p>
      <label for="publisherServer">发布服务地址</label><input id="publisherServer" value="${escapeHtml(import.meta.env.DEV ? '/publisher' : 'http://127.0.0.1:3001')}" class="edit-input">
      <div class="publisher-credentials"><div><label for="publisherUser">账号</label><input id="publisherUser" autocomplete="username" class="edit-input"></div><div><label for="publisherPassword">密码</label><input id="publisherPassword" type="password" autocomplete="current-password" class="edit-input"></div></div>
      <button id="publisherConnect" class="btn-outline">连接发布服务</button><p id="publisherStatus" class="muted" role="status"></p>
      <form id="publishForm" class="hidden">
        <div class="publisher-edit-heading"><strong id="publishMode">新增公共题库</strong><button type="button" id="publishNew" class="btn-outline">新增题库</button></div>
        <p id="publishHint" class="muted">选择 JSON 文件，或使用当前已加载的本地题库。</p>
        <label for="publishFile">题库 JSON</label><input id="publishFile" type="file" accept=".json,application/json">
        <label for="publishFilename">文件名</label><input id="publishFilename" placeholder="linear-algebra.json" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*\\.json" required class="edit-input">
        <label for="publishName">题库名称</label><input id="publishName" required class="edit-input">
        <label for="publishSubject">科目</label><input id="publishSubject" required class="edit-input">
        <label for="publishDescription">简介</label><textarea id="publishDescription" class="edit-input" rows="2"></textarea>
        <label class="checkbox-label"><input type="checkbox" id="publishOverwrite"> 更新同名题库（覆盖已有版本）</label>
        <div class="publisher-save-actions"><button id="publishSubmit" class="btn-primary" type="submit">发布到 GitHub</button><button type="button" id="publishDelete" class="btn-outline hidden">删除公共题库</button></div>
      </form><p class="developer-note">此区域用于开发者统一管理平台公共题库。如需共同管理，请联系 <a href="mailto:2442078047@qq.com">2442078047@qq.com</a>。</p></details>` : ''}
    </div>
  </section>`;
  document.body.appendChild(overlay);
  const status = overlay.querySelector('#poolStatus') as HTMLElement;
  const list = overlay.querySelector('#poolList') as HTMLElement;
  const search = overlay.querySelector('#poolSearch') as HTMLInputElement;
  let banks: Bank[] = [], subject = '';
  let bankRequest: AbortController | null = null;
  let publisher: ReturnType<typeof bindPublisher> | null = null;
  const close = () => { bankRequest?.abort(); bankRequest = null; overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('#poolClose')!.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  function render(): void {
    const keyword = search.value.trim().toLowerCase();
    const filtered = banks.filter(bank => (!subject || bank.subject === subject) && `${bank.name} ${bank.subject} ${bank.description}`.toLowerCase().includes(keyword));
    list.innerHTML = filtered.map((bank, index) => `<article class="pool-card"><div class="pool-card-icon"><span class="svg-icon">${BOOK_OPEN}</span></div>
      <div class="pool-card-content"><span class="pool-subject">${escapeHtml(bank.subject || '综合')}</span><h3>${escapeHtml(bank.name)}</h3><p>${escapeHtml(bank.description || '按题型练习，循序掌握知识点。')}</p><span class="pool-count">${bank.count} 道题目</span></div>
      <div class="pool-card-actions"><button class="btn-primary" data-load="${index}">开始刷题</button><button class="btn-outline" data-preview="${index}">预览</button><a class="bank-download" href="${escapeHtml(staticUrl(bank.path))}" download="${escapeHtml(bank.filename)}" title="下载 JSON 题库" aria-label="下载 ${escapeHtml(bank.name)}"><span class="svg-icon">${DOWNLOAD}</span></a>${developer ? `<button class="btn-outline bank-manage" data-manage="${index}">管理</button>` : ''}</div></article>`).join('');
    status.textContent = filtered.length ? `共 ${filtered.length} 个题库` : '没有找到匹配的题库';
    list.querySelectorAll<HTMLButtonElement>('[data-load], [data-preview]').forEach(btn => btn.addEventListener('click', async () => {
      const bank = filtered[Number(btn.dataset.load ?? btn.dataset.preview)];
      bankRequest?.abort();
      const controller = new AbortController(); bankRequest = controller;
      btn.disabled = true;
      status.textContent = `正在加载「${bank.name}」…`;
      try {
        const response = await fetch(staticUrl(bank.path), { signal: controller.signal });
        if (!response.ok) throw new Error('题库文件加载失败，请稍后重试');
        const questions = normalizeQuestions(await response.json());
        if (bankRequest !== controller || !overlay.isConnected) return;
        if (btn.dataset.load !== undefined) { load(questions, bank.name); close(); document.getElementById('questionCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else {
          const preview = document.createElement('div');
          preview.className = 'pool-preview';
          preview.innerHTML = `<h3>${escapeHtml(bank.name)} · 前 3 题</h3>${questions.slice(0, 3).map((q, i) => `<div class="pool-preview-question"><strong>${i + 1}.</strong>${renderText(q.question)}</div>`).join('')}`;
          list.querySelector('.pool-preview')?.remove();
          btn.closest('.pool-card')!.after(preview);
          status.textContent = `共 ${questions.length} 道题，可点击“开始刷题”加载`;
        }
      } catch (error) { if (bankRequest === controller && overlay.isConnected) status.textContent = error instanceof Error ? error.message : '加载失败'; }
      finally { btn.disabled = false; }
    }));
    list.querySelectorAll<HTMLButtonElement>('[data-manage]').forEach(btn => btn.addEventListener('click', () => publisher?.edit(filtered[Number(btn.dataset.manage)])));
  }
  function setCatalog(items: Bank[]): void {
    banks = items.filter(bank => typeof bank.path === 'string' && /^question-banks\/[a-zA-Z0-9_-]+\.json$/.test(bank.path));
    subject = ''; search.value = '';
    const subjects = overlay.querySelector('#poolSubjects')!; subjects.innerHTML = '';
    ['全部', ...new Set(banks.map(bank => bank.subject || '综合'))].forEach(label => {
      const chip = document.createElement('button'); chip.className = 'filter-chip'; chip.textContent = label;
      chip.addEventListener('click', () => { subject = label === '全部' ? '' : label; subjects.querySelectorAll('button').forEach(b => b.classList.remove('active')); chip.classList.add('active'); render(); });
      if (label === '全部') chip.classList.add('active'); subjects.appendChild(chip);
    });
    render();
  }
  search.addEventListener('input', render);
  fetch(staticUrl('question-banks/catalog.json'), { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error('题库目录加载失败');
    const catalog = await response.json();
    if (!Array.isArray(catalog.banks)) throw new Error('题库目录格式无效');
    if (!publisher?.connected()) setCatalog(catalog.banks);
  }).catch(error => { status.textContent = `${error.message}，请刷新页面重试。`; });
  if (developer) {
    publisher = bindPublisher(overlay, setCatalog);
    overlay.querySelector('#poolManageBtn')!.addEventListener('click', publisher.open);
  }
}

function bindPublisher(overlay: HTMLElement, refresh: (banks: Bank[]) => void) {
  let token = '', server = '';
  const $ = <T extends HTMLElement>(id: string) => overlay.querySelector(`#${id}`) as T;
  const status = $('publisherStatus');
  let editing = '', pending: Bank | null = null;
  let editingVersion = '';
  let editSequence = 0;
  let saving = false;
  const open = () => { ($('publisherPanel') as HTMLDetailsElement).open = true; $('publisherPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const request = async (path: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(server + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
    return data;
  };
  const refreshCatalog = async () => { const catalog = await request('/api/question-banks'); refresh(catalog.banks); };
  const reset = () => {
    if (saving) return;
    ++editSequence;
    editing = ''; pending = null; editingVersion = '';
    ($('publishForm') as HTMLFormElement).reset();
    $<HTMLInputElement>('publishFilename').readOnly = false;
    $('publishMode').textContent = '新增公共题库';
    $('publishHint').textContent = '选择 JSON 文件，或使用当前已加载的本地题库。';
    $('publishSubmit').textContent = '发布到 GitHub'; $('publishDelete').classList.add('hidden');
  };
  async function edit(bank: Bank): Promise<void> {
    if (saving) return;
    const sequence = ++editSequence;
    editing = ''; editingVersion = '';
    $('publishForm').classList.add('hidden');
    open(); pending = bank;
    if (!token) { status.textContent = `连接发布服务后可维护「${bank.name}」。`; $<HTMLInputElement>('publisherUser').focus(); return; }
    try {
      status.textContent = `正在读取「${bank.name}」…`;
      const result = await request(`/api/question-banks/${encodeURIComponent(bank.filename)}`);
      if (sequence !== editSequence || !overlay.isConnected) return;
      const current: Bank = result.bank;
      editing = current.filename;
      editingVersion = result.version || '';
      $<HTMLInputElement>('publishFile').value = '';
      for (const [id, value] of [['publishFilename', current.filename], ['publishName', current.name], ['publishSubject', current.subject], ['publishDescription', current.description]]) $<HTMLInputElement>(id).value = value || '';
      $<HTMLInputElement>('publishFilename').readOnly = true;
      $<HTMLInputElement>('publishOverwrite').checked = true;
      $('publishMode').textContent = `维护「${current.name}」`;
      $('publishHint').textContent = '直接修改名称、科目和简介；需要替换题目时选择新的 JSON 文件。';
      $('publishSubmit').textContent = '保存更新'; $('publishDelete').classList.remove('hidden');
      $('publishForm').classList.remove('hidden');
      status.textContent = `已读取 ${result.questions.length} 道题，修改后点击保存。`;
    } catch (error) { if (sequence === editSequence && overlay.isConnected) status.textContent = error instanceof Error ? error.message : '题库读取失败'; }
  }
  $('publishNew').addEventListener('click', reset);
  $('publisherConnect').addEventListener('click', async () => {
    const button = $<HTMLButtonElement>('publisherConnect'); button.disabled = true;
    ++editSequence;
    $('publishForm').classList.add('hidden');
    server = $<HTMLInputElement>('publisherServer').value.trim().replace(/\/+$/, '');
    token = ''; status.textContent = '连接中…';
    try {
      if (server !== '/publisher' && !/^https?:\/\//.test(server)) throw new Error('请输入 HTTP(S) 服务地址');
      const password = $<HTMLInputElement>('publisherPassword');
      const login = await request('/api/auth/root/login', { username: $<HTMLInputElement>('publisherUser').value.trim(), password: password.value });
      password.value = ''; token = login.token;
      const connection = await request('/api/publisher/status');
      status.textContent = connection.configured ? '已连接，可发布题库。' : '服务已连接，请在开发者主机配置 GitHub 发布凭据。';
      $('publishForm').classList.toggle('hidden', !connection.configured);
      if (connection.configured) { await refreshCatalog(); if (pending) await edit(pending); }
    } catch (error) { status.textContent = error instanceof Error ? error.message : '无法连接，请在开发者主机启动发布服务。'; }
    finally { button.disabled = false; }
  });
  $<HTMLInputElement>('publishFile').addEventListener('change', () => {
    const file = $<HTMLInputElement>('publishFile').files?.[0];
    if (file && !editing) { $<HTMLInputElement>('publishFilename').value = /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.json$/.test(file.name) ? file.name : ''; $<HTMLInputElement>('publishName').value = file.name.replace(/\.json$/i, ''); }
  });
  $('publishForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const button = $<HTMLButtonElement>('publishSubmit'); button.disabled = true;
    $<HTMLButtonElement>('publishNew').disabled = true; $<HTMLButtonElement>('publishDelete').disabled = true;
    try {
      const file = $<HTMLInputElement>('publishFile').files?.[0];
      const metadata = { name: $<HTMLInputElement>('publishName').value.trim(), subject: $<HTMLInputElement>('publishSubject').value.trim(), description: $<HTMLTextAreaElement>('publishDescription').value.trim() };
      status.textContent = '正在发布题库…';
      let saved: { commitSha?: string };
      if (editing && !file) saved = await request(`/api/question-banks/${encodeURIComponent(editing)}`, { ...metadata, ...(editingVersion ? { version: editingVersion } : {}) }, 'PATCH');
      else {
        const questions = file ? normalizeQuestions(JSON.parse(await file.text())) : normalizeQuestions(store.state.questions);
        saved = await request('/api/question-banks', { ...metadata, filename: editing || $<HTMLInputElement>('publishFilename').value.trim(), questions, overwrite: editing ? true : $<HTMLInputElement>('publishOverwrite').checked, ...(editingVersion ? { version: editingVersion } : {}) });
      }
      if (editing) editingVersion = saved.commitSha || editingVersion;
      $<HTMLInputElement>('publishFile').value = '';
      try { await refreshCatalog(); status.textContent = '已保存到 GitHub，网站自动部署后对其他用户生效。'; }
      catch { status.textContent = '已保存到 GitHub，但目录刷新失败；请重新打开题库池查看，不必重复发布。'; }
    } catch (error) { status.textContent = error instanceof Error ? error.message : '发布失败'; }
    finally { saving = false; button.disabled = false; $<HTMLButtonElement>('publishNew').disabled = false; $<HTMLButtonElement>('publishDelete').disabled = false; }
  });
  $('publishDelete').addEventListener('click', async () => {
    if (saving) return;
    if (!editing || !confirm(`确定从公共题库池删除「${$<HTMLInputElement>('publishName').value}」？本机已加载的练习数据会保留。`)) return;
    const button = $<HTMLButtonElement>('publishDelete'); button.disabled = true;
    saving = true; $<HTMLButtonElement>('publishSubmit').disabled = true; $<HTMLButtonElement>('publishNew').disabled = true;
    try {
      await request(`/api/question-banks/${encodeURIComponent(editing)}`, { confirm: true, ...(editingVersion ? { version: editingVersion } : {}) }, 'DELETE');
      saving = false; reset();
      try { await refreshCatalog(); status.textContent = '公共题库已删除，网站完成自动部署后生效。'; }
      catch { status.textContent = '公共题库已删除，但目录刷新失败；请重新打开题库池查看。'; }
    } catch (error) { status.textContent = error instanceof Error ? error.message : '删除失败'; }
    finally { saving = false; button.disabled = false; $<HTMLButtonElement>('publishSubmit').disabled = false; $<HTMLButtonElement>('publishNew').disabled = false; }
  });
  return { open, edit, connected: () => !!token };
}
