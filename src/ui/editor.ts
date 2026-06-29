import type { Question, ContentBlock } from '../types';
import { store } from '../state';
import { renderText } from '../format';

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
    try {
      const dataUrl = await readFileAsDataURL(file);
      const newBlock: ContentBlock = { t: 'image', c: dataUrl, alt: file.name };
      let blocks = Array.isArray(q.question) ? [...q.question] : [{ t: 'text' as const, c: q.question }];
      blocks.push(newBlock);
      (q as any).__pendingBlocks = blocks;  // store temporarily
      // Refresh the block list
      const list = overlay.querySelector('#editBlockList');
      if (list) {
        list.querySelector('.edit-block-header')!.after(renderBlockListHTML(blocks));
        // Remove old block list items
        const oldItems = list.querySelectorAll('.edit-block-item:not(.edit-block-header)');
        oldItems.forEach(el => el.remove());
      }
      imgInput.value = '';
    } catch (e) {
      alert('图片读取失败');
    }
  });

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

export function exportQuestions(): void {
  const questions = store.state.questions;
  if (!questions.length) {
    alert('题库为空，无需导出。');
    return;
  }
  const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exported_questions.json';
  a.click();
  URL.revokeObjectURL(url);
}
