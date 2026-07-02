import type { Question } from '../types';
import { store } from '../state';
import { parseExcel } from './excel';

// ─── Confirm modal ───

export function showParseConfirm(file: File): Promise<'parse' | 'cancel'> {
  return new Promise(resolve => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    if (ext === 'pdf') {
      overlay.innerHTML = `
        <div class="modal" style="max-width:460px">
          <h2><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>不支持的格式</h2>
          <p style="line-height:1.7;color:var(--text-secondary);margin:16px 0">PDF 文件无法直接解析为题库。</p>
          <p style="line-height:1.7;color:var(--text-secondary);margin:16px 0">建议使用其他工具（如 Adobe Acrobat、在线 PDF 转 Word 工具）将 PDF 中的题目提取出来，保存为 <strong>Word (.docx)</strong> 或 <strong>Excel (.xlsx)</strong> 格式后再上传。</p>
          <div class="modal-actions"><button id="parseCancel" class="btn-primary">知道了</button></div>
        </div>`;
    } else {
      overlay.innerHTML = `
        <div class="modal" style="max-width:480px">
          <h2><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.34-.64 2.61-1.74 3.39A4 4 0 0 1 16 13a4 4 0 0 1-2 3.46"/><path d="M12 2a4 4 0 0 0-4 4c0 1.34.64 2.61 1.74 3.39A4 4 0 0 0 8 13a4 4 0 0 0 2 3.46"/><path d="M12 22v-6"/><path d="M8 17c-2 0-4-1-4-4 0-1.5 1-2.5 2-3"/><path d="M16 17c2 0 4-1 4-4 0-1.5-1-2.5-2-3"/></svg></span>AI 解析导入</h2>
          <p style="line-height:1.7;margin:16px 0">将通过 AI 识别文件 <strong>${esc(file.name)}</strong> 中的题目，自动转换为题库格式。</p>
          <div style="background:var(--tag-bg);padding:14px 16px;border-radius:8px;font-size:.85rem;line-height:1.7;margin-bottom:16px">
            <strong>⚠️ 注意</strong><br>AI 解析会消耗您的 API 额度（Token），费用由您调用的 API 提供商收取。<br>请确认您的 API Key 余额充足。
          </div>
          <div class="modal-actions">
            <button id="parseCancel" class="btn-outline">取消</button>
            <button id="parseConfirm" class="btn-primary">🤖 开始 AI 解析</button>
          </div>
        </div>`;
    }

    document.body.appendChild(overlay);
    overlay.querySelector('#parseCancel')?.addEventListener('click', () => { overlay.remove(); resolve('cancel'); });
    overlay.querySelector('#parseConfirm')?.addEventListener('click', () => { overlay.remove(); resolve('parse'); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve('cancel'); } });
  });
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ─── AI call ───

async function callAI(messages: { role: string; content: string }[]): Promise<string | null> {
  const { apiKey, apiBaseUrl, apiModel } = store.getApiConfig(store.aiSettings.modelForParse || 'remote');
  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model: apiModel, messages, max_tokens: 4096, temperature: 0.1 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || data.response || '').toString().trim();
  } catch { return null; }
}

// ─── Extract text from file (step 1) ───

export async function extractText(buffer: ArrayBuffer, fileName: string): Promise<string | null> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      const header = (rows[0] || []).map(h => String(h || '').replace(/[\s\n]/g, ''));
      const idx = (...keywords: string[]): number => {
        for (let i = 0; i < header.length; i++) {
          if (keywords.some(k => header[i].includes(k))) return i;
        }
        return -1;
      };
      const colStem = idx('题干', '题目', '问题');
      const colType = idx('题型', '类型');
      const colAns = idx('正确答案', '答案', '正确');
      const opts: Record<string, number> = {};
      'ABCDEFGH'.split('').forEach(k => { const ci = idx('选项' + k); if (ci >= 0) opts[k] = ci; });
      const texts: string[] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row[colStem]) continue;
        const parts: string[] = [];
        parts.push('题型: ' + (colType >= 0 && row[colType] ? String(row[colType]).trim() : ''));
        parts.push('题干: ' + String(row[colStem]).trim());
        'ABCDEFGH'.split('').forEach(k => { if (opts[k] !== undefined && row[opts[k]] != null) parts.push(k + ': ' + String(row[opts[k]]).trim()); });
        if (colAns >= 0 && row[colAns] != null) parts.push('答案: ' + String(row[colAns]).trim());
        texts.push(parts.join('\n'));
      }
      return texts.join('\n\n---\n\n');
    } catch { return null; }
  } else if (ext === 'docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.default.convertToHtml({ arrayBuffer: buffer });
      const div = document.createElement('div');
      div.innerHTML = result.value;
      const paragraphs: string[] = [];
      div.querySelectorAll('p, li, td, th').forEach(el => {
        const text = (el as HTMLElement).textContent?.trim();
        if (text) paragraphs.push(text);
      });
      return paragraphs.join('\n');
    } catch { return null; }
  }
  return null;
}

// ─── Show text editor modal (step 2) ───

export function showTextEditor(rawText: string): Promise<string | null> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:700px;height:80vh;display:flex;flex-direction:column;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h2 style="margin:0;font-size:1.1rem">📄 识别结果</h2>
          <span style="font-size:.8rem;color:var(--text-secondary)">检查文字是否正确，可手动修改</span>
        </div>
        <textarea id="editRawText" class="edit-input" style="flex:1;margin-bottom:12px;resize:none;font-size:.85rem;line-height:1.6;font-family:monospace">${esc(rawText)}</textarea>
        <div class="modal-actions">
          <button id="editTextCancel" class="btn-outline">取消</button>
          <button id="editTextConfirm" class="btn-primary">🤖 转换为题目</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#editTextCancel')?.addEventListener('click', () => { overlay.remove(); resolve(null); });
    overlay.querySelector('#editTextConfirm')?.addEventListener('click', () => {
      const text = (overlay.querySelector('#editRawText') as HTMLTextAreaElement).value.trim();
      overlay.remove(); resolve(text || null);
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
  });
}

// ─── AI convert (step 3) ───

const SYSTEM_PROMPT = [
  '从文本中识别所有题目，按以下格式输出（每道题用 --- 分隔）：',
  '',
  '题型: single(单选)|judge(判断)|multi(多选)|fill(填空)',
  '题干: 题目内容',
  'A: 选项A',
  'B: 选项B',
  'C: 选项C',
  'D: 选项D',
  '答案: 正确答案',
  '难度: 易|中|难',
  '---',
  '',
  '规则：',
  '- 判断题答案写"正确"或"错误"',
  '- 填空题用"空1: 答案1"(不需要选项A/B/C/D)',
  '- 内容中的字符都不需要转义，直接写',
  '- 每道题必须有"题型:"和"题干:"和"答案:"',
  '- 识别不出时输出"无题目"',
  '- 只输出题目数据，不要多余文字',
].join('\n');

export async function aiConvert(text: string): Promise<{ result: any[] | null; raw: string; error?: string }> {
  const reply = await callAI([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: '请识别以下内容中的题目：\n\n' + text.slice(0, 8000) },
  ]);
  if (!reply) return { result: null, raw: '', error: 'AI 请求失败，请检查 API 配置和网络连接。' };

  // Method 1: parse key-value block format
  const parsed = parseKVFormat(reply);
  if (parsed.length > 0) return { result: parsed, raw: reply };

  // Method 2: fallback — try JSON
  try {
    const cleaned = reply.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
    const m = cleaned.match(/\[([\s\S]*)\]/);
    if (m) {
      const fb = JSON.parse('[' + m[1] + ']');
      if (Array.isArray(fb) && fb.length > 0 && fb[0].question)
        return { result: fb, raw: reply };
    }
  } catch {}

  return { result: null, raw: reply.slice(0, 1000), error: 'AI 未能识别出题目。请检查文字是否正确后重试。' };
}

/** Parse key-value block format */
function parseKVFormat(text: string): any[] {
  const blocks = text.split(/\n?---\n?/);
  const results: any[] = [];
  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    let type = '', question = '', answer = '', difficulty = '';
    const options: Record<string, string> = {};
    for (const line of lines) {
      const ci = line.indexOf(':');
      if (ci < 0) continue;
      const key = line.slice(0, ci).trim();
      const val = line.slice(ci + 1).trim();
      if (!val) continue;
      if (key === '题型') type = val;
      else if (key === '题干') question = val;
      else if (key === '答案') answer = val;
      else if (key === '难度') difficulty = val;
      else if (/^[A-H]$/.test(key)) options[key] = val;
      else if (/^空\d+$/.test(key)) options[key] = val;
    }
    if (!type || !question) continue;
    const tm: Record<string, string> = {
      'single': 'single', '单选': 'single', '单选题': 'single',
      'judge': 'judge', '判断': 'judge', '判断题': 'judge',
      'multi': 'multi', '多选': 'multi', '多选题': 'multi',
      'fill': 'fill', '填空': 'fill', '填空题': 'fill',
    };
    results.push({ type: tm[type] || 'single', question, options, answer, difficulty });
  }
  return results;
}

// ─── Show loading modal ───

export function showLoadingModal(): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal" style="max-width:360px;text-align:center;padding:32px"><div style="font-size:2rem;margin-bottom:12px">⏳</div><p>AI 正在识别题目，请稍候...</p></div>';
  document.body.appendChild(overlay);
  return () => overlay.remove();
}

// ─── Show JSON preview modal (step 4) ───

export function showJsonPreview(parsed: any[]): Promise<'import' | 'cancel'> {
  return new Promise(resolve => {
    const count = parsed.length;
    const preview = JSON.stringify(parsed.slice(0, 3), null, 2);
    const more = count > 3 ? '\n  ... 还有 ' + (count - 3) + ' 题' : '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:640px">
        <h2>\u{1f4cb} 识别结果预览</h2>
        <p style="color:var(--text-secondary);margin-bottom:10px;font-size:.9rem">共识别 <strong>${count}</strong> 道题目</p>
        <pre style="background:var(--filter-bg);padding:14px;border-radius:8px;font-size:.78rem;line-height:1.5;overflow-x:auto;max-height:300px;overflow-y:auto">${esc(preview + more)}</pre>
        <p style="font-size:.82rem;color:var(--text-secondary);margin-top:10px">确认无误后导入，或取消重新调整文字。</p>
        <div class="modal-actions">
          <button id="previewCancel" class="btn-outline">取消</button>
          <button id="previewImport" class="btn-primary">\u{1f4e5} 导入 ${count} 题</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#previewCancel')?.addEventListener('click', () => { overlay.remove(); resolve('cancel'); });
    overlay.querySelector('#previewImport')?.addEventListener('click', () => { overlay.remove(); resolve('import'); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve('cancel'); } });
  });
}

// ─── Parse AI response to Question[] (step 5) ───

export function parseAiResult(parsed: any[]): Question[] {
  const DIFF_MAP: Record<string, any> = { '易': '易', '中': '中', '难': '难' };
  return parsed.map((item: any, i: number) => {
    const rawType = String(item.type || '');
    const qtype = (rawType === 'multi' ? 'multi' : rawType === 'judge' ? 'judge' : rawType === 'fill' ? 'fill' : 'single') as any;
    const options: Record<string, any> = {};
    if (item.options && typeof item.options === 'object') {
      Object.entries(item.options).forEach(([k, v]) => { options[k] = [{ t: 'text', c: String(v) }]; });
    }
    return {
      id: i + 1, type: qtype,
      question: [{ t: 'text', c: String(item.question || '') }],
      options,
      answer: String(normalizeAnswer(item.answer, item.type) || ''),
      difficulty: (DIFF_MAP[String(item.difficulty)] || '中') as any,
      explanation: String(item.explanation || ''),
    } as Question;
  });
}

function normalizeAnswer(answer: string, type: string): string {
  if (!answer) return '';
  const a = answer.trim();
  if (type === 'judge') {
    if (a.includes('正确') || a === 'A' || a === 'T') return 'A';
    if (a.includes('错误') || a === 'B' || a === 'F') return 'B';
  }
  return a.toUpperCase();
}

// ─── Show error with retry ───

function showErrorWithRetry(error: string, raw: string): Promise<'retry' | 'cancel'> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:600px">
        <h2>❌ 识别失败</h2>
        <p style="color:var(--wrong);margin-bottom:12px;font-size:.9rem">${esc(error)}</p>
        <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:8px">AI 返回的原始内容（供参考）：</p>
        <pre style="background:var(--filter-bg);padding:12px;border-radius:8px;font-size:.78rem;line-height:1.5;max-height:200px;overflow-y:auto;white-space:pre-wrap">${raw ? esc(raw.slice(0, 1000)) : '(空)'}</pre>
        <p style="font-size:.85rem;color:var(--text-secondary);margin-top:12px">可返回上一步修改文字后重试。</p>
        <div class="modal-actions">
          <button id="retryCancel" class="btn-outline">取消</button>
          <button id="retryBack" class="btn-primary">← 返回修改文字</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#retryCancel')?.addEventListener('click', () => { overlay.remove(); resolve('cancel'); });
    overlay.querySelector('#retryBack')?.addEventListener('click', () => { overlay.remove(); resolve('retry'); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve('cancel'); } });
  });
}

// ─── Main parse entry ───

export async function parseFile(buffer: ArrayBuffer, fileName: string): Promise<Question[] | null> {
  const ext = fileName.split('.').pop()?.toLowerCase();

  // Excel: parse directly without AI
  if (ext === 'xlsx' || ext === 'xls') {
    const questions = await parseExcel(buffer);
    if (questions.length === 0) {
      alert('未识别出题目。请检查 Excel 是否包含规范的列名（题干、题型、选项A、正确答案等）。');
      return null;
    }
    const action = await showJsonPreview(questions);
    if (action !== 'import') return null;
    return questions;
  }

  // Word: AI-assisted parsing
  if (ext === 'docx') {
    let rawText = await extractText(buffer, fileName);
    if (!rawText) { alert('无法从文件中提取文字'); return null; }

    while (true) {
      const edited = await showTextEditor(rawText);
      if (!edited) return null;

      const closeLoading = showLoadingModal();
      const { result: parsed, raw: aiRaw, error: aiError } = await aiConvert(edited);
      closeLoading();

      if (!parsed) {
        const action = await showErrorWithRetry(aiError || '未知错误', aiRaw || '');
        if (action === 'retry') { rawText = edited; continue; }
        return null;
      }

      const action = await showJsonPreview(parsed);
      if (action === 'cancel') { rawText = edited; continue; }

      return parseAiResult(parsed);
    }
  }

  return null;
}
