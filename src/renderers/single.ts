import type { Question, QuestionType, QuestionRenderer, RenderConfig } from '../types';

export class SingleRenderer implements QuestionRenderer {
  type: QuestionType = 'single';
  private entries: [string, string][] = [];
  private handled = false;

  render(q: Question, config: RenderConfig): void {
    this.handled = false;
    this.type = q.type;
    this.entries = Object.entries(q.options || {}).filter(([, v]) => v !== '');
    const { optContainer } = config;

    this.entries.forEach(([key, text]) => {
      const div = document.createElement('div');
      div.className = 'option';
      div.innerHTML = `<span class="letter">${key}</span><span class="text">${text}</span>`;
      div.addEventListener('click', () => this.handleClick(q, key, config));
      optContainer.appendChild(div);
    });
  }

  private handleClick(q: Question, selected: string, config: RenderConfig): void {
    if (this.handled) return;
    this.handled = true;

    const { optContainer, onAnswered } = config;
    const opts = optContainer.querySelectorAll('.option');
    opts.forEach(el => el.classList.add('disabled'));

    const isCorrect = selected.toUpperCase() === q.answer.toUpperCase();
    this.entries.forEach(([key], i) => {
      if (key.toUpperCase() === q.answer.toUpperCase()) opts[i]?.classList.add('correct');
      if (key === selected && !isCorrect) opts[i]?.classList.add('wrong');
    });

    onAnswered({ isCorrect });
  }

  showAnswer(q: Question): void {
    this.handled = true;
    const opts = document.querySelectorAll('#optionsContainer .option');
    this.entries.forEach(([key], i) => {
      if (opts[i] && key.toUpperCase() === q.answer.toUpperCase()) {
        opts[i].classList.add('correct');
      }
    });
  }

  destroy(): void {
    this.handled = false;
  }
}
