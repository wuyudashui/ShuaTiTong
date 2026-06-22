import type { Question, QuestionRenderer, RenderConfig } from '../types';

export class MultiRenderer implements QuestionRenderer {
  readonly type = 'multi' as const;
  private entries: [string, string][] = [];
  private handled = false;

  render(q: Question, config: RenderConfig): void {
    this.handled = false;
    const { optContainer } = config;
    this.entries = Object.entries(q.options || {}).filter(([, v]) => v !== '');

    this.entries.forEach(([key, text]) => {
      const div = document.createElement('div');
      div.className = 'option';
      div.innerHTML = `<span class="cb">✓</span><span class="letter">${key}</span><span class="text">${text}</span>`;
      div.addEventListener('click', () => {
        if (!this.handled) div.classList.toggle('selected');
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
    submitBtn.addEventListener('click', () => this.handleSubmit(q, config));
    optContainer.appendChild(submitBtn);
  }

  private handleSubmit(q: Question, config: RenderConfig): void {
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

    onAnswered({ isCorrect });
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

  destroy(): void {
    this.handled = false;
  }
}
