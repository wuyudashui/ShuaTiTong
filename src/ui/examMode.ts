import type { Question } from '../types';
import { store } from '../state';

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Exam setup modal ───

export function showExamSetup(questions: Question[]): void {
  if (!questions.length) {
    alert('请先上传题库。');
    return;
  }

  // Create modal dynamically
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'examSetupModal';
  overlay.innerHTML = `
    <div class="modal">
      <h2>📝 模拟考试设置</h2>
      <p style="color:var(--text-secondary);margin-bottom:16px">从题库中随机抽取题目组成模拟试卷。</p>
      <label>题库共 <strong>${questions.length}</strong> 道题，抽取数量：</label>
      <div class="exam-count-options">
        ${[10, 20, 50].map(n =>
          questions.length >= n
            ? `<button class="exam-count-btn btn-outline" data-count="${n}">${n} 题</button>`
            : ''
        ).join('')}
        <button class="exam-count-btn btn-outline" data-count="${questions.length}">全部 (${questions.length}题)</button>
      </div>
      <div style="margin-top:12px">
        <label>自定义数量：</label>
        <input type="number" id="examCustomCount" min="1" max="${questions.length}" value="${Math.min(10, questions.length)}" style="width:100%">
      </div>
      <div class="modal-actions">
        <button id="examCancelBtn" class="btn-outline">取消</button>
        <button id="examStartBtn" class="btn-primary">📝 开始考试</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Bind events
  const countBtns = overlay.querySelectorAll<HTMLButtonElement>('.exam-count-btn');
  const customInput = document.getElementById('examCustomCount') as HTMLInputElement;
  let selectedCount = Math.min(10, questions.length);

  countBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      countBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCount = parseInt(btn.dataset.count ?? '10');
      customInput.value = String(selectedCount);
    });
  });
  // Default select first
  const firstBtn = countBtns[0] as HTMLButtonElement | undefined;
  if (firstBtn) firstBtn.classList.add('active');

  customInput.addEventListener('input', () => {
    countBtns.forEach(b => b.classList.remove('active'));
    const v = parseInt(customInput.value);
    if (!isNaN(v) && v > 0) selectedCount = Math.min(v, questions.length);
  });

  const close = () => { overlay.remove(); };

  overlay.querySelector('#examCancelBtn')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#examStartBtn')?.addEventListener('click', () => {
    const count = Math.max(1, Math.min(selectedCount, questions.length));
    startExam(questions, count);
    close();
  });
}

function startExam(questions: Question[], count: number): void {
  const picked = shuffle(questions).slice(0, count);
  store.startExam(picked);

  // Switch to practice tab and trigger re-render
  const practiceTab = document.querySelector<HTMLElement>('[data-tab="practice"]');
  practiceTab?.click();

  // Re-render will pick up exam mode
  window.dispatchEvent(new CustomEvent('exam-started'));
}

// ─── Exam results ───

export function showExamResults(): void {
  const { exam } = store;
  const total = exam.total;
  const answered = Object.keys(exam.answers).length;
  const correct = Object.values(exam.answers).filter(a => a === 'correct').length;
  const wrong = answered - correct;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal exam-result-modal">
      <h2>📊 模拟考试结果</h2>
      <div class="exam-result-score">
        <span class="score-num">${correct}/${total}</span>
        <span class="score-pct">${rate}%</span>
      </div>
      <div class="exam-result-detail">
        <div class="exam-result-stat"><span>✅ 正确</span><span class="num correct">${correct}</span></div>
        <div class="exam-result-stat"><span>❌ 错误</span><span class="num wrong">${wrong}</span></div>
        <div class="exam-result-stat"><span>📊 正确率</span><span class="num">${rate}%</span></div>
        <div class="exam-result-stat"><span>📝 已作答</span><span class="num">${answered}/${total}</span></div>
      </div>
      <div class="modal-actions">
        <button id="examResultReviewBtn" class="btn-outline">📋 逐题查看</button>
        <button id="examResultExitBtn" class="btn-primary">✅ 完成</button>
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
    const firstWrong = exam.questions.findIndex(q => exam.answers[q.id] === 'wrong');
    if (firstWrong >= 0) {
      store.setExamIndex(firstWrong);
      window.dispatchEvent(new CustomEvent('exam-started'));
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}
