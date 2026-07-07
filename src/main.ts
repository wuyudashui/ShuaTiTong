import './styles.css';
import 'katex/dist/katex.min.css';
import type { Question } from './types';
import { TYPE_LABELS } from './types';
import { store } from './state';
import { getFiltered } from './filter';
import { formatExplanation, autoExplanation, renderText } from './format';
import { renderQuestion as dispatchRender, showAnswer as dispatchShowAnswer, getCurrentRenderer } from './renderers/index';
import type { RenderConfig } from './types';
import { fetchAIExplanation } from './ai';
import { applyTheme } from './ui/theme';
import { initTheme } from './ui/theme';
import { initSettings } from './ui/settings';
import { renderErrorBook, bindErrorBookClicks } from './ui/errorBook';
import { renderThumbnails, handleThumbnailClick, setThumbnailJumpHandler } from './ui/questionGrid';
import { showExamSetup, showExamResults, renderExamTypeTabs, onExamTypeTabClick, getCurrentSectionInfo } from './ui/examMode';
import { showEditModal, showFullEditModal, showInsertModal, exportQuestions } from './ui/editor';
import { showAdaptModal } from './ui/adapt';
import { parseFile, showParseConfirm } from './parsers/index';
import { showDevLogin, isAtLeast } from './ui/login';
import { CHECK, X, EYE, CLIPBOARD, BOOK_OPEN, REFRESH, EDIT, DOWNLOAD, CODE } from './icons';

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
const aiSimplifyBtn   = $('aiSimplifyBtn') as HTMLButtonElement;
const examBtn         = $('examBtn');
const thumbToggleBtn  = $('thumbToggleBtn');
const thumbGrid       = $('thumbGrid');
const thumbInfo       = $('thumbInfo');
const examBanner      = $('examBanner');
const examTypeTabs    = $('examTypeTabs');
const submitExamBtn   = $('submitExamBtn');
const redoBtn         = $('redoBtn');

function getCurrentQuestion(): Question | null {
  if (store.exam.active) {
    return store.exam.questions[store.exam.currentIndex] ?? null;
  }
  if (store.state.filterType === 'adapted') {
    return store.adapted.questions[store.state.currentIndex] ?? null;
  }
  const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
  return filtered[store.state.currentIndex] ?? null;
}

/** Return the appropriate explanation based on current AI mode */
function getExplanation(q: Question): string {
  return q.explanation || q.simpleExplanation || autoExplanation(q);
}

function performRedo(): void {
  const q = getCurrentQuestion();
  if (!q) return;

  if (store.exam.active) {
    delete store.exam.answers[q.id];
    delete store.exam.answerDisplay[q.id];
  } else {
    const prevResult = store.state.answeredMap[q.id];
    if (!prevResult) return;

    if (prevResult === 'correct') {
      store.update({ correctCount: Math.max(0, store.state.correctCount - 1) });
    } else {
      store.update({ wrongCount: Math.max(0, store.state.wrongCount - 1) });
    }

    delete store.state.answeredMap[q.id];
    if (store.state.errorBook[q.id]) {
      const eb = { ...store.state.errorBook };
      delete eb[q.id];
      store.state.errorBook = eb;
    }
    store.save();
  }

  redoBtn.classList.add('hidden');
  feedback.classList.remove('show', 'correct', 'wrong', 'ai-exp');
  store.setAnswered(false);
  updateStats();
  renderQuestion();
}

redoBtn.addEventListener('click', performRedo);

// ─── Render config (passed to renderers) ───
const renderConfig: RenderConfig = {
  optContainer,
  fillContainer,
  feedback,
  feedbackResult: feedbackRes,
  explanation,
  get examMode() { return store.exam.active; },
  onAnswered: (result) => {
    if (store.exam.active) {
      // ── Exam mode: store answer silently, no feedback ──
      const q = store.exam.questions[store.exam.currentIndex];
      if (!q) return;

      if (result.selected) {
        store.recordExamAnswer(q.id, result.selected, result.selectedDisplay);
      } else {
        delete store.exam.answers[q.id];
        delete store.exam.answerDisplay[q.id];
      }

      updateExamUI();
      updateStats();
      updateThumbnails();
    } else {
      // ── Practice mode: immediate feedback ──
      const q = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery)[store.state.currentIndex];
      if (!q) return;

      if (result.isCorrect) {
        store.update({ correctCount: store.state.correctCount + 1 });
        store.state.answeredMap[q.id] = 'correct';
        const eb = { ...store.state.errorBook };
        delete eb[q.id];
        store.state.errorBook = eb;
        feedback.classList.add('correct');
        feedbackRes.innerHTML = `<span class="svg-icon">${CHECK}</span> 回答正确！`;
      } else {
        store.update({ wrongCount: store.state.wrongCount + 1 });
        store.state.answeredMap[q.id] = 'wrong';
        store.state.errorBook = { ...store.state.errorBook, [q.id]: true };

        if (q.type === 'multi') {
          feedbackRes.innerHTML = `<span class="svg-icon">${X}</span> 回答错误（正确答案：${q.answer}）`;
        } else {
          feedbackRes.innerHTML = `<span class="svg-icon">${X}</span> 回答错误`;
        }
        feedback.classList.add('wrong');
      }

      store.setAnswered(true);
      feedback.classList.add('show');
      explanation.innerHTML = formatExplanation(getExplanation(q));
      redoBtn.classList.remove('hidden');
      updateStats();
      store.save();

      // Auto-advance on correct answer
      if (result.isCorrect && store.aiSettings.autoNext) {
        setTimeout(() => nextBtn.click(), 200);
      }
    }
  },
};

// ─── Render current question ───
let activeQuestionId = -1;

function renderQuestion(): void {
  feedback.classList.remove('show', 'correct', 'wrong', 'ai-exp');
  store.setAnswered(false);
  redoBtn.classList.add('hidden');

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

    // Render type tabs (listener bound once in init)
    examTypeTabs.classList.remove('hidden');
    renderExamTypeTabs(examTypeTabs);

    // Show section progress
    const secInfo = getCurrentSectionInfo();
    const overallText = `总 ${idx + 1}/${total}`;
    if (secInfo) {
      progressDisp.textContent = `${secInfo.label} ${secInfo.idx}/${secInfo.total} · ${overallText}`;
      qNumber.textContent = `[${secInfo.label}] 第 ${secInfo.idx} 题（共 ${secInfo.total} 题）· 模拟考 #${q.id}`;
    } else {
      progressDisp.textContent = `${idx + 1}/${total}`;
      qNumber.textContent = `第 ${idx + 1} 题 / 共 ${total} 题（模拟考 #${q.id}）`;
    }
    qTags.innerHTML = `
      <span class="q-tag">${TYPE_LABELS[q.type as keyof typeof TYPE_LABELS] || q.type}</span>
      <span class="q-tag">${q.difficulty || '中'}</span>
    `;
    qText.innerHTML = renderText(q.question);
    optContainer.innerHTML = '';
    fillContainer.innerHTML = '';
    fillContainer.classList.add('hidden');
    optContainer.classList.remove('hidden');

    dispatchRender(q, renderConfig);

    // Restore previously selected answer in exam mode (silent, no feedback)
    const prevAnswer = store.exam.answers[q.id];
    if (prevAnswer) {
      const renderer = getCurrentRenderer();
      if (renderer && 'restoreSelected' in renderer) {
        (renderer as any).restoreSelected(prevAnswer);
      }
    }

    // Show feedback when reviewing graded exam
    if (store.exam.graded) {
      const gd = store.exam.gradeDetails[q.id];
      if (gd) {
        store.setAnswered(true);
        dispatchShowAnswer(q);
        if (gd.isCorrect) {
          feedback.classList.add('show', 'correct');
          feedbackRes.innerHTML = `<span class="svg-icon">${CHECK}</span> 回答正确`;
        } else {
          feedback.classList.add('show', 'wrong');
          const displayAns = store.exam.answerDisplay[q.id] || gd.selected;
          feedbackRes.innerHTML = `<span class="svg-icon">${X}</span> 回答错误（你的答案：${displayAns}，正确答案：${gd.correct}）`;
        }
        explanation.innerHTML = formatExplanation(q.explanation || autoExplanation(q));
      }
    }

    updateThumbnails();
    updateStats();
    updateExamUI();
    return;
  }

  // ─── Exam review banner ───
  if (store.state.filterType === 'exam-review') {
    examBanner.classList.remove('hidden');
    const wrongTotal = store.state.examErrorFilter.length;
    examBanner.innerHTML = `
      <span class="exam-progress"><span class="svg-icon">${REFRESH}</span> 考试错题重练（共 ${wrongTotal} 题）</span>
      <button id="exitReviewBtn" class="btn-sm" style="background:rgba(255,255,255,.2);border-color:transparent;color:#fff"><span class="svg-icon">${X}</span>退出</button>
    `;
    examBanner.querySelector('#exitReviewBtn')?.addEventListener('click', () => {
      store.exitExamErrorReview();
      setActiveFilterType('all');
      renderExamHistory();
      renderQuestion();
      store.save();
    });
  } else {
    examBanner.classList.add('hidden');
    examBanner.innerHTML = '';
  }

  // ─── Adapted mode ───
  if (store.state.filterType === 'adapted') {
    const adaptedQs = store.adapted.questions;
    if (!adaptedQs.length) {
      qNumber.textContent = '第 0 题 / 共 0 题';
      qTags.innerHTML = '';
      qText.textContent = '无改编题。请先在开发者模式中使用「改编」功能生成。';
      optContainer.innerHTML = '';
      fillContainer.classList.add('hidden');
      optContainer.classList.remove('hidden');
      progressDisp.textContent = '0/0';
      updateThumbnails();
      return;
    }
let idx = store.state.currentIndex;
    if (idx < 0) idx = 0;
    if (idx >= adaptedQs.length) idx = adaptedQs.length - 1;
    if (idx !== store.state.currentIndex) store.update({ currentIndex: idx });

    const q = adaptedQs[idx];
    const total = adaptedQs.length;
    progressDisp.textContent = `${idx + 1}/${total}`;
    qNumber.textContent = `第 ${idx + 1} 题 / 共 ${total} 题（改编题${q.id ? ' #'+q.id : ''}）`;

    qTags.innerHTML = `
      <span class="q-tag">${TYPE_LABELS[q.type as keyof typeof TYPE_LABELS] || q.type}</span>
      <span class="q-tag">${q.difficulty || '中'}</span>
    `;

    qText.innerHTML = renderText(q.question);
    optContainer.innerHTML = '';
    fillContainer.innerHTML = '';
    fillContainer.classList.add('hidden');
    optContainer.classList.remove('hidden');

    dispatchRender(q, renderConfig);
    updateThumbnails();
    updateStats();
    return;
  }

  // ─── Normal mode ───
  const { questions, currentIndex, answeredMap, filterType } = store.state;
  const filtered = getFiltered(questions, filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);

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
  qNumber.textContent = `第 ${idx + 1} 题 / 共 ${total} 题（#${q.id}）`;

  qTags.innerHTML = `
    <span class="q-tag">${TYPE_LABELS[q.type as keyof typeof TYPE_LABELS] || q.type}</span>
    <span class="q-tag">${q.difficulty || '中'}</span>
  `;
  if (store.aiSettings.devMode) {
    qTags.innerHTML += `<button class="edit-q-btn" data-id="${q.id}" title="编辑题目"><span class="svg-icon">${EDIT}</span></button>`;
    qTags.innerHTML += `<button class="insert-q-btn" data-id="${q.id}" title="在此题后插入新题"><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span></button>`;
  }

  qText.innerHTML = renderText(q.question);
  // Bind edit button
  if (store.aiSettings.devMode) {
    const editBtn = qTags.querySelector('.edit-q-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const q = getCurrentQuestion();
        const tier = store.aiSettings.userTier || 'guest';
        if (q && tier === 'root') {
          showFullEditModal(q, -1, () => renderQuestion());
        } else if (q) {
          showEditModal(q, -1, () => renderQuestion());
        }
      });
    }
    // Bind insert button
    const insertBtn = qTags.querySelector('.insert-q-btn');
    if (insertBtn) {
      insertBtn.addEventListener('click', () => showInsertModal());
    }
  }
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
    redoBtn.classList.remove('hidden');
    if (prevResult === 'correct') {
      feedback.classList.add('show', 'correct');
      feedbackRes.innerHTML = `<span class="svg-icon">${CHECK}</span> 回答正确！`;
    } else {
      feedback.classList.add('show', 'wrong');
      feedbackRes.innerHTML = `<span class="svg-icon">${X}</span> 回答错误`;
    }
    explanation.innerHTML = formatExplanation(getExplanation(q));
  }

  // ─── Memorize mode: show answer immediately ───
  if (store.state.memorizeMode && !prevResult) {
    store.setAnswered(true);
    dispatchShowAnswer(q);
    feedback.classList.add('show', 'correct');
    feedbackRes.innerHTML = `<span class="svg-icon">${CHECK}</span> 正确答案：${q.answer}`;
    explanation.innerHTML = formatExplanation(getExplanation(q));
  }

  updateThumbnails();
  updateStats();
}

// ─── Exam UI ───
function updateExamUI(): void {
  if (!store.exam.active) {
    examBanner.classList.add('hidden');
    examTypeTabs.classList.add('hidden');
    submitExamBtn.classList.add('hidden');
    randomBtn.classList.remove('hidden');
    showAnsBtn.classList.remove('hidden');
    aiExplainBtn.classList.remove('hidden');
    aiSimplifyBtn.classList.remove('hidden');
    tabBar.classList.remove('hidden');
    filterBar.classList.remove('hidden');
    return;
  }

  // Clean dedicated exam view: hide practice-mode UI
  tabBar.classList.add('hidden');
  filterBar.classList.add('hidden');
  aiExplainBtn.classList.add('hidden');
  aiSimplifyBtn.classList.add('hidden');

  examBanner.classList.remove('hidden');
  const answered = store.examAnsweredCount;
  const total = store.exam.total;

  if (store.exam.graded) {
    const correct = Object.values(store.exam.gradeDetails).filter(d => d.isCorrect).length;
    examBanner.innerHTML = `
      <span class="exam-progress"><span class="svg-icon">${BOOK_OPEN}</span> 答题回顾：${correct}/${total} 正确</span>
      <button id="exitExamBtn" class="btn-sm" style="background:rgba(255,255,255,.2);border-color:transparent;color:#fff"><span class="svg-icon">${X}</span>退出</button>
    `;
    submitExamBtn.classList.add('hidden');
  } else {
    examBanner.innerHTML = `
      <span class="exam-progress"><span class="svg-icon">${CLIPBOARD}</span> 模拟考：${answered}/${total} 已答</span>
      <button id="exitExamBtn" class="btn-sm" style="background:rgba(255,255,255,.2);border-color:transparent;color:#fff"><span class="svg-icon">${X}</span>退出</button>
    `;
    submitExamBtn.classList.remove('hidden');
  }

  examBanner.querySelector('#exitExamBtn')?.addEventListener('click', () => {
    if (confirm('确定退出模拟考试？进度将丢失。')) {
      store.exitExam();
      window.dispatchEvent(new CustomEvent('exam-exited'));
    }
  });

  randomBtn.classList.add('hidden');
  showAnsBtn.classList.add('hidden');
}

// ─── Thumbnails ───
function updateThumbnails(): void {
  if (!store.thumbOpen) return;
  const qs = store.exam.active
    ? store.exam.questions
    : store.state.filterType === 'adapted'
      ? store.adapted.questions
      : getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
  const currentQ = store.exam.active
    ? store.exam.questions[store.exam.currentIndex]
    : (qs.length ? qs[store.state.currentIndex] : null);
  const answerMap = store.exam.active
    ? (store.exam.graded
        ? Object.fromEntries(Object.entries(store.exam.gradeDetails).map(([id, d]) => [id, d.isCorrect ? 'correct' : 'wrong']))
        : store.exam.answers)
    : store.state.answeredMap;
  thumbGrid.innerHTML = renderThumbnails(qs, answerMap, currentQ?.id ?? -1);
  thumbInfo.textContent = `共 ${qs.length} 题`;
}

// ─── Stats ───
function clearAdapt(): void {
  store.clearAdapt();
  if (store.state.filterType === 'adapted') {
    store.update({ filterType: 'all', currentIndex: 0 });
    setActiveFilterType('all');
    renderQuestion();
  }
}

function updateStats(): void {
  if (store.exam.active) {
    const answered = store.examAnsweredCount;
    const total = store.exam.total;
    if (store.exam.graded) {
      const correct = Object.values(store.exam.gradeDetails).filter(d => d.isCorrect).length;
      const wrong = total - correct;
      correctDisp.textContent = String(correct);
      wrongDisp.textContent = String(wrong);
      accuracyDisp.textContent = total ? Math.round((correct / total) * 100) + '%' : '0%';
    } else {
      correctDisp.textContent = '-';
      wrongDisp.textContent = '-';
      accuracyDisp.textContent = answered ? `${answered}/${total}` : '0/0';
    }
    errorCount.textContent = String(Object.keys(store.state.errorBook).length);
    fileStatus.textContent = String(store.state.questions.length);
  } else if (store.state.filterType === 'adapted') {
    const adaptedQs = store.adapted.questions;
    const idx = store.state.currentIndex;
    progressDisp.textContent = `${adaptedQs.length ? idx + 1 : 0}/${adaptedQs.length}`;
    correctDisp.textContent = String(store.state.correctCount);
    wrongDisp.textContent = String(store.state.wrongCount);
    const total = store.state.correctCount + store.state.wrongCount;
    accuracyDisp.textContent = total ? Math.round((store.state.correctCount / total) * 100) + '%' : '0%';
    errorCount.textContent = String(Object.keys(store.state.errorBook).length);
    fileStatus.textContent = String(store.state.questions.length);
  } else {
    const { questions, currentIndex, correctCount, wrongCount, answeredMap, errorBook, filterType } = store.state;
    const filtered = getFiltered(questions, filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
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
    examErrorFilter: [],
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

async function handleFileUpload(file: File): Promise<void> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  try {
    const buffer = await file.arrayBuffer();
    if (ext === 'xlsx' || ext === 'xls') {
      document.getElementById('uploadArea')?.classList.add('dragover');
      const qs = await parseFile(buffer, file.name);
      if (qs && qs.length > 0) loadJSON(qs, file.name.replace(/\.[^.]+$/, ''));
      return;
    }
    if (ext === 'docx') {
      const action = await showParseConfirm(file);
      if (action !== 'parse') return;
      document.getElementById('uploadArea')?.classList.add('dragover');
      const qs = await parseFile(buffer, file.name);
      if (qs && qs.length > 0) loadJSON(qs, file.name.replace(/\.[^.]+$/, ''));
      return;
    }
  } catch (err) {
    alert('解析失败: ' + (err as Error).message);
  } finally {
    document.getElementById('uploadArea')?.classList.remove('dragover');
  }
}

fileInput.addEventListener('change', async e => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'json') {
    const reader = new FileReader();
    reader.onload = ev => {
      try { loadJSON(JSON.parse(ev.target?.result as string), file.name); }
      catch (err) { alert('JSON 解析失败: ' + (err as Error).message); }
    };
    reader.readAsText(file, 'UTF-8');
  } else {
    handleFileUpload(file);
  }
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
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'json') {
    const reader = new FileReader();
    reader.onload = ev => {
      try { loadJSON(JSON.parse(ev.target?.result as string), file.name); }
      catch (err) { alert('JSON 解析失败: ' + (err as Error).message); }
    };
    reader.readAsText(file, 'UTF-8');
  } else {
    handleFileUpload(file);
  }
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
  if (store.state.filterType === 'exam-review') store.exitExamErrorReview();
  store.update({ correctCount: 0, wrongCount: 0, answeredMap: {}, errorBook: {}, currentIndex: 0 });
  store.setAnswered(false);
  updateUI();
  store.save();
});

// ─── Filter chips ───
function handleFilterClick(t: string): void {
  if (store.exam.active) return;
  if (t === store.state.filterType) return;
  if (store.state.filterType === 'exam-review') store.exitExamErrorReview();
  store.update({ filterType: t as typeof store.state.filterType, currentIndex: 0 });
  setActiveFilterType(t);
  renderQuestion();
  store.save();
}

filterBar.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest('.filter-chip') as HTMLElement | null;
  if (!btn) return;
  handleFilterClick(btn.dataset.type ?? '');
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
    const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
    if (store.state.currentIndex < filtered.length - 1) {
      store.update({ currentIndex: store.state.currentIndex + 1 });
      renderQuestion();
      store.save();
    }
  }
});

randomBtn.addEventListener('click', () => {
  if (store.exam.active) return;
  const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
  if (filtered.length < 2) return;
  let idx: number;
  do { idx = Math.floor(Math.random() * filtered.length); } while (idx === store.state.currentIndex);
  store.update({ currentIndex: idx });
  renderQuestion();
  store.save();
});

// ─── Show Answer ───
showAnsBtn.addEventListener('click', () => {
  if (store.state.memorizeMode) return; // 背题模式下答案已显示
  const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
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
  feedbackRes.innerHTML = `<span class="svg-icon">${EYE}</span> 已显示答案（正确答案：${q.answer}）`;
  explanation.innerHTML = formatExplanation(getExplanation(q));
  updateStats();
  store.save();
  redoBtn.classList.remove('hidden');
});

// ─── Exam button ───
examBtn.addEventListener('click', () => {
  const qs = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
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
function getCurrentForAI(): Question | null {
  if (store.exam.active) return null;
  if (store.state.filterType === 'adapted') return store.adapted.questions[store.state.currentIndex] ?? null;
  const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
  return filtered[store.state.currentIndex] ?? null;
}

aiExplainBtn.addEventListener('click', () => {
  const q = getCurrentForAI();
  if (q) fetchAIExplanation(q);
});

aiSimplifyBtn.addEventListener('click', () => {
  const q = getCurrentForAI();
  if (q) fetchAIExplanation(q, true);
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

// ─── Search input ───
const searchInput = document.getElementById('searchInput') as HTMLInputElement;
if (searchInput) {
  let searchTimer: ReturnType<typeof setTimeout>;
  const doSearch = () => {
    store.update({ searchQuery: searchInput.value.trim(), currentIndex: 0 });
    renderQuestion();
    updateStats();
    store.save();
  };
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 150);
  });
  searchInput.addEventListener('search', doSearch);
  // Restore saved search query and trigger initial search if needed
  if (store.state.searchQuery) {
    searchInput.value = store.state.searchQuery;
  }
}

// ─── Long-press question number to swap (dev mode only) ───
(() => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const startSwap = () => {
    if (!store.aiSettings.devMode) return;
    const filtered = getFiltered(store.state.questions, store.state.filterType, store.state.errorBook, store.state.examErrorFilter, store.state.searchQuery);
    if (store.exam.active || !filtered.length) return;
    timer = setTimeout(() => {
      const fromIdx = store.state.currentIndex;
      const fromQ = filtered[fromIdx];
      if (!fromQ) return;
      const target = prompt(`交换题号：将"第 ${fromIdx + 1} 题"与第几题交换？（1 ~ ${filtered.length}）`);
      if (!target) return;
      const toIdx = parseInt(target) - 1;
      if (isNaN(toIdx) || toIdx < 0 || toIdx >= filtered.length || toIdx === fromIdx) return;
      const allQs = store.state.questions;
      if (fromIdx >= filtered.length) return;
      const toQ = filtered[toIdx];
      const fromActual = allQs.indexOf(fromQ);
      const toActual = allQs.indexOf(toQ);
      if (fromActual === -1 || toActual === -1) return;
      [allQs[fromActual], allQs[toActual]] = [allQs[toActual], allQs[fromActual]];
      store.update({ currentIndex: toIdx });
      store.save();
      renderQuestion();
    }, 600);
  };
  qNumber.addEventListener('mousedown', startSwap);
  qNumber.addEventListener('mouseup', clear);
  qNumber.addEventListener('mouseleave', clear);
  qNumber.addEventListener('touchstart', startSwap, { passive: true });
  qNumber.addEventListener('touchend', clear);
  qNumber.addEventListener('touchcancel', clear);
})();

// ─── Exam History ───
function renderExamHistory(): void {
  const container = document.getElementById('examHistoryList');
  const details = document.getElementById('examHistory') as HTMLElement;
  if (!container || !details) return;

  const records = store.examRecords;
  if (!records.length) {
    details.classList.add('hidden');
    return;
  }
  details.classList.remove('hidden');

  container.innerHTML = records.map(r => {
    const date = new Date(r.date);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    return `<div class="exam-history-item">
      <div class="exam-history-info">
        <span class="exam-history-date">${dateStr}</span>
        <span class="exam-history-score">${r.correct}/${r.total} (${r.total ? Math.round(r.correct / r.total * 100) : 0}%)</span>
        <span class="exam-history-wrong">错${r.wrong}题</span>
      </div>
      <div class="exam-history-actions">
        ${r.wrong > 0 ? `<button class="exam-history-redo btn-sm btn-outline" data-id="${r.id}"><span class="svg-icon">${REFRESH}</span>错题重练</button>` : ''}
        <button class="exam-history-del btn-sm" data-id="${r.id}"><span class="svg-icon">${X}</span></button>
      </div>
    </div>`;
  }).join('');

  // Bind events
  container.querySelectorAll('.exam-history-redo').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id!;
      const record = store.examRecords.find(r => r.id === id);
      if (!record || !record.wrongIds.length) return;
      store.startExamErrorReview(record.wrongIds);
      renderExamHistory();
      renderQuestion();
      setActiveFilterType('exam-review');
    });
  });
  container.querySelectorAll('.exam-history-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id!;
      store.deleteExamRecord(id);
      renderExamHistory();
    });
  });
}

// ─── Global error handler for mobile debugging ───
window.addEventListener('unhandledrejection', (e) => {
  document.body.innerHTML = `<div style="padding:20px;color:red;font-size:14px">
    <h2>JS Error</h2>
    <pre>${e.reason?.stack || e.reason}</pre>
  </div>`;
});
window.addEventListener('error', (e) => {
  document.body.innerHTML = `<div style="padding:20px;color:red;font-size:14px">
    <h2>JS Error</h2>
    <pre>${e.error?.stack || e.message || e}</pre>
  </div>`;
});

// ─── Init ───
function init(): void {
  try {
    initTheme(themeBtn);
  initSettings();
  renderRecentFiles();

  // ─── Dev mode toggle ───
  const devModeBtn = document.createElement('button');
  devModeBtn.className = 'btn-sm btn-outline';
  devModeBtn.id = 'devModeBtn';
  devModeBtn.title = '开发者模式';
  devModeBtn.innerHTML = `<span class="svg-icon">${CODE}</span>开发`;

  const memorizeBtn = document.createElement('button');
  memorizeBtn.className = 'btn-sm btn-outline';
  memorizeBtn.id = 'memorizeBtn';
  memorizeBtn.title = '背题模式 — 直接显示答案';
  memorizeBtn.innerHTML = `<span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg></span>背题`;
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-sm btn-outline';
  exportBtn.id = 'exportBtn';
  exportBtn.title = '导出题库 JSON';
  exportBtn.innerHTML = `<span class="svg-icon">${DOWNLOAD}</span>导出`;
  exportBtn.style.display = 'none';

  const adaptBtn = document.createElement('button');
  adaptBtn.className = 'btn-sm';
  adaptBtn.id = 'adaptBtn';
  adaptBtn.title = 'AI 改编题型';
  adaptBtn.style.cssText = 'background:#6366f1;color:#fff;border-color:transparent;display:none';
  adaptBtn.innerHTML = `<span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.34-.64 2.61-1.74 3.39A4 4 0 0 1 16 13a4 4 0 0 1-2 3.46"/><path d="M12 2a4 4 0 0 0-4 4c0 1.34.64 2.61 1.74 3.39A4 4 0 0 0 8 13a4 4 0 0 0 2 3.46"/><path d="M12 22v-6"/><path d="M8 17c-2 0-4-1-4-4 0-1.5 1-2.5 2-3"/><path d="M16 17c2 0 4-1 4-4 0-1.5-1-2.5-2-3"/></svg></span>改编</button>`;

  const aiDebugBtn = document.createElement('button');
  aiDebugBtn.className = 'btn-sm btn-outline';
  aiDebugBtn.id = 'aiDebugBtn';
  aiDebugBtn.title = 'AI 调试';
  aiDebugBtn.innerHTML = '<span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>AI</span>';
  aiDebugBtn.style.display = 'none';
  aiDebugBtn.addEventListener('click', () => import('./ui/aidebug').then(m => m.showAIDebug()));

  const syncBtn = document.createElement('button');
  syncBtn.className = 'btn-sm btn-outline';
  syncBtn.id = 'syncBtn';
  syncBtn.title = '数据同步';
  syncBtn.innerHTML = '<span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>同步';
  syncBtn.style.display = 'none';
  syncBtn.addEventListener('click', () => import('./ui/sync').then(m => m.showSyncModal()));
  const headerActions = document.querySelector('.header-actions');
  if (headerActions) {
    headerActions.appendChild(memorizeBtn);
    headerActions.appendChild(devModeBtn);
    headerActions.appendChild(adaptBtn);
    headerActions.appendChild(aiDebugBtn);
    headerActions.appendChild(syncBtn);
    headerActions.appendChild(exportBtn);
  }

  adaptBtn.addEventListener('click', showAdaptModal);

  function updateDevModeUI(): void {
    const tier = store.aiSettings.userTier || 'guest';
    const isOn = !!store.aiSettings.devMode;
    const isRoot = tier === 'root';
    devModeBtn.classList.toggle('active', isOn);
    adaptBtn.style.display = isOn ? '' : 'none';
    aiDebugBtn.style.display = isOn ? '' : 'none';
    exportBtn.style.display = isOn ? '' : 'none';
    // Sync only for root
    const sb = document.getElementById('syncBtn'); if (sb) sb.style.display = (isRoot && isOn) ? '' : 'none';
    // Add/remove adapted filter chip
    const existing = filterBar.querySelector('.filter-chip[data-type="adapted"]');
    if (isOn && !existing) {
      const chip = document.createElement('button');
      chip.className = 'filter-chip';
      chip.dataset.type = 'adapted';
      chip.innerHTML = `<span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>改编`;
      filterBar.appendChild(chip);
      chip.addEventListener('click', () => handleFilterClick(chip.dataset.type!));
    } else if (!isOn && existing) {
      existing.remove();
      if (store.state.filterType === 'adapted') {
        store.update({ filterType: 'all', currentIndex: 0 });
      }
    }
    renderQuestion();
  }
  function showDevLoginModal(): void {
    if (store.aiSettings.devMode) {
      store.updateAISettings({ devMode: false });
      updateDevModeUI();
    } else {
      showDevLogin(() => updateDevModeUI());
    }
  }

  memorizeBtn.addEventListener('click', () => {
    const newVal = !store.state.memorizeMode;
    store.update({ memorizeMode: newVal, currentIndex: 0 });
    memorizeBtn.classList.toggle('active', newVal);
    renderQuestion();
    store.save();
  });

  devModeBtn.addEventListener('click', showDevLoginModal);
  exportBtn.addEventListener('click', exportQuestions);

  // Apply initial dev mode state
  updateDevModeUI();

  // Restore memorize button state
  if (store.state.memorizeMode) memorizeBtn.classList.add('active');

  // Click explanation to expand/collapse long content
  explanation.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const content = target.closest('.exp-content');
    if (content) content.classList.toggle('expanded');
  });

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

  // Exam type tabs: single delegation, never rebound
  examTypeTabs.addEventListener('click', (e) => {
    onExamTypeTabClick(e);
    renderQuestion();
  });

  // Exam state change listeners
  window.addEventListener('exam-started', () => {
    renderQuestion();
  });
  window.addEventListener('adapt-done', () => {
    setActiveFilterType('adapted');
    store.update({ filterType: 'adapted', currentIndex: 0 });
    renderQuestion();
    store.save();
  });
  window.addEventListener('exam-exited', () => {
    const practiceTab = tabBar.querySelector('[data-tab="practice"]') as HTMLElement;
    practiceTab?.click();
    examBanner.classList.add('hidden');
    examTypeTabs.classList.add('hidden');
    submitExamBtn.classList.add('hidden');
    randomBtn.classList.remove('hidden');
    showAnsBtn.classList.remove('hidden');
    aiExplainBtn.classList.remove('hidden');
    aiSimplifyBtn.classList.remove('hidden');
    tabBar.classList.remove('hidden');
    filterBar.classList.remove('hidden');
    renderExamHistory();
    renderQuestion();
    store.save();
  });

  window.addEventListener('question-inserted', () => {
    renderQuestion();
    updateStats();
  });

  const restored = store.restore();
  renderExamHistory();
  if (restored && store.state.questions.length) {
    setActiveFilterType(store.state.filterType);
    applyTheme();
    updateUI();
    errorCount.textContent = String(Object.keys(store.state.errorBook).length);
  } else {
    applyTheme();
    updateStats();
  }
  } catch (e) {
      document.body.innerHTML = `<div style="padding:20px;color:red;font-size:14px;font-family:monospace">
        <h2>Init Error</h2>
        <pre>${(e as Error).stack || (e as Error).message || e}</pre>
      </div>`;
    }
  }

  init();
