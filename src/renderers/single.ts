import type { Question, QuestionType, QuestionRenderer, RenderConfig } from '../types';
import { shuffleArray } from '../utils';

export class SingleRenderer implements QuestionRenderer {
  type: QuestionType = 'single';
  private entries: [string, string][] = [];
  private handled = false;
  private selectedKey: string | null = null;
  private optContainer: HTMLElement | null = null;
  private examMode = false;

  render(q: Question, config: RenderConfig): void {
    this.handled = false;
    this.selectedKey = null;
    this.type = q.type;
    this.examMode = config.examMode ?? false;
    this.optContainer = config.optContainer;

    let entries = Object.entries(q.options || {}).filter(([, v]) => v !== '');
    if (this.examMode && entries.length > 2) {
      entries = shuffleArray(entries);
    }
    this.entries = entries;

    entries.forEach(([key, text], i) => {
      const display = this.examMode ? String.fromCharCode(65 + i) : key;
      const div = document.createElement('div');
      div.className = 'option';
      if (this.examMode && key === this.selectedKey) div.classList.add('selected');
      div.innerHTML = `<span class="letter">${display}</span><span class="text">${text}</span>`;
      div.addEventListener('click', () => this.handleClick(q, key, config));
      config.optContainer.appendChild(div);
    });
  }

  private handleClick(q: Question, originalKey: string, config: RenderConfig): void {
    if (!this.examMode) {
      // ── Practice mode: immediate feedback ──
      if (this.handled) return;
      this.handled = true;

      const { optContainer, onAnswered } = config;
      const opts = optContainer.querySelectorAll('.option');
      opts.forEach(el => el.classList.add('disabled'));

      const isCorrect = originalKey.toUpperCase() === q.answer.toUpperCase();
      this.entries.forEach(([key], i) => {
        if (key.toUpperCase() === q.answer.toUpperCase()) opts[i]?.classList.add('correct');
        if (key === originalKey && !isCorrect) opts[i]?.classList.add('wrong');
      });

      onAnswered({ isCorrect, selected: originalKey });
      return;
    }

    // ── Exam mode: toggle selection, no feedback ──
    // During graded review (handled=true via showAnswer), block clicks
    if (this.handled) return;

    const { optContainer, onAnswered } = config;
    const opts = optContainer.querySelectorAll('.option');

    if (this.selectedKey === originalKey) {
      // Deselect
      this.selectedKey = null;
      this.entries.forEach(([key], i) => {
        if (key === originalKey) opts[i]?.classList.remove('selected');
      });
      onAnswered({ isCorrect: false, selected: '' });
    } else {
      // Select this option, deselect others
      this.selectedKey = originalKey;
      this.entries.forEach(([key], i) => {
        if (key === originalKey) {
          opts[i]?.classList.add('selected');
        } else {
          opts[i]?.classList.remove('selected');
        }
      });
      onAnswered({ isCorrect: false, selected: originalKey });
    }
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

  /** Restore previously selected answer in exam mode */
  restoreSelected(answer: string): void {
    if (!answer) return;
    this.selectedKey = answer;
    const opts = this.optContainer?.querySelectorAll('.option') ?? [];
    this.entries.forEach(([key], i) => {
      const el = opts[i] as HTMLElement | undefined;
      if (el && key.toUpperCase() === answer.toUpperCase()) {
        el.classList.add('selected');
      }
    });
  }

  destroy(): void {
    this.handled = false;
    this.selectedKey = null;
    this.optContainer = null;
  }
}
