import './styles.css';
import type { Question } from './types';
import { TYPE_LABELS } from './types';
import { store } from './state';
import { getFiltered } from './filter';
import { formatExplanation, autoExplanation } from './format';
import { renderQuestion as dispatchRender, showAnswer as dispatchShowAnswer } from './renderers/index';
import type { RenderConfig } from './types';
import { fetchAIExplanation } from './ai';
import { applyTheme } from './ui/theme';
import { initTheme } from './ui/theme';
import { initSettings } from './ui/settings';
import { renderErrorBook, bindErrorBookClicks } from './ui/errorBook';
import { renderThumbnails, handleThumbnailClick, setThumbnailJumpHandler } from './ui/questionGrid';
import { showExamSetup, showExamResults } from './ui/examMode';

// ─── DOM refs ───
const $ = (id: string) => document.getElementById(id)!;
const fileInput       = $('fileInput') as HTMLInputElement;
const fileStatus      = $('fileStatus');
const uploadArea      = $('uploadArea');
const recentList      = $('recentList');
const themeBtn        = $('themeBtn');
const resetBtn        = $('resetProgressBtn');
const tabBar          = $('tabBar');
const filterBar       = $('filterBar');
const practiceView    = $('practiceView');
const errorView       = $('errorBookView');
const errorCount      = $('errorCount');
const progressDisp    = $('progressDisplay');
const correctDisp     = $('correctCount');
const wrongDisp       = $('wrongCount');
const accuracyDisp    = $('accuracyDisplay');
const qNumber         = $('qNumber');
const qTags           = $('qTags');
const qText           = $('qText');
const optContainer    = $('optionsContainer');
const fillContainer   = $('fillContainer');
const feedback        = $('feedback');
const feedbackRes     = $('feedbackResult');
const explanation     = $('explanationText');
const prevBtn         = $('prevBtn');
const nextBtn         = $('nextBtn');
const randomBtn       = $('randomBtn');
const showAnsBtn      = $('showAnswerBtn');
const aiExplainBtn    = $('aiExplainBtn') as HTMLButtonElement;
const examBtn         = $('examBtn');
const thumbToggleBtn  = $('thumbToggleBtn');
const thumbGrid       = $('thumbGrid');
const thumbInfo       = $('thumbInfo');
const examBanner      = $('examBanner');
const submitExamBtn   = $('submitExamBtn');
const undoBtn         = $('undoBtn');

// ─── Undo state ───
let undoInfo: { qId: number; prevCorrect: number; prevWrong: number; isExam: boolean } | null = null;

function performUndo(): void {
  if (!undoInfo) return;
  if (undoInfo.isExam) {
    delete store.exam.answers[undoInfo.qId];
  } else {
    store.update({ correctCount: undoInfo.prevCorrect, wrongCount: undoInfo.prevWrong });
    const s = store.state;
    delete s.answeredMap[undoInfo.qId];
    if (s.errorBook[undoInfo.qId]) { const eb = { ...s.errorBook }; delete eb[undoInfo.qId]; s.errorBook = eb; }
    store.save();
  }
  undoInfo = null;
  undoBtn.classList.add('hidden');
  feedback.classList.remove('show', 'correct', 'wrong', 'ai-exp');
  store.setAnswered(false);
  updateStats();
  renderQuestion();
}

undoBtn.addEventListener('click', performUndo);

// ─── Render config (passed to renderers) ───
const renderConfig: RenderConfig = {
  optContainer,
  fillContainer,
  feedback,
  feedbackResult: feedbackRes,
  explanation,
  onAnswered: (result) => {
    if (store.exam.active) {
      const q = store.exam.questions[store.exam.currentIndex];
      if (!q || store.exam.answers[q.id]) return;
      undoInfo = { qId: q.id, prevCorrect: 0, prevWrong: 0, isExam: true };
      store.recordExamAnswer(q.id, result.isCorrect ? 'correct' : 'wrong');
      if (result.isCorrect) {
        feedback.classList.add('correct');
        feedbackRes.innerHTML = '✅ 回答正确！';
      } else {
        if (q.type === 'multi') {
          feedbackRes.innerHTML = `❌ 回答错误（正确答案：${q.answer}）`;
        } else {
          feedbackRes.innerHTML = '❌ 回答错误';
        }
        feedback.classList.add('wrong');
      }
      store.setAnswered(true);
      feedback.classList.add('show');
      explanation.innerHTML = formatExplanation(q.explanation || autoExplanation(q));
      undoBtn.classList.remove('hidden');
      updateStats();
      updateExamUI();
    } else {
      const q = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook)[store.state.currentIndex];
      if (!q) return;

      undoInfo = { qId: q.id, prevCorrect: store.state.correctCount, prevWrong: store.state.wrongCount, isExam: false };

      if (result.isCorrect) {
        store.update({ correctCount: store.state.correctCount + 1 });
        store.state.answeredMap[q.id] = 'correct';
        const eb = { ...store.state.errorBook };
        delete eb[q.id];
        store.state.errorBook = eb;
        feedback.classList.add('correct');
        feedbackRes.innerHTML = '✅ 回答正确！';
      } else {
        store.update({ wrongCount: store.state.wrongCount + 1 });
        store.state.answeredMap[q.id] = 'wrong';
        store.state.errorBook = { ...store.state.errorBook, [q.id]: true };

        if (q.type === 'multi') {
          feedbackRes.innerHTML = `❌ 回答错误（正确答案：${q.answer}）`;
        } else {
          feedbackRes.innerHTML = '❌ 回答错误';
        }
        feedback.classList.add('wrong');
      }

      store.setAnswered(true);
      feedback.classList.add('show');
      explanation.innerHTML = formatExplanation(q.explanation || autoExplanation(q));
      undoBtn.classList.remove('hidden');
      updateStats();
      store.save();
    }
  },
};

// ─── Render current question ───
function renderQuestion(): void {
  feedback.classList.remove('show', 'correct', 'wrong', 'ai-exp');
  store.setAnswered(false);
  undoBtn.classList.add('hidden');
  undoInfo = null;

  // ─── Exam mode path ───
  if (store.exam.active) {
    const { questions, currentIndex, answeredMap } = store.state;
    const examQs = store.exam.questions;
    const idx = store.exam.currentIndex;

    if (!examQs.length) {
      qText.textContent = '无考试题目。';
      optContainer.innerHTML = '';
      fillContainer.innerHTML = '';
      fillContainer.classList.add('hidden');
      return;
    }

    const q = examQs[idx];
    const total = examQs.length;

    progressDisp.textContent = `${idx + 1}/${total}`;
    qNumber.textContent = `第 ${idx + 1} 题 / 共 ${total} 题（模拟考）`;
    qTags.innerHTML = `
      <span class="q-tag">${TYPE_LABELS[q.type as keyof typeof TYPE_LABELS] || q.type}</span>
      <span class="q-tag">${q.difficulty || '中'}</span>
    `;
    qText.textContent = q.question;
    optContainer.innerHTML = '';
    fillContainer.innerHTML = '';
    fillContainer.classList.add('hidden');
    optContainer.classList.remove('hidden');

    dispatchRender(q, renderConfig);

    // Restore answered state
    const prevResult = store.exam.answers[q.id];
    if (prevResult) {
      store.setAnswered(true);
      dispatchShowAnswer(q);
      if (prevResult === 'correct') {
        feedback.classList.add('show', 'correct');
        feedbackRes.innerHTML = '✅ 回答正确！';
      } else {
        feedback.classList.add('show', 'wrong');
        feedbackRes.innerHTML = '❌ 回答错误';
      }
      explanation.innerHTML = formatExplanation(q.explanation || autoExplanation(q));
    }

    updateThumbnails();
    updateStats();
    updateExamUI();
    return;
  }

  // ─── Normal mode ───
  const { questions, currentIndex, answeredMap, filterType } = store.state;
  const filtered = getFiltered(questions, filterType, store.state.errorBook);

  if (!questions.length || !filtered.length) {
    qNumber.textContent = '第 0 题 / 共 0 题';
    qTags.innerHTML = '';
    qText.textContent = !questions.length ? '请先上传题库文件。' : '当前筛选条件下无题目。';
    optContainer.innerHTML = '';
    fillContainer.classList.add('hidden');
    optContainer.classList.remove('hidden');
    progressDisp.textContent = '0/0';
    updateThumbnails();
    return;
  }

  // Clamp index
  let idx = currentIndex;
  if (idx < 0) idx = 0;
  if (idx >= filtered.length) idx = filtered.length - 1;
  if (idx !== currentIndex) store.update({ currentIndex: idx });

  const q = filtered[idx];
  const total = filtered.length;
  progressDisp.textContent = `${idx + 1}/${total}`;
  qNumber.textContent = `第 ${idx + 1} 题 / 共 ${total} 题`;

  qTags.innerHTML = `
    <span class="q-tag">${TYPE_LABELS[q.type as keyof typeof TYPE_LABELS] || q.type}</span>
    <span class="q-tag">${q.difficulty || '中'}</span>
  `;

  qText.textContent = q.question;
  optContainer.innerHTML = '';
  fillContainer.innerHTML = '';
  fillContainer.classList.add('hidden');
  optContainer.classList.remove('hidden');

  // Render via dispatcher
  dispatchRender(q, renderConfig);

  // Restore answered state from store
  const prevResult = answeredMap[q.id];
  if (prevResult) {
    store.setAnswered(true);
    dispatchShowAnswer(q);
    if (prevResult === 'correct') {
      feedback.classList.add('show', 'correct');
      feedbackRes.innerHTML = '✅ 回答正确！';
    } else {
      feedback.classList.add('show', 'wrong');
      feedbackRes.innerHTML = '❌ 回答错误';
    }
    explanation.innerHTML = formatExplanation(q.explanation || autoExplanation(q));
  }

  updateThumbnails();
  updateStats();
}

// ─── Exam UI ───
function updateExamUI(): void {
  if (!store.exam.active) {
    examBanner.classList.add('hidden');
    submitExamBtn.classList.add('hidden');
    randomBtn.classList.remove('hidden');
    showAnsBtn.classList.remove('hidden');
    return;
  }

  examBanner.classList.remove('hidden');
  const answered = store.examAnsweredCount;
  const total = store.exam.total;
  const correct = store.examCorrectCount;
  examBanner.innerHTML = `
    <span class="exam-progress">📝 模拟考：${answered}/${total} 已答</span>
    <span class="exam-info">✅ ${correct} 正确 · ❌ ${answered - correct} 错误</span>
    <button id="exitExamBtn" class="btn-sm" style="background:rgba(255,255,255,.2);border-color:transparent;color:#fff">✕ 退出</button>
  `;
  examBanner.querySelector('#exitExamBtn')?.addEventListener('click', () => {
    if (confirm('确定退出模拟考试？进度将丢失。')) {
      store.exitExam();
      window.dispatchEvent(new CustomEvent('exam-exited'));
    }
  });

  // Show submit button when all answered
  submitExamBtn.classList.toggle('hidden', answered < total);
  randomBtn.classList.add('hidden');
  showAnsBtn.classList.add('hidden');
}

// ─── Thumbnails ───
function updateThumbnails(): void {
  if (!store.thumbOpen) return;
  const qs = store.exam.active ? store.exam.questions : getFiltered(store.state.questions, store.state.filterType, store.state.errorBook);
  const currentQ = store.exam.active
    ? store.exam.questions[store.exam.currentIndex]
    : (qs.length ? qs[store.state.currentIndex] : null);
  const answerMap = store.exam.active ? store.exam.answers : store.state.answeredMap;
  thumbGrid.innerHTML = renderThumbnails(qs, answerMap, currentQ?.id ?? -1);
  thumbInfo.textContent = `共 ${qs.length} 题`;
}

// ─── Stats ───
function updateStats(): void {
  if (store.exam.active) {
    const answered = store.examAnsweredCount;
    const correct = store.examCorrectCount;
    const total = store.exam.total;
    correctDisp.textContent = String(correct);
    wrongDisp.textContent = String(answered - correct);
    accuracyDisp.textContent = answered ? Math.round((correct / answered) * 100) + '%' : '0%';
    errorCount.textContent = String(Object.keys(store.state.errorBook).length);
    fileStatus.textContent = String(store.state.questions.length);
  } else {
    const { questions, currentIndex, correctCount, wrongCount, answeredMap, errorBook, filterType } = store.state;
    const filtered = getFiltered(questions, filterType, store.state.errorBook);
    progressDisp.textContent = `${filtered.length ? currentIndex + 1 : 0}/${filtered.length}`;
    correctDisp.textContent = String(correctCount);
    wrongDisp.textContent = String(wrongCount);
    const total = correctCount + wrongCount;
    accuracyDisp.textContent = total ? Math.round((correctCount / total) * 100) + '%' : '0%';
    errorCount.textContent = String(Object.keys(errorBook).length);
    fileStatus.textContent = String(questions.length);
  }
}

function updateUI(): void {
  renderQuestion();
  updateStats();
}

// ─── Upload ───
function loadJSON(data: Question[], fileName?: string): void {
  if (!Array.isArray(data) || data.length === 0) {
    alert('题库格式无效：需要包含题目的 JSON 数组。');
    return;
  }

  store.update({
    questions: data,
    filterType: 'all',
    currentIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    answeredMap: {},
    errorBook: {},
  });
  store.setAnswered(false);
  // Exit exam mode on new file load
  if (store.exam.active) store.exitExam();

  if (fileName) {
    const name = fileName.replace(/\.json$/i, '');
    const files = store.recentFiles.filter(f => f.name !== name);
    files.unshift({ name, questions: data, count: data.length, time: Date.now() });
    if (files.length > 10) files.length = 10;
    store.setRecentFiles(files);
    renderRecentFiles();
  }

  setActiveFilterType('all');
  uploadArea.classList.add('collapsed');
  updateUI();
  store.save();
}

function setActiveFilterType(type: string): void {
  filterBar.querySelectorAll('.filter-chip').forEach(b =>
    b.classList.toggle('active', (b as HTMLElement).dataset.type === type)
  );
}

fileInput.addEventListener('change', e => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try { loadJSON(JSON.parse(ev.target?.result as string), file.name); }
    catch (err) { alert('JSON 解析失败: ' + (err as Error).message); }
  };
  reader.readAsText(file, 'UTF-8');
  fileInput.value = '';
});

// Click collapsed upload area to expand
uploadArea.addEventListener('click', () => {
  if (uploadArea.classList.contains('collapsed')) {
    uploadArea.classList.remove('collapsed');
  }
});

// Drag-and-drop
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try { loadJSON(JSON.parse(ev.target?.result as string), file.name); }
    catch (err) { alert('JSON 解析失败: ' + (err as Error).message); }
  };
  reader.readAsText(file, 'UTF-8');
});

// ─── Recent files ───
function renderRecentFiles(): void {
  const files = store.recentFiles;
  if (!files.length) { recentList.innerHTML = ''; return; }
  recentList.innerHTML = files.map((f, i) =>
    `<button class="recent-item" data-idx="${i}">${f.name} (${f.count}题)` +
    `<span class="del" data-idx="${i}" title="移除">✕</span></button>`
  ).join('');
}

recentList.addEventListener('click', e => {
  const del = (e.target as HTMLElement).closest('.del');
  const item = (e.target as HTMLElement).closest('.recent-item') as HTMLElement | null;
  if (!item) return;
  const idx = parseInt(item.dataset.idx ?? '');
  if (del) {
    const files = store.recentFiles;
    files.splice(idx, 1);
    store.setRecentFiles(files);
    renderRecentFiles();
    return;
  }
  const f = store.recentFiles[idx];
  if (f) loadJSON(f.questions);
});

// ─── Reset ───
resetBtn.addEventListener('click', () => {
  if (!store.state.questions.length) return;
  if (!confirm('重置后将清除所有答题进度，确定继续？')) return;
  if (store.exam.active) store.exitExam();
  store.update({ correctCount: 0, wrongCount: 0, answeredMap: {}, errorBook: {}, currentIndex: 0 });
  store.setAnswered(false);
  updateUI();
  store.save();
});

// ─── Filter chips ───
filterBar.addEventListener('click', e => {
  if (store.exam.active) return;
  const btn = (e.target as HTMLElement).closest('.filter-chip') as HTMLElement | null;
  if (!btn) return;
  const t = btn.dataset.type ?? '';
  if (t === store.state.filterType) return;
  store.update({ filterType: t as typeof store.state.filterType, currentIndex: 0 });
  setActiveFilterType(t);
  renderQuestion();
  store.save();
});

// ─── Tab switching ───
tabBar.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest('button') as HTMLElement | null;
  if (!btn) return;
  tabBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const tab = btn.dataset.tab;
  practiceView.classList.toggle('hidden', tab !== 'practice');
  errorView.classList.toggle('hidden', tab !== 'errorbook');
  if (tab === 'errorbook') {
    errorView.innerHTML = renderErrorBook(
      store.state.errorBook,
      store.state.questions,
    );
    const redoBtn = errorView.querySelector('#redoWrongBtn');
    if (redoBtn) {
      redoBtn.addEventListener('click', () => {
        store.update({ filterType: 'wrong', currentIndex: 0 });
        setActiveFilterType('wrong');
        const practiceTab = tabBar.querySelector('[data-tab="practice"]') as HTMLElement;
        practiceTab?.click();
        renderQuestion();
        store.save();
      });
    }
    bindErrorBookClicks(errorView, store.state.questions, (q) => {
      store.update({ filterType: 'all' });
      const idx = store.state.questions.findIndex(qq => qq.id === q.id);
      store.update({ currentIndex: idx >= 0 ? idx : 0 });
      setActiveFilterType('all');
      const practiceTab = tabBar.querySelector('[data-tab="practice"]') as HTMLElement;
      practiceTab?.click();
      renderQuestion();
      store.save();
    });
  }
});

// ─── Navigation ───
prevBtn.addEventListener('click', () => {
  if (store.exam.active) {
    if (store.exam.currentIndex > 0) {
      store.setExamIndex(store.exam.currentIndex - 1);
      renderQuestion();
    }
  } else if (store.state.currentIndex > 0) {
    store.update({ currentIndex: store.state.currentIndex - 1 });
    renderQuestion();
    store.save();
  }
});

nextBtn.addEventListener('click', () => {
  if (store.exam.active) {
    if (store.exam.currentIndex < store.exam.questions.length - 1) {
      store.setExamIndex(store.exam.currentIndex + 1);
      renderQuestion();
    }
  } else {
    const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook);
    if (store.state.currentIndex < filtered.length - 1) {
      store.update({ currentIndex: store.state.currentIndex + 1 });
      renderQuestion();
      store.save();
    }
  }
});

randomBtn.addEventListener('click', () => {
  if (store.exam.active) return;
  const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook);
  if (filtered.length < 2) return;
  let idx: number;
  do { idx = Math.floor(Math.random() * filtered.length); } while (idx === store.state.currentIndex);
  store.update({ currentIndex: idx });
  renderQuestion();
  store.save();
});

// ─── Show Answer ───
showAnsBtn.addEventListener('click', () => {
  const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook);
  if (!filtered.length) return;
  const q = filtered[store.state.currentIndex];
  if (store.answered) return;
  store.setAnswered(true);
  store.update({ wrongCount: store.state.wrongCount + 1 });
  store.state.answeredMap[q.id] = 'wrong';
  store.state.errorBook = { ...store.state.errorBook, [q.id]: true };
  optContainer.querySelectorAll('.option').forEach(el => el.classList.add('disabled'));
  dispatchShowAnswer(q);
  feedback.classList.add('show', 'wrong');
  feedbackRes.innerHTML = `💡 已显示答案（正确答案：${q.answer}）`;
  explanation.innerHTML = formatExplanation(q.explanation || autoExplanation(q));
  updateStats();
  store.save();
});

// ─── Exam button ───
examBtn.addEventListener('click', () => {
  const qs = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook);
  showExamSetup(qs);
});

// ─── Thumbnail toggle ───
thumbToggleBtn.addEventListener('click', () => {
  store.toggleThumbnails();
  thumbGrid.classList.toggle('hidden', !store.thumbOpen);
  thumbToggleBtn.classList.toggle('active', store.thumbOpen);
  if (store.thumbOpen) updateThumbnails();
});

// ─── Submit exam ───
submitExamBtn.addEventListener('click', () => {
  showExamResults();
});

// ─── AI Explain ───
aiExplainBtn.addEventListener('click', () => {
  const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook);
  if (!filtered.length) return;
  const q = filtered[store.state.currentIndex];
  fetchAIExplanation(q);
});

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', e => {
  const target = e.target as HTMLElement;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

  if (e.key === 'ArrowLeft' && !isInput) { prevBtn.click(); return; }
  if (e.key === 'ArrowRight' && !isInput) { nextBtn.click(); return; }
  if ((e.key === ' ' || e.key === 'Space') && !isInput) { e.preventDefault(); randomBtn.click(); return; }

  // Keyboard answering: only when question rendered and not yet answered
  if (store.answered || isInput) return;

  const key = e.key.toUpperCase();
  if (/^[A-E]$/.test(key)) {
    const opts = optContainer.querySelectorAll<HTMLElement>('.option');
    if (opts.length === 0 || !fillContainer.classList.contains('hidden')) return;
    const letters = optContainer.querySelectorAll('.letter');
    for (let i = 0; i < letters.length; i++) {
      if ((letters[i].textContent || '').trim().toUpperCase() === key) {
        opts[i].click();
        return;
      }
    }
  }

  if (e.key === 'Enter') {
    const submitBtn = optContainer.querySelector('button') || fillContainer.querySelector('button');
    if (submitBtn) { e.preventDefault(); (submitBtn as HTMLButtonElement).click(); }
  }
});

// ─── Init ───
function init(): void {
  initTheme(themeBtn);
  initSettings();
  renderRecentFiles();

  // Thumbnail grid click handler (bound once)
  setThumbnailJumpHandler((idx) => {
    if (store.exam.active) {
      store.setExamIndex(idx);
    } else {
      store.update({ currentIndex: idx });
      store.save();
    }
    renderQuestion();
  });
  thumbGrid.addEventListener('click', (e) => handleThumbnailClick(e.target as HTMLElement));

  // Exam state change listeners
  window.addEventListener('exam-started', () => {
    renderQuestion();
  });
  window.addEventListener('exam-exited', () => {
    const practiceTab = tabBar.querySelector('[data-tab="practice"]') as HTMLElement;
    practiceTab?.click();
    examBanner.classList.add('hidden');
    submitExamBtn.classList.add('hidden');
    randomBtn.classList.remove('hidden');
    showAnsBtn.classList.remove('hidden');
    renderQuestion();
    store.save();
  });

  const restored = store.restore();
  if (restored && store.state.questions.length) {
    setActiveFilterType(store.state.filterType);
    applyTheme();
    updateUI();
    errorCount.textContent = String(Object.keys(store.state.errorBook).length);
  } else {
    applyTheme();
    updateStats();
  }
}

init();
