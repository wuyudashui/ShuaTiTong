import type { Question, QuestionRenderer, RenderConfig } from '../types';
import { shuffleArray } from '../utils';

export class MultiRenderer implements QuestionRenderer {
  readonly type = 'multi' as const;
  private entries: [string, string][] = [];
  private handled = false;
  private examMode = false;
  private optContainer: HTMLElement | null = null;

  render(q: Question, config: RenderConfig): void {
    this.handled = false;
    this.examMode = config.examMode ?? false;
    this.optContainer = config.optContainer;
    const { optContainer } = config;

    let entries = Object.entries(q.options || {}).filter(([, v]) => v !== '');
    if (this.examMode && entries.length > 2) {
      entries = shuffleArray(entries);
    }
    this.entries = entries;

    entries.forEach(([key, text], i) => {
      const display = this.examMode ? String.fromCharCode(65 + i) : key;
      const div = document.createElement('div');
      div.className = 'option';
      div.innerHTML = `<span class="cb">✓</span><span class="letter">${display}</span><span class="text">${text}</span>`;
      div.addEventListener('click', () => {
        // In practice mode, block after answered. In graded review, always block.
        if (this.handled) return;
        div.classList.toggle('selected');
      });
      optContainer.appendChild(div);
    });

    const answerLen = q.answer.length;
    const hint = document.createElement('div');
    hint.className = 'multi-hint';
    hint.textContent = `请选择 ${answerLen} 项`;
    optContainer.appendChild(hint);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary';
    submitBtn.style.marginTop = '8px';
    submitBtn.textContent = '✓ 提交答案';
    submitBtn.addEventListener('click', () => {
      if (this.handled) return;
      this.handleSubmit(q, config);
    });
    optContainer.appendChild(submitBtn);
  }

  private handleSubmit(q: Question, config: RenderConfig): void {
    if (!this.examMode) {
      // ── Practice mode: immediate feedback ──
      if (this.handled) return;

      const { optContainer, onAnswered } = config;
      const opts = optContainer.querySelectorAll('.option');
      const selected: string[] = [];

      opts.forEach((el, i) => {
        if (el.classList.contains('selected')) selected.push(this.entries[i]?.[0] ?? '');
      });

      if (selected.length === 0) {
        alert('请至少选择一个选项');
        return;
      }

      this.handled = true;
      opts.forEach(el => el.classList.add('disabled'));

      const correctAnswer = q.answer.toUpperCase().split('').sort().join('');
      const userAnswer = selected.sort().join('').toUpperCase();
      const isCorrect = userAnswer === correctAnswer;
      const answerUpper = q.answer.toUpperCase();

      this.entries.forEach(([key], i) => {
        if (answerUpper.includes(key.toUpperCase())) opts[i]?.classList.add('highlight');
        if (selected.includes(key) && !answerUpper.includes(key.toUpperCase())) opts[i]?.classList.add('wrong');
      });

      onAnswered({ isCorrect, selected: selected.sort().join('') });
      return;
    }

    // ── Exam mode: record selection, no feedback ──
    const { optContainer, onAnswered } = config;
    const opts = optContainer.querySelectorAll('.option');
    const selected: string[] = [];

    opts.forEach((el, i) => {
      if (el.classList.contains('selected')) selected.push(this.entries[i]?.[0] ?? '');
    });

    if (selected.length === 0) {
      alert('请至少选择一个选项');
      return;
    }

    onAnswered({ isCorrect: false, selected: selected.sort().join('') });
  }

  showAnswer(q: Question): void {
    this.handled = true;
    const opts = document.querySelectorAll('#optionsContainer .option');
    const answerUpper = q.answer.toUpperCase();
    this.entries.forEach(([key], i) => {
      if (opts[i] && answerUpper.includes(key.toUpperCase())) {
        opts[i].classList.add('highlight');
      }
    });
  }

  /** Restore previously selected answer in exam mode */
  restoreSelected(answer: string): void {
    if (!answer) return;
    const opts = this.optContainer?.querySelectorAll('.option') ?? [];
    this.entries.forEach(([key], i) => {
      const el = opts[i] as HTMLElement | undefined;
      if (el && answer.toUpperCase().includes(key.toUpperCase())) {
        el.classList.add('selected');
      }
    });
  }

  destroy(): void {
    this.handled = false;
  }
}
