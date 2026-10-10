import type { Question } from './types';
import { store } from './state';
import { formatExplanation, autoExplanation, contentBlocksToText } from './format';
import { TYPE_LABELS } from './types';

export interface FillGradeResult {
  blank: string;
  correct: boolean;
  feedback: string;
}

// ─── AI Fill Grading ───

export async function gradeFillAnswer(
  q: Question,
  userAnswers: Record<string, string>,
): Promise<{ results: FillGradeResult[]; overall: 'correct' | 'partial' | 'wrong' } | null> {
  const { apiKey, apiBaseUrl, apiModel } = store.getApiConfig(store.aiSettings.modelForAI || 'remote');
  if (!apiBaseUrl || !apiModel) return null;
  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  const blanks = Object.entries(q.options || {}).filter(([, v]) => v);

  // Build user vs expected comparison
  let blanksText = '';
  const blankKeys: string[] = [];
  blanks.forEach(([k, v]) => {
    blankKeys.push(k);
    blanksText += `${k}：用户答案「${userAnswers[k] || '(未作答)'}」  参考答案「${contentBlocksToText(v)}」\n`;
  });

  const prompt = `请判断以下填空题的用户答案是否正确。

题目：${contentBlocksToText(q.question)}

${blanksText}
请对每个空判断：
1. 用户答案是否与参考答案一致（考虑同义词、等价表述、合理的不同说法）
2. 给出简短反馈

请严格按以下 JSON 格式回复（不要包含其他内容）：
{
  "results": [
    {"blank": "${blankKeys[0] || '空1'}", "correct": true或false, "feedback": "简短反馈"}
  ],
  "overall": "correct"或"partial"或"wrong"
}`;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      signal: AbortSignal.timeout(30000),
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: 'system', content: '你是一个严格的阅卷助手。只返回要求的 JSON 格式，不要添加额外说明。' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 512,
        temperature: 0.1,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = (
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning_content ||
      data.response ||
      ''
    ).toString().trim();
    return parseGradeResponse(content, blankKeys);
  } catch {
    return null;
  }
}

function parseGradeResponse(
  content: string,
  blankKeys: string[],
): { results: FillGradeResult[]; overall: 'correct' | 'partial' | 'wrong' } | null {
  const json = content.match(/\{[\s\S]*\}/)?.[0] || content;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.results) || parsed.results.length !== blankKeys.length) return null;
    const results: FillGradeResult[] = blankKeys.map((blank, i) => {
      const row = parsed.results.find((r: Record<string, unknown>) => r.blank === blank) || parsed.results[i];
      if (!row || typeof row.correct !== 'boolean') throw new Error('判分结构不完整');
      return { blank, correct: row.correct, feedback: typeof row.feedback === 'string' ? row.feedback : (row.correct ? '正确' : '错误') };
    });
    return { results, overall: results.every(row => row.correct) ? 'correct' : results.some(row => row.correct) ? 'partial' : 'wrong' };
  } catch { return null; }
}

// ─── AI Explanation ───
let explanationRequest: AbortController | null = null;
let explanationVersion = 0;

export function cancelAIExplanation(): void {
  ++explanationVersion;
  explanationRequest?.abort(); explanationRequest = null;
  store.setAILoading(false);
  for (const id of ['aiExplainBtn', 'aiSimplifyBtn']) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) { btn.disabled = false; btn.classList.remove('ai-loading'); }
  }
  document.getElementById('aiDrawer')?.classList.add('hidden');
  document.getElementById('aiDrawerOverlay')?.classList.add('hidden');
}

function isMobile(): boolean {
  return window.innerWidth <= 768;
}

/** Show AI explanation inline */
function showExplanationInline(q: Question, content: string, label?: string): void {
  const feedback = document.getElementById('feedback') as HTMLElement;
  const feedbackRes = document.getElementById('feedbackResult') as HTMLElement;
  const explanation = document.getElementById('explanationText') as HTMLElement;

  feedback.classList.add('ai-exp');
  if (!feedback.classList.contains('show')) {
    feedback.classList.add('show');
  }
  feedbackRes.innerHTML = label || '🤖 AI 解析';
  explanation.innerHTML = formatExplanation(content);
}

function openDrawer(mode: 'detailed' | 'simple'): { body: HTMLElement; close: () => void } {
  const drawer = document.getElementById('aiDrawer')!;
  const overlay = document.getElementById('aiDrawerOverlay')!;
  const body = document.getElementById('aiDrawerBody')!;
  const closeBtn = document.getElementById('aiDrawerClose')!;
  const header = drawer.querySelector('.ai-drawer-header span')!;

  drawer.classList.remove('hidden');
  overlay.classList.remove('hidden');
  const loadingText = mode === 'simple' ? '⏳ 正在分析错误...' : '⏳ 正在生成解析...';
  body.innerHTML = `<div class="ai-drawer-loading">${loadingText}</div>`;
  header.innerHTML = `<span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.34-.64 2.61-1.74 3.39A4 4 0 0 1 16 13a4 4 0 0 1-2 3.46"/><path d="M12 2a4 4 0 0 0-4 4c0 1.34.64 2.61 1.74 3.39A4 4 0 0 0 8 13a4 4 0 0 0 2 3.46"/><path d="M12 22v-6"/><path d="M8 17c-2 0-4-1-4-4 0-1.5 1-2.5 2-3"/><path d="M16 17c2 0 4-1 4-4 0-1.5-1-2.5-2-3"/></svg></span> ${mode === 'simple' ? 'AI 纠错' : 'AI 解析'}`;

  const close = () => {
    drawer.classList.add('hidden');
    overlay.classList.add('hidden');
  };
  closeBtn.onclick = close;
  overlay.onclick = close;

  return { body, close };
}

type DisplayTarget = { type: 'drawer'; body: HTMLElement; close: () => void } | { type: 'inline' };

function initDisplay(mode: 'detailed' | 'simple'): DisplayTarget | null {
  if (isMobile()) {
    return { type: 'inline' };
  }
  const drawer = openDrawer(mode);
  return { type: 'drawer', ...drawer };
}


function setBtnState(id: string, loading: boolean, text: string): void {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.classList.add('ai-loading');
  } else {
    btn.classList.remove('ai-loading');
  }
}

export async function fetchAIExplanation(q: Question, simple = false): Promise<void> {
  if (store.aiLoading) return;
  store.setAILoading(true);
  const version = ++explanationVersion;
  const controller = new AbortController(); explanationRequest = controller;
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  const stillCurrent = () => version === explanationVersion;

  const btnId = simple ? 'aiSimplifyBtn' : 'aiExplainBtn';
  const loadingText = simple ? '🤖 纠错中' : '🤖 解析中';
  const doneText = simple ? '🤖 AI 纠错' : '🤖 AI 解析';
  const label = simple ? '🤖 AI 纠错' : '🤖 AI 解析';
  const fallbackLabel = simple ? '⚠️ AI 纠错降级' : '⚠️ AI 解析降级';

  setBtnState(btnId, true, loadingText);

  if (simple) {
    // ── Simple mode: inline ──
    if (q.simpleExplanation) {
      window.clearTimeout(timeout); explanationRequest = null;
      showExplanationInline(q, q.simpleExplanation, label);
      store.setAILoading(false);
      setBtnState(btnId, false, doneText);
      return;
    }

    try {
      const { apiKey, apiBaseUrl, apiModel } = store.getApiConfig(store.aiSettings.modelForAI || 'remote');
      if (!apiBaseUrl || !apiModel) throw new Error('请先配置 AI 模型');
      const baseUrl = apiBaseUrl.replace(/\/+$/, '');
      const prompt = buildSimplePrompt(q);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        signal: controller.signal,
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: apiModel,
          messages: [
            { role: 'system', content: '你是一个极简纠错助手。逐行输出每个选项的判断，不要任何开场白和总结。格式：\n✅ 选项字母: 一句话说明为什么正确\n❌ 选项字母: 一句话说明为什么错误\n填空题：\n❌ 空1: 正确答案是xxx' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 512,
          temperature: 0.1,
        }),
      });

      if (!res.ok) throw new Error(`API 请求失败 (${res.status})`);

      const data = await res.json();
      if (!stillCurrent()) return;
      const rawContent = (
        data.choices?.[0]?.message?.content ||
        data.choices?.[0]?.message?.reasoning_content ||
        data.response ||
        ''
      ).toString().trim();
      if (!rawContent) {
        console.warn('AI API 返回空内容，完整响应:', JSON.stringify(data).slice(0, 500));
        throw new Error('AI 返回了空内容，请检查模型是否支持对话补全。');
      }

      q.simpleExplanation = rawContent;
      showExplanationInline(q, rawContent, label);
      store.save();
    } catch (err: unknown) {
      if (!stillCurrent()) return;
      showExplanationInline(q, autoExplanation(q) + '\n\n---\n⚠️ AI 纠错暂时不可用，以上为本地参考。', fallbackLabel);
    } finally {
      window.clearTimeout(timeout);
      if (stillCurrent()) { store.setAILoading(false); setBtnState(btnId, false, doneText); explanationRequest = null; }
    }
    return;
  }

  // ── Detailed mode ──
  const target = initDisplay('detailed');

  if (q.explanation) {
    window.clearTimeout(timeout); explanationRequest = null;
    const html = formatExplanation(q.explanation);
    if (target?.type === 'drawer') {
      target.body.innerHTML = html;
    } else {
      showExplanationInline(q, q.explanation);
    }
    store.setAILoading(false);
    setBtnState(btnId, false, doneText);
    return;
  }

  try {
    const { apiKey, apiBaseUrl, apiModel } = store.getApiConfig(store.aiSettings.modelForAI || 'remote');
    if (!apiBaseUrl || !apiModel) throw new Error('请先配置 AI 模型');
    const baseUrl = apiBaseUrl.replace(/\/+$/, '');
    const prompt = buildDetailedPrompt(q);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      signal: controller.signal,
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: 'system', content: '你是一个专业的编程课程助教，擅长用中文详细解析题目，帮助学生理解知识点。' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API 请求失败 (${res.status}): ${err}`);
    }

    const data = await res.json();
    if (!stillCurrent()) return;
    const rawContent = (
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning_content ||
      data.response ||
      ''
    ).toString().trim();

    if (!rawContent) {
      throw new Error('AI 返回了解析内容为空，请重试或更换模型。');
    }

    q.explanation = rawContent;
    const html = formatExplanation(rawContent);
    if (target?.type === 'drawer') {
      target.body.innerHTML = html;
    } else {
      showExplanationInline(q, rawContent);
    }
    store.save();
  } catch (err: unknown) {
    if (!stillCurrent()) return;
    const localContent = autoExplanation(q) + '\n\n---\n⚠️ AI 解析暂时不可用，以上为本地参考。';
    if (target?.type === 'drawer') {
      target.body.innerHTML = formatExplanation(localContent);
    } else {
      showExplanationInline(q, localContent, fallbackLabel);
    }
  } finally {
    window.clearTimeout(timeout);
    if (stillCurrent()) { store.setAILoading(false); setBtnState(btnId, false, doneText); explanationRequest = null; }
  }
}

function buildDetailedPrompt(q: Question): string {
  let prompt = '请为以下题目生成详细的答案解析。\n\n';
  prompt += `题目：${contentBlocksToText(q.question)}\n\n`;
  prompt += `题型：${TYPE_LABELS[q.type] || q.type}\n`;
  if (q.type !== 'fill' && q.options) {
    prompt += '选项：\n';
    Object.entries(q.options).filter(([, v]) => v).forEach(([k, v]) => { prompt += `${k}. ${contentBlocksToText(v)}\n`; });
  }
  if (q.type === 'fill') {
    prompt += '参考答案：\n';
    Object.entries(q.options || {}).filter(([, v]) => v).forEach(([k, v]) => { prompt += `${k}：${contentBlocksToText(v)}\n`; });
  } else {
    prompt += `\n正确答案：${q.answer}\n`;
  }
  prompt += `\n请用中文给出详细的解析，包括：为什么这个答案正确、其他选项为什么错误（如适用）、相关知识点说明。`;
  return prompt;
}

function buildSimplePrompt(q: Question): string {
  let prompt = '题目：' + contentBlocksToText(q.question) + '\n\n';
  if (q.type !== 'fill' && q.options) {
    Object.entries(q.options).filter(([, v]) => v).forEach(([k, v]) => { prompt += `${k}. ${contentBlocksToText(v)}\n`; });
  }
  prompt += `\n正确答案：${q.answer}\n\n`;
  if (q.type === 'multi') {
    const ansLetters = q.answer.split('').map(a => a.toUpperCase());
    const allLetters = Object.keys(q.options || {}).filter(k => q.options?.[k]);
    const wrongLetters = allLetters.filter(l => !ansLetters.includes(l.toUpperCase()));
    prompt += '用户答错了这道多选题。请逐一判断每个选项：\n';
    prompt += `- 正确选项（${ansLetters.join('、')}）：用✅ 开头，一句话说明为什么是正确的答案\n`;
    prompt += `- 错误选项（${wrongLetters.join('、')}）：用❌ 开头，一句话说明为什么是错误答案\n`;
    prompt += '按题目选项顺序输出，每行一个，不要让用户自己去判断哪些是正确哪些是错误。';
  } else if (q.type === 'fill') {
    prompt += '请逐空判断：用✅表示填对了，❌表示填错了，并给出正确答案。每行一个空。';
  } else if (q.type === 'judge') {
    const correctAns = q.answer === 'A' ? '正确' : '错误';
    prompt += `正确答案是${correctAns}。请判断：如果用户判断错误，用❌指出为什么；如果用户判断正确，用✅确认。`;
  } else {
    const ansLetter = q.answer.toUpperCase();
    prompt += `正确答案是${ansLetter}。请依次判断每个选项：\n`;
    prompt += '- ❌ 错误选项：一句话说明为什么错\n';
    prompt += `- ✅ ${ansLetter}：一句话说明为什么是正确答案\n`;
    prompt += '按选项顺序输出。';
  }
  return prompt;
}
