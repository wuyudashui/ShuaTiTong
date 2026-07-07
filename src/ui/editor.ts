import type { Question, ContentBlock } from '../types';
import { store } from '../state';
import { renderText } from '../format';
import { getFiltered } from '../filter';

// ─── Image upload helpers ───

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Edit question modal ───

export function showEditModal(q: Question, index: number, onSaved: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'editModal';

  // Build form content: textarea only shows text blocks, images shown in block list
  const qtext = Array.isArray(q.question)
    ? q.question.filter(b => b.t === 'text').map(b => b.c).join('\n')
    : q.question;

  const isFill = q.type === 'fill';

  overlay.innerHTML = `
    <div class="modal edit-modal">
      <h2><span class="svg-icon">✏️</span>编辑题目 #${q.id}</h2>

      <label>题干</label>
      <textarea class="edit-input edit-question" rows="4">${escapeHtml(qtext)}</textarea>

      <div class="edit-block-list" id="editBlockList">
        <div class="edit-block-header">内容块 (${Array.isArray(q.question) ? q.question.length : 1}个)</div>
        ${renderBlockList(q.question)}
      </div>

      <div class="edit-img-actions">
        <button id="editAddImageBtn" class="btn-sm btn-outline"><span class="svg-icon">🖼</span>添加图片</button>
        <input type="file" id="editImageInput" accept="image/*" style="display:none">
      </div>

      ${isFill ? '' : `
      <label>选项</label>
      <div class="edit-options">
        ${Object.entries(q.options || {}).map(([k, v]) => {
          const optText = Array.isArray(v) ? v.map(b => b.c).join('') : v;
          return `<div class="edit-opt-row">
            <span class="edit-opt-key">${k}</span>
            <textarea class="edit-input edit-opt" data-key="${k}" rows="2">${escapeHtml(optText)}</textarea>
            <button class="edit-opt-del" data-key="${k}" title="删除此选项">✕</button>
          </div>`;
        }).join('')}
      </div>
      <div class="edit-add-opt">
        <input type="text" id="editNewOptKey" class="edit-input" placeholder="新选项字母" maxlength="1" style="width:50px">
        <textarea id="editNewOptVal" class="edit-input" placeholder="选项内容" rows="1" style="flex:1"></textarea>
        <button id="editAddOptBtn" class="btn-sm btn-outline">+ 添加选项</button>
      </div>
      `}

      <label>正确答案</label>
      <input type="text" id="editAnswer" class="edit-input" value="${escapeHtml(q.answer)}" ${isFill ? 'placeholder="填空可留空"' : ''}>

      <label>难度</label>
      <select id="editDifficulty" class="edit-input">
        <option value="易" ${q.difficulty === '易' ? 'selected' : ''}>易</option>
        <option value="中" ${q.difficulty === '中' || !q.difficulty ? 'selected' : ''}>中</option>
        <option value="难" ${q.difficulty === '难' ? 'selected' : ''}>难</option>
      </select>

      <div class="modal-actions">
        <button id="editCancelBtn" class="btn-outline">取消</button>
        <button id="editSaveBtn" class="btn-primary">✏️ 保存修改</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ─── Bind events ───

  const close = () => overlay.remove();

  overlay.querySelector('#editCancelBtn')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Image upload
  const imgInput = overlay.querySelector('#editImageInput') as HTMLInputElement;
  overlay.querySelector('#editAddImageBtn')?.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', async () => {
    const file = imgInput.files?.[0];
    if (!file) return;
    await addImageToEditModal(q, overlay, await readFileAsDataURL(file), file.name);
    imgInput.value = '';
  });

  // Clipboard paste for edit modal
  overlay.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        try { await addImageToEditModal(q, overlay, await readFileAsDataURL(file), '粘贴图片'); }
        catch { alert('剪贴板图片读取失败'); }
      }
    }
  });

  async function addImageToEditModal(q: Question, overlay: HTMLElement, dataUrl: string, name: string): Promise<void> {
    const newBlock: ContentBlock = { t: 'image', c: dataUrl, alt: name };
    let blocks = Array.isArray(q.question) ? [...q.question] : [{ t: 'text' as const, c: q.question }];
    blocks.push(newBlock);
    (q as any).__pendingBlocks = blocks;
    const list = overlay.querySelector('#editBlockList');
    if (list) {
      list.querySelector('.edit-block-header')!.after(renderBlockListHTML(blocks));
      const oldItems = list.querySelectorAll('.edit-block-item:not(.edit-block-header)');
      oldItems.forEach(el => el.remove());
    }
  }

  // Image delete via click on image blocks
  overlay.querySelector('#editBlockList')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.edit-block-item.edit-block-image') as HTMLElement | null;
    if (!item) return;
    if (!confirm('删除这张图片？')) return;
    const idx = Array.from(overlay.querySelectorAll('.edit-block-item.edit-block-image')).indexOf(item);
    let blocks = Array.isArray(q.question) ? [...q.question] : [{ t: 'text' as const, c: q.question }];
    if ((q as any).__pendingBlocks) blocks = [...(q as any).__pendingBlocks];
    // Find the actual image block index (skip non-image blocks)
    const imgIndices = blocks.map((b, i) => b.t === 'image' ? i : -1).filter(i => i >= 0);
    if (idx >= 0 && idx < imgIndices.length) {
      blocks.splice(imgIndices[idx], 1);
      (q as any).__pendingBlocks = blocks;
      // Refresh block list
      const oldItems = overlay.querySelectorAll('.edit-block-item');
      oldItems.forEach(el => el.remove());
      overlay.querySelector('#editBlockList')?.insertAdjacentHTML('beforeend', renderBlockListHTML(blocks));
    }
  });

  // Add option (single/multi only)
  overlay.querySelector('#editAddOptBtn')?.addEventListener('click', () => {
    const keyInput = overlay.querySelector('#editNewOptKey') as HTMLInputElement;
    const valInput = overlay.querySelector('#editNewOptVal') as HTMLTextAreaElement;
    const key = keyInput.value.trim().toUpperCase();
    if (!key || !/^[A-H]$/.test(key)) { alert('选项字母需为 A-H'); return; }
    if (q.options[key]) { alert(`选项 ${key} 已存在`); return; }
    const optDiv = overlay.querySelector('.edit-options');
    const row = document.createElement('div');
    row.className = 'edit-opt-row';
    row.innerHTML = `
      <span class="edit-opt-key">${key}</span>
      <textarea class="edit-input edit-opt" data-key="${key}" rows="2">${escapeHtml(valInput.value)}</textarea>
      <button class="edit-opt-del" data-key="${key}" title="删除此选项">✕</button>
    `;
    optDiv?.appendChild(row);
    row.querySelector('.edit-opt-del')?.addEventListener('click', () => row.remove());
    keyInput.value = '';
    valInput.value = '';
  });

  // Delete option buttons
  overlay.querySelectorAll('.edit-opt-del').forEach(btn => {
    btn.addEventListener('click', () => {
      (btn as HTMLElement).closest('.edit-opt-row')?.remove();
    });
  });

  // Save
  overlay.querySelector('#editSaveBtn')?.addEventListener('click', () => {
    const sourceBlocks: ContentBlock[] = (q as any).__pendingBlocks
      ? [...(q as any).__pendingBlocks]
      : Array.isArray(q.question)
        ? [...q.question]
        : [{ t: 'text' as const, c: q.question }];

    // Split textarea into lines, replace text blocks in order
    const qTextarea = overlay.querySelector('.edit-question') as HTMLTextAreaElement;
    const newTextLines = qTextarea.value.split('\n');

    let textIdx = 0;
    const blocks = sourceBlocks.map(b => {
      if (b.t === 'text' && textIdx < newTextLines.length) {
        return { t: 'text' as const, c: newTextLines[textIdx++] };
      }
      return b;
    });
    // Append remaining text lines
    while (textIdx < newTextLines.length) {
      blocks.push({ t: 'text' as const, c: newTextLines[textIdx++] });
    }

    // Collect options
    const newOptions: Record<string, ContentBlock[] | string> = {};
    overlay.querySelectorAll('.edit-opt').forEach(el => {
      const ta = el as HTMLTextAreaElement;
      const key = ta.dataset.key!;
      const val = ta.value;
      if (val.trim()) {
        newOptions[key] = [{ t: 'text', c: val }];
      }
    });

    // Answer
    const answer = (overlay.querySelector('#editAnswer') as HTMLInputElement).value.trim();
    const difficulty = (overlay.querySelector('#editDifficulty') as HTMLSelectElement).value as any;

    // Apply changes
    q.question = blocks;
    q.options = newOptions;
    q.answer = answer;
    q.difficulty = difficulty;

    store.save();
    close();
    onSaved();
  });
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderBlockList(blocks: ContentBlock[] | string): string {
  return renderBlockListHTML(Array.isArray(blocks) ? blocks : [{ t: 'text' as const, c: blocks as string }]);
}

function renderBlockListHTML(blocks: ContentBlock[]): string {
  return blocks.map((b, i) => {
    const label = { text: '文本', f: '公式', code: '代码', image: '图片' }[b.t] || b.t;
    const preview = b.t === 'image'
      ? `<img src="${escapeHtml(b.c)}" style="max-width:120px;max-height:80px;border-radius:4px">`
      : `<span class="edit-block-preview">${escapeHtml(b.c.slice(0, 60))}${b.c.length > 60 ? '…' : ''}</span>`;
    const typeClass = `edit-block-${b.t}`;
    const extra = b.t === 'image' ? ' title="点击删除此图片"' : '';
    return `<div class="edit-block-item ${typeClass}"${extra}>
      <span class="edit-block-tag">${label}</span>
      ${preview}
      ${b.t === 'image' ? '<span class="edit-block-del">✕</span>' : ''}
    </div>`;
  }).join('');
}

// ─── Export JSON ───

// ─── Insert new question ───

export function showInsertModal(): void {
  const questions = store.state.questions;
  if (!questions.length) {
    alert('请先加载题库。');
    return;
  }

  // Calculate global and relative position
  const filtered = getFiltered(questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter);
  const currentQ = filtered[store.state.currentIndex];
  const globalIdx = currentQ ? questions.indexOf(currentQ) : -1;
  const defaultPos = globalIdx >= 0 ? globalIdx + 1 : questions.length;
  const typeLabel = store.state.filterType !== 'all' ? ({ single: '单选', multi: '多选', judge: '判断', fill: '填空' } as any)[store.state.filterType] || store.state.filterType : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'insertModal';
  overlay.innerHTML = `
    <div class="modal edit-modal">
      <h2>✏️ 插入新题目</h2>

      <label style="margin-top:0">插入位置</label>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <input type="number" id="insPosition" class="edit-input" value="${defaultPos}" min="0" max="${questions.length}" style="width:80px">
        <span style="font-size:.82rem;color:var(--text-secondary)">/ 共 ${questions.length} 题（全局第 ${defaultPos} 位${typeLabel ? `，当前${typeLabel}第 ${store.state.currentIndex + 1} 题` : ''}）</span>
      </div>

      <label style="margin-top:0">题型</label>
      <select id="insType" class="edit-input">
        <option value="single">单选题</option>
        <option value="judge">判断题</option>
        <option value="multi">多选题</option>
        <option value="fill">填空题</option>
      </select>

      <label>题干</label>
      <textarea id="insQuestion" class="edit-input" rows="3" placeholder="输入题目内容..."></textarea>

      <div id="insImageArea" style="margin-bottom:12px">
        <div class="edit-img-actions">
          <button id="insAddImageBtn" class="btn-sm btn-outline"><span class="svg-icon">🖼</span>添加图片</button>
          <input type="file" id="insImageInput" accept="image/*" style="display:none">
        </div>
        <div id="insImagePreview" class="edit-block-list"></div>
      </div>

      <div id="insOptionsArea">
        <label>选项</label>
        <div class="edit-options" id="insOptions">
          ${['A','B','C','D'].map(k => `
            <div class="edit-opt-row">
              <span class="edit-opt-key">${k}</span>
              <textarea class="edit-input edit-opt" data-key="${k}" rows="2" placeholder="选项 ${k}"></textarea>
              <button class="edit-opt-del ins-opt-del" data-key="${k}">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="edit-add-opt" style="margin-bottom:0">
          <input type="text" id="insNewOptKey" class="edit-input" placeholder="字母" maxlength="1" style="width:50px">
          <textarea id="insNewOptVal" class="edit-input" placeholder="选项内容" rows="1" style="flex:1"></textarea>
          <button id="insAddOptBtn" class="btn-sm btn-outline">+</button>
        </div>
      </div>

      <div id="insFillArea" style="display:none">
        <label>填空答案</label>
        <textarea id="insFillAnswer" class="edit-input" rows="2" placeholder='格式: 空1=答案1, 空2=答案2'"></textarea>
      </div>

      <label>正确答案</label>
      <input type="text" id="insAnswer" class="edit-input" placeholder="如: A 或 ABC">

      <label>难度</label>
      <select id="insDifficulty" class="edit-input">
        <option value="易">易</option>
        <option value="中" selected>中</option>
        <option value="难">难</option>
      </select>

      <details style="margin-top:12px;font-size:.85rem">
        <summary style="cursor:pointer;color:var(--text-secondary)">📋 从 JSON 导入</summary>
        <textarea id="insJsonInput" class="edit-input" rows="6" style="margin-top:6px" placeholder='{"question": "...", "options": {"A":"...","B":"..."}, "answer": "A"}'></textarea>
        <button id="insJsonParseBtn" class="btn-sm btn-outline" style="margin-top:4px">解析并填入</button>
      </details>

      <div class="modal-actions" style="margin-top:16px">
        <button id="insCancelBtn" class="btn-outline">取消</button>
        <button id="insSaveBtn" class="btn-primary">✏️ 插入题目</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ─── Type toggle ───
  const typeSelect = overlay.querySelector('#insType') as HTMLSelectElement;
  const optsArea = overlay.querySelector('#insOptionsArea') as HTMLElement;
  const fillArea = overlay.querySelector('#insFillArea') as HTMLElement;
  typeSelect.addEventListener('change', () => {
    const isFill = typeSelect.value === 'fill';
    optsArea.style.display = isFill ? 'none' : '';
    fillArea.style.display = isFill ? '' : 'none';
  });

  // ─── Add option ───
  overlay.querySelector('#insAddOptBtn')?.addEventListener('click', () => {
    const keyInput = overlay.querySelector('#insNewOptKey') as HTMLInputElement;
    const valInput = overlay.querySelector('#insNewOptVal') as HTMLTextAreaElement;
    const key = keyInput.value.trim().toUpperCase();
    if (!key || !/^[A-H]$/.test(key)) { alert('字母需为 A-H'); return; }
    if (overlay.querySelector(`.edit-opt[data-key="${key}"]`)) { alert(`选项 ${key} 已存在`); return; }
    const row = document.createElement('div');
    row.className = 'edit-opt-row';
    row.innerHTML = `<span class="edit-opt-key">${key}</span>
      <textarea class="edit-input edit-opt" data-key="${key}" rows="2"></textarea>
      <button class="edit-opt-del" data-key="${key}">✕</button>`;
    overlay.querySelector('#insOptions')?.appendChild(row);
    row.querySelector('.edit-opt-del')?.addEventListener('click', () => row.remove());
    keyInput.value = '';
    valInput.value = '';
  });
  overlay.querySelectorAll('.ins-opt-del').forEach(btn => {
    btn.addEventListener('click', () => (btn as HTMLElement).closest('.edit-opt-row')?.remove());
  });

  // ─── Image upload ───
  const insImages: ContentBlock[] = [];

  function addImageFromData(dataUrl: string, name: string): void {
    const block: ContentBlock = { t: 'image' as const, c: dataUrl, alt: name };
    insImages.push(block);
    const preview = overlay.querySelector('#insImagePreview') as HTMLElement;
    preview.innerHTML = insImages.map((img, i) =>
      `<div class="edit-block-item edit-block-image" data-imgidx="${i}" style="cursor:pointer">
        <span class="edit-block-tag">图片</span>
        <img src="${escapeHtml(img.c)}" style="max-width:80px;max-height:60px;border-radius:4px">
        <span class="edit-block-del">✕</span>
      </div>`
    ).join('');
  }

  overlay.querySelector('#insAddImageBtn')?.addEventListener('click', () => {
    (overlay.querySelector('#insImageInput') as HTMLInputElement).click();
  });
  overlay.querySelector('#insImageInput')?.addEventListener('change', async () => {
    const file = (overlay.querySelector('#insImageInput') as HTMLInputElement).files?.[0];
    if (!file) return;
    try { addImageFromData(await readFileAsDataURL(file), file.name); }
    catch { alert('图片读取失败'); }
    (overlay.querySelector('#insImageInput') as HTMLInputElement).value = '';
  });

  // Clipboard paste support
  overlay.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        try { addImageFromData(await readFileAsDataURL(file), '粘贴图片'); }
        catch { alert('剪贴板图片读取失败'); }
      }
    }
  });

  overlay.querySelector('#insImagePreview')?.addEventListener('click', (e) => {
    const del = (e.target as HTMLElement).closest('.edit-block-del');
    const item = (e.target as HTMLElement).closest('.edit-block-item') as HTMLElement | null;
    if (!item) return;
    const idx = parseInt(item.dataset.imgidx ?? '');
    if (del && idx >= 0 && idx < insImages.length) {
      insImages.splice(idx, 1);
      item.remove();
    }
  });

  // ─── JSON import ───
  overlay.querySelector('#insJsonParseBtn')?.addEventListener('click', () => {
    const jsonInput = overlay.querySelector('#insJsonInput') as HTMLTextAreaElement;
    try {
      const parsed = JSON.parse(jsonInput.value.trim());
      if (parsed.question) (overlay.querySelector('#insQuestion') as HTMLTextAreaElement).value = parsed.question;
      if (parsed.answer) (overlay.querySelector('#insAnswer') as HTMLInputElement).value = parsed.answer;
      if (parsed.options && typeof parsed.options === 'object') {
        const optsContainer = overlay.querySelector('#insOptions') as HTMLElement;
        optsContainer.innerHTML = '';
        Object.entries(parsed.options).forEach(([k, v]) => {
          const row = document.createElement('div');
          row.className = 'edit-opt-row';
          row.innerHTML = `<span class="edit-opt-key">${k}</span>
            <textarea class="edit-input edit-opt" data-key="${k}" rows="2">${escapeHtml(String(v))}</textarea>
            <button class="edit-opt-del" data-key="${k}">✕</button>`;
          optsContainer.appendChild(row);
        });
      }
      if (parsed.type) typeSelect.value = parsed.type;
      if (parsed.difficulty) (overlay.querySelector('#insDifficulty') as HTMLSelectElement).value = parsed.difficulty;
    } catch {
      alert('JSON 格式无效');
    }
  });

  // ─── Save ───
  const close = () => overlay.remove();
  overlay.querySelector('#insCancelBtn')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#insSaveBtn')?.addEventListener('click', () => {
    const qtext = (overlay.querySelector('#insQuestion') as HTMLTextAreaElement).value.trim();
    if (!qtext) { alert('请输入题干'); return; }
    const qtype = typeSelect.value;
    const answer = (overlay.querySelector('#insAnswer') as HTMLInputElement).value.trim().toUpperCase();
    const difficulty = (overlay.querySelector('#insDifficulty') as HTMLSelectElement).value;

    let options: Record<string, ContentBlock[] | string> = {};
    if (qtype === 'fill') {
      const fillText = (overlay.querySelector('#insFillAnswer') as HTMLTextAreaElement).value.trim();
      fillText.split(/[,，]/).forEach(pair => {
        const parts = pair.split('=');
        if (parts.length === 2) {
          options[parts[0].trim()] = [{ t: 'text', c: parts[1].trim() }];
        }
      });
    } else {
      overlay.querySelectorAll('.edit-opt').forEach(el => {
        const ta = el as HTMLTextAreaElement;
        const key = ta.dataset.key!;
        const val = ta.value.trim();
        if (val) options[key] = [{ t: 'text', c: val }];
      });
    }

    // ─── Duplicate detection ───
    const qtextLower = qtext.toLowerCase();
    const duplicates = questions.filter(existing => {
      if (existing.type !== qtype) return false;
      const existingText = Array.isArray(existing.question)
        ? existing.question.filter(b => b.t === 'text').map(b => b.c).join('')
        : existing.question;
      return existingText.toLowerCase() === qtextLower;
    });
    if (duplicates.length > 0) {
      const dup = duplicates[0];
      const dupOpts = Object.entries(dup.options || {}).map(([k, v]) => {
        const txt = Array.isArray(v) ? v.map(b => b.c).join('') : v;
        return `${k}. ${txt}`;
      }).join('  ');
      if (!confirm(`⚠️ 已存在相同题型的相同题干：\n\n题#${dup.id}：${qtext.slice(0, 60)}…\n${dupOpts}\n\n答案：${dup.answer}\n\n确定仍要插入吗？`)) {
        return;
      }
    }

    const maxId = Math.max(...questions.map(q => q.id), 0);
    const questionBlocks: ContentBlock[] = [{ t: 'text', c: qtext }, ...insImages];
    const newQ: Question = {
      id: maxId + 1,
      type: qtype as any,
      question: questionBlocks,
      options,
      answer,
      difficulty: difficulty as any,
      explanation: '',
    };

    const posInput = overlay.querySelector('#insPosition') as HTMLInputElement;
    const insertAt = Math.min(Math.max(0, parseInt(posInput.value) || (store.state.currentIndex + 1)), questions.length);
    questions.splice(insertAt, 0, newQ);
    store.save();
    // Jump to the new question in the current filtered view
    const filtered = getFiltered(questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter);
    const newIdx = filtered.findIndex(q => q.id === newQ.id);
    store.update({ currentIndex: newIdx >= 0 ? newIdx : 0 });
    store.save();
    close();
    // Trigger re-render
    window.dispatchEvent(new CustomEvent('question-inserted'));
  });
}

// ─── Full ContentBlock editor for root users ───

export function showFullEditModal(q: Question, index: number, onSaved: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'fullEditModal';

  const blocks: ContentBlock[] = Array.isArray(q.question) ? [...q.question] : [{ t: 'text', c: q.question }];

  function renderBlocksHTML(): string {
    return blocks.map((b, i) => {
      const typeOptions = ['text', 'f', 'code', 'image'].map(t =>
        `<option value="${t}" ${b.t === t ? 'selected' : ''}>${({ text: '文本', f: '公式', code: '代码', image: '图片' })[t] || t}</option>`
      ).join('');

      let contentEditor = '';
      if (b.t === 'image') {
        contentEditor = `
          <div class="full-edit-image">
            <img src="${escapeHtml(b.c)}" style="max-width:120px;max-height:80px;border-radius:4px;object-fit:cover">
            <div style="display:flex;gap:4px;margin-top:4px">
              <input type="file" accept="image/*" class="full-edit-img-upload" data-idx="${i}" style="font-size:.78rem;flex:1">
              <input type="text" class="full-edit-img-alt" data-idx="${i}" value="${escapeHtml(b.alt || '')}" placeholder="alt文本" style="width:80px;font-size:.78rem;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg);color:var(--text)">
            </div>
          </div>`;
      } else if (b.t === 'f') {
        contentEditor = `
          <textarea class="full-edit-content" data-idx="${i}" rows="2" style="font-family:monospace">${escapeHtml(b.c)}</textarea>
          <label style="font-size:.78rem;display:flex;align-items:center;gap:4px;margin:4px 0 0">
            <input type="checkbox" class="full-edit-displaymode" data-idx="${i}" ${(b as any).d ? 'checked' : ''}> 显示模式 (displayMode)
          </label>`;
      } else {
        contentEditor = `<textarea class="full-edit-content" data-idx="${i}" rows="${b.t === 'code' ? 4 : 2}" style="${b.t === 'code' ? 'font-family:monospace' : ''}">${escapeHtml(b.c)}</textarea>`;
      }

      return `<div class="full-edit-block" data-idx="${i}">
        <div class="full-edit-block-header">
          <select class="full-edit-type" data-idx="${i}">${typeOptions}</select>
          <div class="full-edit-actions">
            <button class="full-edit-insert" data-idx="${i}" title="在此后插入">＋</button>
            <button class="full-edit-moveup" data-idx="${i}" title="上移" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="full-edit-movedown" data-idx="${i}" title="下移" ${i === blocks.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="full-edit-del" data-idx="${i}" title="删除">✕</button>
          </div>
        </div>
        <div class="full-edit-content-area">${contentEditor}</div>
      </div>`;
    }).join('');
  }

  let addBlockHandler: (() => void) | null = null;

  function updateUI(): void {
    const itemsContainer = overlay.querySelector('#fullEditBlockItems');
    if (itemsContainer) {
      itemsContainer.innerHTML = renderBlocksHTML();
    }
    const countEl = overlay.querySelector('.full-edit-block-count');
    if (countEl) countEl.textContent = `内容块 (${blocks.length}个)`;
    bindBlockEvents();
    // Re-bind add block button via delegation to avoid stale references
    const addBtn = overlay.querySelector('#fullEditAddBlock');
    if (addBtn && addBlockHandler) {
      const newBtn = addBtn.cloneNode(true) as HTMLElement;
      newBtn.id = 'fullEditAddBlock';
      addBtn.parentNode?.replaceChild(newBtn, addBtn);
      newBtn.addEventListener('click', addBlockHandler);
    }
  }

  function showAddBlockPicker(): void {
    const picker = document.createElement('div');
    picker.style.cssText = 'position:absolute;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:4px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:100';

    const types = [
      { t: 'text', label: '文本' },
      { t: 'f', label: '公式' },
      { t: 'code', label: '代码' },
      { t: 'image', label: '图片' },
    ];

    types.forEach(({ t, label }) => {
      const btn = document.createElement('button');
      btn.className = 'btn-sm btn-outline';
      btn.textContent = label;
      btn.style.cssText = 'display:block;width:100%;margin:2px 0;text-align:left';
      btn.addEventListener('click', () => {
        if (t === 'image') {
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
              const dataUrl = await readFileAsDataURL(file);
              blocks.push({ t: 'image', c: dataUrl, alt: file.name });
              updateUI();
            } catch { alert('图片读取失败'); }
          };
          fileInput.click();
        } else if (t === 'f') {
          blocks.push({ t: 'f', c: '', d: false });
          updateUI();
        } else if (t === 'code') {
          blocks.push({ t: 'code', c: '' });
          updateUI();
        } else {
          blocks.push({ t: 'text', c: '' });
          updateUI();
        }
        picker.remove();
      });
      picker.appendChild(btn);
    });

    const addBtn = overlay.querySelector('#fullEditAddBlock')!;
    const rect = addBtn.getBoundingClientRect();
    picker.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    picker.style.left = (rect.left + window.scrollX) + 'px';

    const closePicker = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node) && e.target !== addBtn) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 0);

    document.body.appendChild(picker);
  }

  function showInsertBlockPicker(pos: number): void {
    const picker = document.createElement('div');
    picker.style.cssText = 'position:absolute;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:4px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:100';

    const types = [
      { t: 'text', label: '文本' },
      { t: 'f', label: '公式' },
      { t: 'code', label: '代码' },
      { t: 'image', label: '图片' },
    ];

    types.forEach(({ t, label }) => {
      const btn = document.createElement('button');
      btn.className = 'btn-sm btn-outline';
      btn.textContent = label;
      btn.style.cssText = 'display:block;width:100%;margin:2px 0;text-align:left';
      btn.addEventListener('click', () => {
        if (t === 'image') {
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
              const dataUrl = await readFileAsDataURL(file);
              blocks.splice(pos, 0, { t: 'image', c: dataUrl, alt: file.name });
              updateUI();
            } catch { alert('图片读取失败'); }
          };
          fileInput.click();
        } else if (t === 'f') {
          blocks.splice(pos, 0, { t: 'f', c: '', d: false });
          updateUI();
        } else if (t === 'code') {
          blocks.splice(pos, 0, { t: 'code', c: '' });
          updateUI();
        } else {
          blocks.splice(pos, 0, { t: 'text', c: '' });
          updateUI();
        }
        picker.remove();
      });
      picker.appendChild(btn);
    });

    // Position the picker near the clicked block
    const blockEl = overlay.querySelector(`.full-edit-block[data-idx="${pos > 0 ? pos - 1 : 0}"]`);
    if (blockEl) {
      const rect = blockEl.getBoundingClientRect();
      picker.style.top = (rect.bottom + window.scrollY + 4) + 'px';
      picker.style.left = (rect.left + window.scrollX) + 'px';
    } else {
      picker.style.top = '50%';
      picker.style.left = '50%';
    }

    const closePicker = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 0);

    document.body.appendChild(picker);
  }

  function bindBlockEvents(): void {
    // Type change
    overlay.querySelectorAll('.full-edit-type').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt((sel as HTMLElement).dataset.idx!);
        const newType = (sel as HTMLSelectElement).value;
        const oldBlock = blocks[idx];
        // Convert block preserving content if possible
        if (newType === 'image') {
          blocks[idx] = { t: 'image', c: oldBlock.c || '', alt: '' };
        } else if (newType === 'f') {
          blocks[idx] = { t: 'f', c: oldBlock.c || '', d: false };
        } else if (newType === 'code') {
          blocks[idx] = { t: 'code', c: oldBlock.c || '' };
        } else {
          blocks[idx] = { t: 'text', c: oldBlock.c || '' };
        }
        updateUI();
      });
    });

    // Content change
    overlay.querySelectorAll('.full-edit-content').forEach(ta => {
      ta.addEventListener('input', () => {
        const idx = parseInt((ta as HTMLElement).dataset.idx!);
        blocks[idx].c = (ta as HTMLTextAreaElement).value;
      });
    });

    // Display mode checkbox (formula)
    overlay.querySelectorAll('.full-edit-displaymode').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt((cb as HTMLElement).dataset.idx!);
        if (blocks[idx].t === 'f') {
          (blocks[idx] as any).d = (cb as HTMLInputElement).checked;
        }
      });
    });

    // Image upload
    overlay.querySelectorAll('.full-edit-img-upload').forEach(input => {
      input.addEventListener('change', async () => {
        const idx = parseInt((input as HTMLElement).dataset.idx!);
        const file = (input as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const dataUrl = await readFileAsDataURL(file);
          const oldAlt = blocks[idx].t === 'image' ? (blocks[idx] as any).alt : '';
          blocks[idx] = { t: 'image', c: dataUrl, alt: oldAlt || file.name };
          updateUI();
        } catch { alert('图片读取失败'); }
      });
    });

    // Alt text change
    overlay.querySelectorAll('.full-edit-img-alt').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt((input as HTMLElement).dataset.idx!);
        if (blocks[idx].t === 'image') {
          (blocks[idx] as any).alt = (input as HTMLInputElement).value;
        }
      });
    });

    // Move up
    overlay.querySelectorAll('.full-edit-moveup').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        if (idx > 0) {
          [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]];
          updateUI();
        }
      });
    });

    // Move down
    overlay.querySelectorAll('.full-edit-movedown').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        if (idx < blocks.length - 1) {
          [blocks[idx], blocks[idx + 1]] = [blocks[idx + 1], blocks[idx]];
          updateUI();
        }
      });
    });

    // Delete
    overlay.querySelectorAll('.full-edit-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        if (blocks.length <= 1) { alert('至少保留一个内容块'); return; }
        blocks.splice(idx, 1);
        updateUI();
      });
    });

    // Insert after
    overlay.querySelectorAll('.full-edit-insert').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        showInsertBlockPicker(idx + 1);
      });
    });
  }

  const isFill = q.type === 'fill';

  overlay.innerHTML = `
    <div class="modal" style="max-width:700px">
      <h2><span class="svg-icon">✏️</span>编辑题目 #${q.id}</h2>

      <div id="fullEditBlockContainer">
        <div class="full-edit-block-count" style="font-size:.82rem;color:var(--text-secondary);margin-bottom:8px;font-weight:600">内容块 (${blocks.length}个)</div>
        <div id="fullEditBlockItems">${renderBlocksHTML()}</div>
        <button id="fullEditAddBlock" class="btn-sm btn-outline" style="margin:8px 0 12px">＋ 添加内容块</button>
      </div>

      ${isFill ? '' : `
      <label>选项</label>
      <div class="edit-options">
        ${Object.entries(q.options || {}).map(([k, v]) => {
          const optText = Array.isArray(v) ? v.map(b => b.c).join('') : v;
          return `<div class="edit-opt-row">
            <span class="edit-opt-key">${k}</span>
            <textarea class="edit-input edit-opt" data-key="${k}" rows="2">${escapeHtml(optText)}</textarea>
            <button class="edit-opt-del" data-key="${k}" title="删除此选项">✕</button>
          </div>`;
        }).join('')}
      </div>
      <div class="edit-add-opt">
        <input type="text" id="fullEditNewOptKey" class="edit-input" placeholder="新选项字母" maxlength="1" style="width:50px">
        <textarea id="fullEditNewOptVal" class="edit-input" placeholder="选项内容" rows="1" style="flex:1"></textarea>
        <button id="fullEditAddOptBtn" class="btn-sm btn-outline">+ 添加选项</button>
      </div>
      `}

      <label>正确答案</label>
      <input type="text" id="fullEditAnswer" class="edit-input" value="${escapeHtml(q.answer)}" ${isFill ? 'placeholder="填空可留空"' : ''}>

      <label>难度</label>
      <select id="fullEditDifficulty" class="edit-input">
        <option value="易" ${q.difficulty === '易' ? 'selected' : ''}>易</option>
        <option value="中" ${q.difficulty === '中' || !q.difficulty ? 'selected' : ''}>中</option>
        <option value="难" ${q.difficulty === '难' ? 'selected' : ''}>难</option>
      </select>

      <div class="modal-actions">
        <button id="fullEditCancelBtn" class="btn-outline">取消</button>
        <button id="fullEditSaveBtn" class="btn-primary">✏️ 保存修改</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ─── Bind events ───

  const close = () => overlay.remove();
  overlay.querySelector('#fullEditCancelBtn')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  bindBlockEvents();

  // Add block handler (reference stored for re-binding in updateUI)
  addBlockHandler = showAddBlockPicker;
  overlay.querySelector('#fullEditAddBlock')?.addEventListener('click', addBlockHandler);

  // Add option
  overlay.querySelector('#fullEditAddOptBtn')?.addEventListener('click', () => {
    const keyInput = overlay.querySelector('#fullEditNewOptKey') as HTMLInputElement;
    const valInput = overlay.querySelector('#fullEditNewOptVal') as HTMLTextAreaElement;
    const key = keyInput.value.trim().toUpperCase();
    if (!key || !/^[A-H]$/.test(key)) { alert('选项字母需为 A-H'); return; }
    if (q.options[key]) { alert(`选项 ${key} 已存在`); return; }
    const optDiv = overlay.querySelector('.edit-options');
    const row = document.createElement('div');
    row.className = 'edit-opt-row';
    row.innerHTML = `
      <span class="edit-opt-key">${key}</span>
      <textarea class="edit-input edit-opt" data-key="${key}" rows="2">${escapeHtml(valInput.value)}</textarea>
      <button class="edit-opt-del" data-key="${key}" title="删除此选项">✕</button>
    `;
    optDiv?.appendChild(row);
    row.querySelector('.edit-opt-del')?.addEventListener('click', () => row.remove());
    keyInput.value = '';
    valInput.value = '';
  });

  // Delete option buttons
  overlay.querySelectorAll('.edit-opt-del').forEach(btn => {
    btn.addEventListener('click', () => {
      (btn as HTMLElement).closest('.edit-opt-row')?.remove();
    });
  });

  // Save
  overlay.querySelector('#fullEditSaveBtn')?.addEventListener('click', () => {
    // Collect options
    const newOptions: Record<string, ContentBlock[] | string> = {};
    overlay.querySelectorAll('.edit-opt').forEach(el => {
      const ta = el as HTMLTextAreaElement;
      const key = ta.dataset.key!;
      const val = ta.value;
      if (val.trim()) {
        newOptions[key] = [{ t: 'text', c: val }];
      }
    });

    // Answer & difficulty
    const answer = (overlay.querySelector('#fullEditAnswer') as HTMLInputElement).value.trim();
    const difficulty = (overlay.querySelector('#fullEditDifficulty') as HTMLSelectElement).value as any;

    // Apply changes
    q.question = blocks;
    if (Object.keys(newOptions).length > 0) q.options = newOptions;
    q.answer = answer;
    q.difficulty = difficulty;

    store.save();
    close();
    onSaved();
  });
}

export function exportQuestions(): void {
  const questions = store.state.questions;
  if (!questions.length) {
    alert('题库为空，无需导出。');
    return;
  }

  // Debug: confirm function runs
  alert('导出: 共 ' + questions.length + ' 题');

  const jsonStr = JSON.stringify(questions, null, 2);

  // Mobile share — only on mobile, skip on desktop
  if ('share' in navigator && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      if (typeof navigator.canShare === 'function') {
        const f = new File([blob], 'exported_questions.json', { type: 'application/json' });
        if (navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: '刷题通题库' }).then(() => {}, () => {});
        }
      }
    } catch (_) {}
  }

  // Download via anchor tag — append to DOM, click, leave in DOM
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exported_questions.json';
  a.textContent = 'download';
  a.style.position = 'fixed';
  a.style.bottom = '20px';
  a.style.right = '20px';
  a.style.zIndex = '99999';
  a.style.padding = '10px';
  a.style.background = '#4a6cf7';
  a.style.color = '#fff';
  a.style.borderRadius = '8px';
  a.style.textDecoration = 'none';
  a.style.fontSize = '16px';
  document.body.appendChild(a);
  // Click after a tiny delay to ensure DOM insertion
  setTimeout(() => {
    a.click();
    // Remove after 1 minute
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 60000);
  }, 50);
}
