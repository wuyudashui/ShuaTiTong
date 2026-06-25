import type { Question, QuestionType, ExamRecord } from '../types';
import { TYPE_LABELS } from '../types';
import type { ExamSection } from '../types';
import { store } from '../state';
import { CLIPBOARD, CHECK, X, BAR_CHART, GRID, BOOK_OPEN, SEND } from '../icons';

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TYPE_ORDER: QuestionType[] = ['single', 'judge', 'multi', 'fill'];

// ─── Exam setup modal (per-type count selection) ───

export function showExamSetup(questions: Question[]): void {
  if (questions.length === 0) {
    alert('题库为空，无法组卷。');
    return;
  }

  // Count by type
  const typeCounts: Partial<Record<QuestionType, number>> = {};
  for (const q of questions) {
    typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'examSetupModal';
  overlay.innerHTML = `
    <div class="modal">
      <h2><span class="svg-icon">${CLIPBOARD}</span>模拟考试设置</h2>
      <p style="color:var(--text-secondary);margin-bottom:16px">选择每种题型的题目数量，从题库中随机抽题组卷。</p>
      <div class="exam-type-config">
        ${TYPE_ORDER.filter(t => (typeCounts[t] || 0) > 0).map(type => `
          <div class="exam-type-row">
            <label>${TYPE_LABELS[type]}</label>
            <div class="exam-type-controls">
              <input type="number" class="exam-type-count" data-type="${type}"
                min="0" max="${typeCounts[type]}" value="${typeCounts[type]}">
              <span class="exam-type-total">/ ${typeCounts[type]} 题</span>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:8px">
        <button id="examSelectAllBtn" class="btn-sm btn-outline"><span class="svg-icon">${GRID}</span>全选</button>
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button id="examCancelBtn" class="btn-outline">取消</button>
        <button id="examStartBtn" class="btn-primary"><span class="svg-icon">${SEND}</span>开始考试</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Bind events
  const inputs = overlay.querySelectorAll<HTMLInputElement>('.exam-type-count');

  overlay.querySelector('#examSelectAllBtn')?.addEventListener('click', () => {
    inputs.forEach(inp => {
      inp.value = inp.max;
    });
  });

  const close = () => { overlay.remove(); };
  overlay.querySelector('#examCancelBtn')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#examStartBtn')?.addEventListener('click', () => {
    const counts: Partial<Record<QuestionType, number>> = {};
    let total = 0;
    for (const inp of inputs) {
      const type = inp.dataset.type as QuestionType;
      const val = parseInt(inp.value) || 0;
      const max = parseInt(inp.max);
      counts[type] = Math.max(0, Math.min(val, max));
      total += counts[type]!;
    }
    if (total === 0) {
      alert('请至少选择一道题目。');
      return;
    }
    startExam(questions, counts as Record<QuestionType, number>);
    close();
  });
}

function startExam(
  allQuestions: Question[],
  counts: Record<QuestionType, number>,
): void {
  // Group by type and shuffle within each type
  const grouped: Partial<Record<QuestionType, Question[]>> = {};
  for (const q of allQuestions) {
    if (!grouped[q.type]) grouped[q.type] = [];
    grouped[q.type]!.push(q);
  }
  for (const type of TYPE_ORDER) {
    if (grouped[type]) grouped[type] = shuffle(grouped[type]!);
  }

  // Pick specified count from each type
  const picked: Question[] = [];
  const sections: ExamSection[] = [];

  for (const type of TYPE_ORDER) {
    const pool = grouped[type] || [];
    const count = counts[type] || 0;
    if (count <= 0 || pool.length === 0) continue;

    const start = picked.length;
    picked.push(...pool.slice(0, Math.min(count, pool.length)));
    sections.push({
      type,
      label: TYPE_LABELS[type],
      start,
      end: picked.length,
    });
  }

  if (picked.length === 0) {
    alert('没有可用的题目。');
    return;
  }

  store.startExam(picked, sections);

  const practiceTab = document.querySelector<HTMLElement>('[data-tab="practice"]');
  practiceTab?.click();
  window.dispatchEvent(new CustomEvent('exam-started'));
}

// ─── Render type tabs for exam navigation ───

export function renderExamTypeTabs(container: HTMLElement): void {
  const { sections, currentIndex } = store.exam;
  const currentSection = sections.find(s => currentIndex >= s.start && currentIndex < s.end);

  container.innerHTML = sections.map(s =>
    `<button class="exam-type-tab ${s.type === currentSection?.type ? 'active' : ''}"
             data-type="${s.type}">${s.label} (${s.end - s.start}题)</button>`
  ).join('');
}

export function bindExamTypeTabs(container: HTMLElement, onNavigate: () => void): void {
  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.exam-type-tab') as HTMLElement | null;
    if (!btn) return;
    const type = btn.dataset.type;
    const section = store.exam.sections.find(s => s.type === type);
    if (!section) return;
    store.setExamIndex(section.start);
    onNavigate();
  });
}

// ─── Get current section info for display ───

export function getCurrentSectionInfo(): { label: string; idx: number; total: number } | null {
  const { sections, currentIndex } = store.exam;
  const section = sections.find(s => currentIndex >= s.start && currentIndex < s.end);
  if (!section) return null;
  return {
    label: section.label,
    idx: currentIndex - section.start + 1,
    total: section.end - section.start,
  };
}

// ─── Exam results ───

export function showExamResults(): void {
  const { exam } = store;
  const result = store.gradeExam();
  const total = exam.total;
  const answered = Object.keys(exam.answers).length;
  const correct = result.correct;
  const wrong = result.wrong;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Save exam record (only if at least 1 question was answered)
  if (answered > 0) {
    const wrongIds = Object.entries(result.details)
      .filter(([, d]) => !d.isCorrect)
      .map(([id]) => Number(id));
    const record: ExamRecord = {
      id: Date.now().toString(),
      date: Date.now(),
      correct,
      wrong,
      total,
      wrongIds,
      sections: exam.sections.map(s => {
        let secCorrect = 0;
        for (let i = s.start; i < s.end; i++) {
          if (result.details[exam.questions[i].id]?.isCorrect) secCorrect++;
        }
        return { label: s.label, correct: secCorrect, total: s.end - s.start };
      }),
    };
    store.addExamRecord(record);
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal exam-result-modal">
      <h2><span class="svg-icon">${BAR_CHART}</span>模拟考试结果</h2>
      <div class="exam-result-score">
        <span class="score-num">${correct}/${total}</span>
        <span class="score-pct">${rate}%</span>
      </div>
      <div class="exam-result-detail">
        <div class="exam-result-stat"><span><span class="svg-icon" style="width:16px;height:16px">${CHECK}</span>正确</span><span class="num correct">${correct}</span></div>
        <div class="exam-result-stat"><span><span class="svg-icon" style="width:16px;height:16px">${X}</span>错误</span><span class="num wrong">${wrong}</span></div>
        <div class="exam-result-stat"><span><span class="svg-icon" style="width:16px;height:16px">${BAR_CHART}</span>正确率</span><span class="num">${rate}%</span></div>
        <div class="exam-result-stat"><span><span class="svg-icon" style="width:16px;height:16px">${CLIPBOARD}</span>已作答</span><span class="num">${answered}/${total}</span></div>
      </div>
      <div class="exam-result-detail" style="margin-top:8px;font-size:.85rem">
        ${exam.sections.map(s => {
          let secCorrect = 0;
          for (let i = s.start; i < s.end; i++) {
            if (result.details[exam.questions[i].id]?.isCorrect) secCorrect++;
          }
          const secTotal = s.end - s.start;
          return `<div class="exam-result-stat"><span>${s.label}</span><span class="num">${secCorrect}/${secTotal}</span></div>`;
        }).join('')}
      </div>
      <div class="modal-actions">
        <button id="examResultReviewBtn" class="btn-outline"><span class="svg-icon">${BOOK_OPEN}</span>逐题查看</button>
        <button id="examResultExitBtn" class="btn-primary"><span class="svg-icon">${CHECK}</span>完成</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#examResultExitBtn')?.addEventListener('click', () => {
    store.exitExam();
    overlay.remove();
    const practiceTab = document.querySelector<HTMLElement>('[data-tab="practice"]');
    practiceTab?.click();
    window.dispatchEvent(new CustomEvent('exam-exited'));
  });

  overlay.querySelector('#examResultReviewBtn')?.addEventListener('click', () => {
    overlay.remove();
    store.markExamGraded(result.details);
    const firstWrong = exam.questions.findIndex(q => result.details[q.id]?.isCorrect === false);
    store.setExamIndex(firstWrong >= 0 ? firstWrong : 0);
    window.dispatchEvent(new CustomEvent('exam-started'));
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
