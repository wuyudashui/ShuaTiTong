import type { Question, ContentBlock, AdaptMode } from '../types';
import { store } from '../state';
import { TYPE_LABELS } from '../types';
import { contentBlocksToText } from '../format';

// ─── AI Prompt helpers ───

function buildFillPrompt(q: Question): string {
  const qtext = contentBlocksToText(q.question);
  let prompt = `请将以下${TYPE_LABELS[q.type]}题改编为填空题。\n\n`;
  prompt += `原题：${qtext}\n\n`;
  if (q.type !== 'fill') {
    prompt += '选项：\n';
    Object.entries(q.options).filter(([, v]) => v).forEach(([k, v]) => {
      prompt += `${k}. ${contentBlocksToText(v)}\n`;
    });
    prompt += `\n正确答案：${q.answer}\n\n`;
  }

  if (q.type === 'fill') {
    prompt += '这是填空题，请保持填空形式但适当增加或调整空白数量。\n';
  } else if (q.type === 'judge') {
    prompt += '这是判断题，请将判断结论改为填空。例如"无向连通图所有顶点的度之和为____"并填写正确答案。\n';
  } else if (q.type === 'multi') {
    prompt += '这是多选题，请将正确选项中的关键信息提取出来改为填空，可设多个空。\n';
  } else {
    prompt += '这是单选题，请将正确答案对应的内容嵌入题干并挖空。\n';
  }

  prompt += `\n请严格按以下 JSON 格式回复（不要包含其他内容）：
{
  "question": "改编后的完整题干，用____表示填空位置",
  "answer": [
    {"blank": "空1", "answer": "正确答案"},
    {"blank": "空2", "answer": "正确答案"}
  ]
}`;

  return prompt;
}

function buildSingleToMultiPrompt(q: Question): string {
  const qtext = contentBlocksToText(q.question);
  let prompt = `请将以下单选题改编为多选题（至少有2个正确选项）。\n\n`;
  prompt += `原题：${qtext}\n\n`;
  prompt += '选项：\n';
  Object.entries(q.options).filter(([, v]) => v).forEach(([k, v]) => {
    prompt += `${k}. ${contentBlocksToText(v)}\n`;
  });
  prompt += `\n原答案：${q.answer}\n\n`;
  prompt += '要求：\n';
  prompt += '1. 保持题干不变，或微调使其支持多个正确选项\n';
  prompt += '2. 保持原有选项不变\n';
  prompt += '3. 选择至少2个正确选项，其中必须包含原正确答案\n';
  prompt += '4. 其他选项改为错误选项\n';
  prompt += '5. 答案为正确选项的字母组合（如"ABD"）\n';

  prompt += `\n请严格按以下 JSON 格式回复（不要包含其他内容）：
{
  "question": "改编后的题干",
  "answer": "ABC"
}`;

  return prompt;
}

// ─── AI call ───

async function callAI(
  prompt: string,
  systemPrompt: string,
): Promise<string | null> {
  const { apiKey, apiBaseUrl, apiModel } = store.getApiConfig(store.aiSettings.modelForAdapt || 'remote');
  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning_content ||
      data.response ||
      ''
    ).toString().trim();
  } catch {
    return null;
  }
}

// ─── Parse AI responses ───

function parseFillResponse(content: string): { question: string; answer: { blank: string; answer: string }[] } | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.question || !Array.isArray(parsed.answer)) return null;
    return {
      question: parsed.question,
      answer: parsed.answer.map((a: Record<string, string>, i: number) => ({
        blank: a.blank || `空${i + 1}`,
        answer: a.answer || '',
      })),
    };
  } catch {
    return null;
  }
}

function parseMultiResponse(content: string): { question: string; answer: string } | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.question || !parsed.answer) return null;
    return { question: parsed.question, answer: parsed.answer.toUpperCase() };
  } catch {
    return null;
  }
}

// ─── Main adapt function ───

export async function adaptQuestions(
  questions: Question[],
  mode: AdaptMode,
  onProgress?: (done: number, total: number) => void,
): Promise<{ success: Question[]; originalIds: number[]; failed: number }> {
  const adapted: Question[] = [];
  const originalIds: number[] = [];
  let failed = 0;

  const systemPrompt = mode === 'fill'
    ? '你是一个专业的出题助手。将题目改编为填空题，提取关键知识点作为填空答案。只返回要求的 JSON 格式。'
    : '你是一个专业的出题助手。将单选题改编为多选题，确保至少2个正确选项。只返回要求的 JSON 格式。';

  const buildPrompt = mode === 'fill' ? buildFillPrompt : buildSingleToMultiPrompt;
  const parseResult = mode === 'fill' ? parseFillResponse : parseMultiResponse;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const prompt = buildPrompt(q);
    const result = await callAI(prompt, systemPrompt);

    if (!result) {
      failed++;
      onProgress?.(i + 1, questions.length);
      continue;
    }

    if (mode === 'fill') {
      const parsed = parseFillResponse(result);
      if (!parsed) { failed++; onProgress?.(i + 1, questions.length); continue; }
      const options: Record<string, ContentBlock[] | string> = {};
      parsed.answer.forEach(a => {
        options[a.blank] = [{ t: 'text', c: a.answer }];
      });
      adapted.push({
        id: Date.now() + i,
        type: 'fill',
        question: [{ t: 'text', c: parsed.question }],
        options,
        answer: parsed.answer.map(a => a.answer).join('、'),
        difficulty: q.difficulty,
        explanation: '',
      });
      originalIds.push(q.id);
    } else {
      const parsed = parseMultiResponse(result);
      if (!parsed) { failed++; onProgress?.(i + 1, questions.length); continue; }
      adapted.push({
        id: Date.now() + i,
        type: 'multi',
        question: [{ t: 'text', c: parsed.question }],
        options: q.options,
        answer: parsed.answer,
        difficulty: q.difficulty,
        explanation: '',
      });
      originalIds.push(q.id);
    }

    onProgress?.(i + 1, questions.length);
  }

  return { success: adapted, originalIds, failed };
}

// ─── UI ───

export function showAdaptModal(): void {
  const filtered = store.filtered;
  if (!filtered.length) {
    alert('题库为空，无可改编的题目。');
    return;
  }

  const counts = { single: 0, multi: 0, judge: 0, fill: 0 };
  for (const q of filtered) {
    if (counts[q.type] !== undefined) counts[q.type]++;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'adaptModal';
  overlay.innerHTML = `
    <div class="modal">
      <h2><span class="svg-icon">🤖</span>AI 改编题目</h2>
      <p style="color:var(--text-secondary);margin-bottom:16px;font-size:.9rem">当前筛选范围内：单选 ${counts.single} 题、多选 ${counts.multi} 题、判断 ${counts.judge} 题、填空 ${counts.fill} 题</p>

      <label>改编方式</label>
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <button class="adapt-mode-btn active" data-mode="fill" style="flex:1">
          <div style="font-weight:700;font-size:1rem">✏️ 改编成填空</div>
          <div style="font-size:.8rem;color:var(--text-secondary);margin-top:4px">将单选/判断/多选挖空为填空题</div>
        </button>
        <button class="adapt-mode-btn" data-mode="single-to-multi" style="flex:1">
          <div style="font-weight:700;font-size:1rem">🔄 单选改多选</div>
          <div style="font-size:.8rem;color:var(--text-secondary);margin-top:4px">将单选题改为多选题（仅限单选）</div>
        </button>
      </div>

      <label>改编范围</label>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="adapt-scope-btn active" data-scope="filtered" class="btn-sm btn-outline">当前筛选（${filtered.length}题）</button>
        <button class="adapt-scope-btn" data-scope="all">全部题库（${store.state.questions.length}题）</button>
      </div>

      <div id="adaptProgress" style="display:none;margin-bottom:12px">
        <div style="font-size:.85rem;color:var(--text-secondary);margin-bottom:6px" id="adaptProgressText">处理中：0/0</div>
        <div style="height:6px;background:var(--border);border-radius:4px;overflow:hidden">
          <div id="adaptProgressBar" style="height:100%;width:0%;background:var(--primary);border-radius:4px;transition:width .3s"></div>
        </div>
      </div>

      <div id="adaptResult" style="display:none;margin-bottom:16px;padding:12px 16px;background:var(--tag-bg);border-radius:8px;font-size:.9rem"></div>

      <div class="modal-actions">
        <button id="adaptCancelBtn" class="btn-outline">取消</button>
        <button id="adaptStartBtn" class="btn-primary">🚀 开始改编</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let currentMode: AdaptMode = 'fill';
  let currentScope: string = 'filtered';

  overlay.querySelectorAll('.adapt-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.adapt-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = (btn as HTMLElement).dataset.mode as AdaptMode;
    });
  });

  overlay.querySelector('.adapt-scope-btn')?.addEventListener('click', () => {
    // For now just use filtered
  });

  const close = () => overlay.remove();
  overlay.querySelector('#adaptCancelBtn')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#adaptStartBtn')?.addEventListener('click', async () => {
    const startBtn = overlay.querySelector('#adaptStartBtn') as HTMLButtonElement;
    const progressDiv = overlay.querySelector('#adaptProgress') as HTMLElement;
    const progressText = overlay.querySelector('#adaptProgressText') as HTMLElement;
    const progressBar = overlay.querySelector('#adaptProgressBar') as HTMLElement;
    const resultDiv = overlay.querySelector('#adaptResult') as HTMLElement;

    startBtn.disabled = true;
    startBtn.textContent = '⏳ 改编中...';
    progressDiv.style.display = 'block';

    // Determine source questions
    let source: Question[];
    if (currentMode === 'single-to-multi') {
      source = (currentScope === 'all' ? store.state.questions : store.filtered)
        .filter(q => q.type === 'single');
      if (!source.length) {
        alert('没有可改编的单选题。');
        startBtn.disabled = false;
        startBtn.textContent = '🚀 开始改编';
        progressDiv.style.display = 'none';
        return;
      }
    } else {
      source = currentScope === 'all' ? store.state.questions : store.filtered;
    }

    const total = source.length;
    progressText.textContent = `处理中：0/${total}`;

    const { success, originalIds, failed } = await adaptQuestions(
      source, currentMode,
      (done) => {
        progressText.textContent = `处理中：${done}/${total}`;
        progressBar.style.width = `${(done / total) * 100}%`;
      },
    );

    progressBar.style.width = '100%';

    if (success.length > 0) {
      store.startAdapt(success, originalIds, currentMode);
      resultDiv.style.display = 'block';
      const modeLabel = currentMode === 'fill' ? '填空' : '多选';
      resultDiv.innerHTML = `
        ✅ 成功改编 <strong>${success.length}</strong> 题${failed ? `，失败 ${failed} 题` : ''}
        <br><small style="color:var(--text-secondary)">已保存到「改编题」列表，可在筛选栏查看。</small>
      `;
      startBtn.textContent = '✅ 完成';
      startBtn.onclick = () => {
        close();
        // Dispatch event to switch to adapted view
        window.dispatchEvent(new CustomEvent('adapt-done'));
      };
    } else {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '❌ 全部改编失败，请检查 API 配置或网络。';
      startBtn.disabled = false;
      startBtn.textContent = '🚀 重试';
    }
  });
}
