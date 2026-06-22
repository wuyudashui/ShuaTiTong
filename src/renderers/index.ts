import type { Question, QuestionRenderer, RenderConfig } from '../types';
import { SingleRenderer } from './single';
import { MultiRenderer } from './multi';
import { FillRenderer } from './fill';

const RENDERER_MAP: Record<string, QuestionRenderer> = {
  single: new SingleRenderer(),
  judge: new SingleRenderer(),
  multi: new MultiRenderer(),
  fill: new FillRenderer(),
};

let currentType: string | null = null;

export function renderQuestion(q: Question, config: RenderConfig): void {
  // Destroy previous renderer
  if (currentType && RENDERER_MAP[currentType]) {
    RENDERER_MAP[currentType].destroy();
  }

  const renderer = RENDERER_MAP[q.type];
  if (!renderer) return;

  currentType = q.type;
  renderer.render(q, config);
}

export function showAnswer(q: Question): void {
  if (currentType && RENDERER_MAP[currentType]) {
    RENDERER_MAP[currentType].showAnswer(q);
  }
}

export function destroyCurrent(): void {
  if (currentType && RENDERER_MAP[currentType]) {
    RENDERER_MAP[currentType].destroy();
    currentType = null;
  }
}
