import type { Question, QuestionRenderer, RenderConfig } from '../types';
import { CLIPBOARD, BRAIN } from '../icons';
import { gradeFillAnswer } from '../ai';
import { contentBlocksToText } from '../format';

export class FillRenderer implements QuestionRenderer {
  readonly type = 'fill' as const;
  private handled = false;
  private gradeMode: 'local' | 'ai' = 'local';

  render(q: Question, config: RenderConfig): void {
    this.handled = false;
    this.gradeMode = 'local';
    const { optContainer, fillContainer } = config;

    optContainer.classList.add('hidden');
    fillContainer.classList.remove('hidden');
    fillContainer.innerHTML = '';

    const blanks = q.options || {};
    const keys = Object.keys(blanks);

    if (!keys.length) {
      fillContainer.innerHTML = '<p style="color:var(--text-secondary)">无填空内容</p>';
      return;
    }

    keys.forEach(key => {
      const row = document.createElement('div');
      row.className = 'fill-row';
      row.innerHTML = `<label>${key}</label><input type="text" placeholder="请输入答案" data-blank="${key}">`;
      fillContainer.appendChild(row);
    });

    // Grading mode toggle
    const toggleRow = document.createElement('div');
    toggleRow.className = 'grade-toggle';
    toggleRow.innerHTML = `
      <span class="grade-toggle-label">判分方式：</span>
      <button class="grade-opt active" data-mode="local"><span class="svg-icon">${CLIPBOARD}</span>本地判分</button>
      <button class="grade-opt" data-mode="ai"><span class="svg-icon">${BRAIN}</span>AI 判分</button>
    `;
    toggleRow.querySelectorAll('.grade-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleRow.querySelectorAll('.grade-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gradeMode = (btn as HTMLElement).dataset.mode as 'local' | 'ai';
      });
    });
    fillContainer.appendChild(toggleRow);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary';
    submitBtn.id = 'fillSubmitBtn';
    submitBtn.style.marginTop = '8px';
    submitBtn.textContent = '✓ 提交答案';
    submitBtn.addEventListener('click', () => this.handleSubmit(q, config));
    fillContainer.appendChild(submitBtn);
  }

  private async handleSubmit(q: Question, config: RenderConfig): Promise<void> {
    if (this.handled) return;

    const { fillContainer, onAnswered } = config;
    const inputs = fillContainer.querySelectorAll<HTMLInputElement>('input[data-blank]');
    const userAnswers: Record<string, string> = {};

    inputs.forEach(inp => {
      userAnswers[inp.dataset.blank ?? ''] = inp.value.trim();
      inp.disabled = true;
    });

    // ── Local mode ──
    if (this.gradeMode === 'local') {
      let allCorrect = true;
      inputs.forEach(inp => {
        const key = inp.dataset.blank ?? '';
        const userAns = userAnswers[key] || '';
        const correctAns = contentBlocksToText(q.options[key]).trim();
        const ok = userAns.toLowerCase() === correctAns.toLowerCase();
        inp.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) allCorrect = false;
      });
      this.handled = true;
      onAnswered({ isCorrect: allCorrect });
      return;
    }

    // ── AI mode ──
    const submitBtn = fillContainer.querySelector('#fillSubmitBtn') as HTMLButtonElement;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ AI 判分中...';
    }

    const result = await gradeFillAnswer(q, userAnswers);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🤖 AI 判分完成';
      submitBtn.style.display = 'none';
    }

    if (!result) {
      // Fallback to local
      let allCorrect = true;
      inputs.forEach(inp => {
        const key = inp.dataset.blank ?? '';
        const userAns = userAnswers[key] || '';
        const correctAns = contentBlocksToText(q.options[key]).trim();
        const ok = userAns.toLowerCase() === correctAns.toLowerCase();
        inp.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) allCorrect = false;
      });
      this.handled = true;
      onAnswered({ isCorrect: allCorrect });
      return;
    }

    // Apply AI results to inputs
    const overall = result.overall;
    result.results.forEach(r => {
      const inp = fillContainer.querySelector<HTMLInputElement>(`input[data-blank="${r.blank}"]`);
      if (inp) {
        inp.classList.add(r.correct ? 'correct' : 'wrong');
      }
    });

    // Show AI feedback per blank
    const fbDiv = document.createElement('div');
    fbDiv.className = 'ai-grade-feedback';
    fbDiv.innerHTML = result.results.map(r =>
      `<div class="ai-grade-item ${r.correct ? 'correct' : 'wrong'}">
        <span class="ai-grade-blank">${r.blank}</span>
        <span>${r.feedback}</span>
      </div>`
    ).join('');
    fillContainer.appendChild(fbDiv);

    this.handled = true;
    onAnswered({ isCorrect: overall === 'correct' });
  }

  showAnswer(q: Question): void {
    this.handled = true;
    const inputs = document.querySelectorAll<HTMLInputElement>('#fillContainer input[data-blank]');
    inputs.forEach(inp => {
      inp.disabled = true;
      inp.value = contentBlocksToText(q.options[inp.dataset.blank ?? '']);
      inp.classList.add('correct');
    });
  }

  destroy(): void {
    this.handled = false;
  }
}
