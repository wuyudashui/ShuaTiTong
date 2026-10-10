const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const devUrl = process.env.SHUATITONG_EDITOR_TEST_URL || 'http://127.0.0.1:5173/';
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7e0AAAAASUVORK5CYII=';
const question = (extra = {}) => ({
  id: 1, type: 'single',
  question: [{ t: 'text', c: 'Line one\nLine two' }, { t: 'f', c: 'x^2', d: true }, { t: 'image', c: pixel, alt: 'diagram' }],
  options: { A: [{ t: 'text', c: 'Value ' }, { t: 'f', c: '\\frac{1}{2}', d: false }, { t: 'image', c: pixel, alt: 'option image' }], B: 'Other' },
  answer: 'A', difficulty: '中', explanation: '', ...extra,
});
let browser, context, page;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });
beforeEach(async () => {
  context = await browser.newContext(); page = await context.newPage();
  await page.goto(devUrl, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    // Vite can version dependencies after edits. Use the editor's exact state
    // import so this test exercises the same singleton as its save handler.
    const source = await (await fetch('/src/ui/editor.ts')).text();
    const statePath = source.match(/import\s*\{\s*store\s*\}\s*from\s*['"]([^'"]+)['"]/)[1];
    window.editorAudit = { editor: await import('/src/ui/editor.ts'), store: (await import(statePath)).store, saves: 0, alerts: [] };
    window.alert = message => window.editorAudit.alerts.push(String(message)); window.confirm = () => true;
  });
});
afterEach(async () => { await context.close(); });
async function open(q, mode = 'full', extra = []) {
  await page.evaluate(({ q, mode, extra }) => {
    const audit = window.editorAudit; audit.store.update({ questions: [q, ...extra], currentIndex: 0, filterType: 'all' });
    audit.original = structuredClone(q); audit.q = audit.store.state.questions[0];
    (mode === 'full' ? audit.editor.showFullEditModal : audit.editor.showEditModal)(audit.q, 0, () => { audit.saves++; });
  }, { q, mode, extra });
}
const snapshot = () => page.evaluate(() => ({ q: window.editorAudit.q, original: window.editorAudit.original, saves: window.editorAudit.saves, alerts: window.editorAudit.alerts, modal: !!document.querySelector('#fullEditModal, #editModal') }));

test('full editor no-op save preserves structured option formula and image blocks', async () => {
  await open(question()); await page.locator('#fullEditSaveBtn').click(); const result = await snapshot();
  assert.deepEqual(result.q, result.original); assert.equal(result.saves, 1); assert.equal(result.modal, false);
});

test('cancelled full editor changes do not mutate original title blocks', async () => {
  await open(question()); await page.locator('.full-edit-content').first().fill('Changed title'); await page.locator('.full-edit-displaymode').uncheck(); await page.locator('.full-edit-img-alt').fill('Changed image label');
  assert.deepEqual((await snapshot()).q, question(), 'draft inputs must not mutate the live question');
  await page.locator('#fullEditCancelBtn').click(); const result = await snapshot(); assert.deepEqual(result.q, result.original); assert.equal(result.saves, 0);
});

test('full editor updates one option while retaining untouched rich option content', async () => {
  await open(question()); await page.locator('.edit-opt[data-key="B"]').fill('Changed other'); await page.locator('#fullEditSaveBtn').click(); const result = await snapshot();
  assert.deepEqual(result.q.options.A, result.original.options.A); assert.deepEqual(result.q.options.B, [{ t: 'text', c: 'Changed other' }]); assert.equal(result.saves, 1);
});

test('full editor refuses answers referencing deleted or nonexistent options', async () => {
  await open(question()); await page.locator('#fullEditAnswer').fill('Z'); await page.locator('#fullEditSaveBtn').click(); let result = await snapshot();
  assert.equal(result.saves, 0); assert.equal(result.modal, true); assert.deepEqual(result.q, result.original); assert.match(result.alerts.join(' '), /答案/);
  await page.locator('#fullEditAnswer').fill('A'); await page.locator('.edit-opt-del[data-key="A"]').click(); await page.locator('#fullEditSaveBtn').click(); result = await snapshot(); assert.equal(result.saves, 0); assert.equal(result.modal, true);
});

test('full editor refuses duplicate IDs, unsupported types and repeated multi answers', async () => {
  for (const fixture of [question({ id: 0 }), question({ type: 'essay' }), question({ type: 'multi', answer: 'AA' })]) {
    await open(fixture); await page.locator('#fullEditSaveBtn').click(); const result = await snapshot(); assert.equal(result.saves, 0); assert.equal(result.modal, true); assert.deepEqual(result.q, result.original);
    await page.locator('#fullEditCancelBtn').click();
  }
  await open(question(), 'full', [question({ question: 'Different' })]); await page.locator('#fullEditSaveBtn').click(); const result = await snapshot(); assert.equal(result.saves, 0); assert.match(result.alerts.join(' '), /题号/);
});

test('simple editor no-op save preserves title and rich options', async () => {
  await open(question(), 'simple'); await page.locator('#editSaveBtn').click(); const result = await snapshot(); assert.deepEqual(result.q, result.original); assert.equal(result.saves, 1);
});

test('simple fill editor retains blank answers on save', async () => {
  await open(question({ type: 'fill', options: { 空1: [{ t: 'f', c: 'x^2' }], 空2: 'value' }, answer: '' }), 'simple'); await page.locator('#editSaveBtn').click(); const result = await snapshot(); assert.deepEqual(result.q.options, result.original.options); assert.equal(result.saves, 1);
});

test('simple editor image removal is an isolated draft and cancel discards it', async () => {
  await open(question(), 'simple'); await page.locator('.edit-block-image').click(); let result = await snapshot(); assert.deepEqual(result.q, result.original); assert.equal(Object.hasOwn(result.q, '__pendingBlocks'), false);
  await page.locator('#editCancelBtn').click(); result = await snapshot(); assert.deepEqual(result.q, result.original); assert.equal(result.saves, 0);
});

test('new option keys cannot be added twice to the current editor draft', async () => {
  await open(question());
  for (const value of ['first C', 'second C']) { await page.locator('#fullEditNewOptKey').fill('C'); await page.locator('#fullEditNewOptVal').fill(value); await page.locator('#fullEditAddOptBtn').click(); }
  assert.equal(await page.locator('.edit-opt[data-key="C"]').count(), 1); assert.match((await snapshot()).alerts.join(' '), /已存在/);
});

test('simple editor accumulates image drafts and saving preserves their order', async () => {
  await open(question(), 'simple');
  for (const name of ['one.png', 'two.png']) {
    await page.locator('#editImageInput').setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(pixel.split(',')[1], 'base64') });
    await page.waitForFunction(expected => document.querySelectorAll('#editBlockList .edit-block-image').length === expected, name === 'one.png' ? 2 : 3);
  }
  assert.deepEqual((await snapshot()).q, question());
  await page.locator('#editSaveBtn').click(); const result = await snapshot(); assert.equal(result.saves, 1); assert.deepEqual(result.q.question.filter(block => block.t === 'image').map(block => block.alt), ['diagram', 'one.png', 'two.png']); assert.equal(Object.hasOwn(result.q, '__pendingBlocks'), false);
});

test('simple editor changes a multiline title without splitting it around nontext blocks', async () => {
  await open(question(), 'simple'); await page.locator('.edit-question').fill('Changed first\nChanged second'); await page.locator('#editSaveBtn').click(); const result = await snapshot();
  assert.deepEqual(result.q.question, [{ t: 'text', c: 'Changed first\nChanged second' }, ...result.original.question.slice(1)]);
});

test('simple editor rejects invalid answer before changing question data', async () => {
  await open(question(), 'simple'); await page.locator('#editAnswer').fill('Z'); await page.locator('#editSaveBtn').click(); const result = await snapshot(); assert.equal(result.saves, 0); assert.equal(result.modal, true); assert.deepEqual(result.q, result.original);
});

async function openInsert() {
  await page.evaluate(q => { const audit = window.editorAudit; audit.store.update({ questions: [q], currentIndex: 0, filterType: 'all' }); audit.editor.showInsertModal(); }, question());
  await page.locator('#insQuestion').fill('New question');
  await page.locator('#insOptions .edit-opt[data-key="A"]').fill('Yes');
  await page.locator('#insOptions .edit-opt[data-key="B"]').fill('No');
}

test('inserting an invalid answer keeps the modal open and bank unchanged', async () => {
  await openInsert(); await page.locator('#insAnswer').fill('Z'); await page.locator('#insSaveBtn').click();
  const result = await page.evaluate(() => ({ count: window.editorAudit.store.state.questions.length, open: !!document.querySelector('#insertModal'), alerts: window.editorAudit.alerts }));
  assert.equal(result.count, 1); assert.equal(result.open, true); assert.match(result.alerts.join(' '), /答案/);
});

test('inserting at explicit position zero places the new question first', async () => {
  await openInsert(); await page.locator('#insAnswer').fill('b'); await page.locator('#insPosition').fill('0'); await page.locator('#insSaveBtn').click();
  const result = await page.evaluate(() => window.editorAudit.store.state.questions); assert.equal(result.length, 2); assert.equal(result[0].id, 2); assert.equal(result[0].answer, 'B'); assert.equal(result[1].id, 1);
});
