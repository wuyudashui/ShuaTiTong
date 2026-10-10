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
}

function showQuestionPool(load: (questions: Question[], name?: string) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'questionPoolModal';
  const developer = !!store.aiSettings.devMode;
  overlay.innerHTML = `<section class="modal pool-modal" role="dialog" aria-modal="true" aria-labelledby="poolTitle">
    <div class="pool-heading"><div><span class="eyebrow">QUESTION LIBRARY</span><h2 id="poolTitle">题库池</h2></div><button id="poolClose" class="btn-outline" aria-label="关闭题库池">关闭</button></div>
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
        <label for="publishFile">题库 JSON</label><input id="publishFile" type="file" accept=".json,application/json">
        <label for="publishFilename">文件名</label><input id="publishFilename" placeholder="linear-algebra.json" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*\.json" required class="edit-input">
        <label for="publishName">题库名称</label><input id="publishName" required class="edit-input">
        <label for="publishSubject">科目</label><input id="publishSubject" required class="edit-input">
        <label for="publishDescription">简介</label><textarea id="publishDescription" class="edit-input" rows="2"></textarea>
        <label class="checkbox-label"><input type="checkbox" id="publishOverwrite"> 更新同名题库（覆盖已有版本）</label>
        <button id="publishSubmit" class="btn-primary" type="submit">发布到 GitHub</button>
      </form></details>` : ''}
  </section>`;
  document.body.appendChild(overlay);
  const status = overlay.querySelector('#poolStatus') as HTMLElement;
  const list = overlay.querySelector('#poolList') as HTMLElement;
  const search = overlay.querySelector('#poolSearch') as HTMLInputElement;
  let banks: Bank[] = [], subject = '';
  let bankRequest: AbortController | null = null;
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
      <div class="pool-card-actions"><button class="btn-primary" data-load="${index}">开始刷题</button><button class="btn-outline" data-preview="${index}">预览</button><a class="bank-download" href="${escapeHtml(staticUrl(bank.path))}" download="${escapeHtml(bank.filename)}" title="下载 JSON 题库" aria-label="下载 ${escapeHtml(bank.name)}"><span class="svg-icon">${DOWNLOAD}</span></a></div></article>`).join('');
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
  }
  search.addEventListener('input', render);
  fetch(staticUrl('question-banks/catalog.json'), { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error('题库目录加载失败');
    const catalog = await response.json();
    if (!Array.isArray(catalog.banks)) throw new Error('题库目录格式无效');
    banks = catalog.banks.filter((bank: Bank) => typeof bank.path === 'string' && /^question-banks\/[a-zA-Z0-9_-]+\.json$/.test(bank.path));
    const subjects = overlay.querySelector('#poolSubjects')!;
    ['全部', ...new Set(banks.map(bank => bank.subject || '综合'))].forEach(label => {
      const chip = document.createElement('button'); chip.className = 'filter-chip'; chip.textContent = label;
      chip.addEventListener('click', () => { subject = label === '全部' ? '' : label; subjects.querySelectorAll('button').forEach(b => b.classList.remove('active')); chip.classList.add('active'); render(); });
      if (label === '全部') chip.classList.add('active'); subjects.appendChild(chip);
    });
    render();
  }).catch(error => { status.textContent = `${error.message}，请刷新页面重试。`; });
  if (developer) bindPublisher(overlay);
}

function bindPublisher(overlay: HTMLElement): void {
  let token = '', server = '';
  const $ = <T extends HTMLElement>(id: string) => overlay.querySelector(`#${id}`) as T;
  const status = $('publisherStatus');
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(server + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
    return data;
  };
  $('publisherConnect').addEventListener('click', async () => {
    const button = $<HTMLButtonElement>('publisherConnect'); button.disabled = true;
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
    } catch (error) { status.textContent = error instanceof Error ? error.message : '无法连接，请在开发者主机启动发布服务。'; }
    finally { button.disabled = false; }
  });
  $<HTMLInputElement>('publishFile').addEventListener('change', () => {
    const file = $<HTMLInputElement>('publishFile').files?.[0];
    if (file) { $<HTMLInputElement>('publishFilename').value = /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.json$/.test(file.name) ? file.name : ''; $<HTMLInputElement>('publishName').value = file.name.replace(/\.json$/i, ''); }
  });
  $('publishForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $<HTMLButtonElement>('publishSubmit'); button.disabled = true;
    try {
      const file = $<HTMLInputElement>('publishFile').files?.[0];
      const questions = file ? normalizeQuestions(JSON.parse(await file.text())) : normalizeQuestions(store.state.questions);
      status.textContent = '正在发布题库…';
      await request('/api/question-banks', { filename: $<HTMLInputElement>('publishFilename').value.trim(), name: $<HTMLInputElement>('publishName').value.trim(), subject: $<HTMLInputElement>('publishSubject').value.trim(), description: $<HTMLTextAreaElement>('publishDescription').value.trim(), questions, overwrite: $<HTMLInputElement>('publishOverwrite').checked });
      status.textContent = `已发布 ${questions.length} 道题，网站完成自动部署后可在题库池查看。`;
    } catch (error) { status.textContent = error instanceof Error ? error.message : '发布失败'; }
    finally { button.disabled = false; }
  });
}
