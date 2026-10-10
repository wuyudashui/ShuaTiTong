require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { initData, loginRoot, registerPremium, loginPremium, verifyToken, requireRoot, safeUsername } = require('./auth');
const { createGithubClient, githubConfig, GithubError } = require('./github');

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const USERS_DIR = path.join(__dirname, 'data', 'users');
const ALLOWED_ORIGINS = /^(?:https?:\/\/localhost|https?:\/\/127\.0\.0\.1):\d+$/;
const PAGE_ORIGIN = 'https://wuyudashui.github.io';

function isAllowedOrigin(origin) { return !origin || origin === PAGE_ORIGIN || ALLOWED_ORIGINS.test(origin); }
function safeFilename(filename) { return typeof filename === 'string' && filename.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/.test(filename) && filename.toLowerCase() !== 'catalog.json'; }
function isImageSource(source) {
  return /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(source)
    || (!/^[a-z][a-z\d+.-]*:/i.test(source) && !source.startsWith('//') && !/[<>"\x00-\x1f]/.test(source));
}
function isContent(value) {
  if (typeof value === 'string') return true;
  return Array.isArray(value) && value.length > 0 && value.every(block => block && typeof block === 'object' && ['text', 'f', 'code', 'image'].includes(block.t) && typeof block.c === 'string' && (block.t !== 'image' || isImageSource(block.c)) && (block.d === undefined || typeof block.d === 'boolean') && (block.alt === undefined || typeof block.alt === 'string'));
}
function contentIsNonempty(value) {
  return typeof value === 'string' ? Boolean(value.trim()) : value.some(block => block.c.trim());
}
function validateQuestions(input) {
  if (!Array.isArray(input) || input.length < 1) throw new Error('题库需要包含至少一道题目');
  const ids = new Set();
  return input.map((question, index) => {
    const fail = message => { throw new Error(`第 ${index + 1} 题：${message}`); };
    if (!question || typeof question !== 'object' || Array.isArray(question)) fail('题目格式无效');
    if (!Number.isSafeInteger(question.id) || question.id < 1 || ids.has(question.id)) fail('题号必须是唯一的正整数');
    ids.add(question.id);
    if (!['single', 'multi', 'judge', 'fill'].includes(question.type)) fail('题型无效');
    if (!isContent(question.question) || !contentIsNonempty(question.question)) fail('题干格式无效');
    if (!question.options || typeof question.options !== 'object' || Array.isArray(question.options)) fail('选项格式无效');
    const optionEntries = Object.entries(question.options);
    if (!optionEntries.length) fail('题目缺少选项');
    if (optionEntries.some(([key, value]) => !key || !isContent(value) || !contentIsNonempty(value))) fail('选项格式无效');
    if (typeof question.answer !== 'string') fail('答案必须是字符串');
    let options = Object.fromEntries(optionEntries);
    let answer = question.answer;
    if (question.type === 'fill') {
      // Legacy fill files use A/B/C keys to hold each blank's standard answer.
      // Normalize those keys to the canonical 空1/空2 form before publication.
      options = Object.fromEntries(optionEntries.map(([, value], position) => [`空${position + 1}`, value]));
    } else {
      if (optionEntries.some(([key]) => !/^[A-Z]$/.test(key))) fail('选项名称必须是单个大写字母');
      answer = question.answer.trim().toUpperCase();
      const keys = [...answer];
      if (!keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(options, key))) fail('答案没有对应的选项');
      if (question.type !== 'multi' && keys.length !== 1) fail('答案只能选择一个选项');
      if (question.type === 'multi' && new Set(keys).size !== keys.length) fail('多选答案不能重复');
    }
    const result = { ...question, options, answer };
    if (!['易', '中', '难'].includes(result.difficulty)) result.difficulty = '中';
    if (typeof result.explanation !== 'string') result.explanation = '';
    if (result.simpleExplanation !== undefined && typeof result.simpleExplanation !== 'string') delete result.simpleExplanation;
    return result;
  });
}
function userFile(req) { return path.join(USERS_DIR, req.user.username, 'questions.json'); }
function jsonResponse(res, status, body) { return res.status(status).json(body); }

function validateBankMetadata(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('题库资料格式无效');
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  if (!partial || has('name')) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) throw new Error('题库名称需为 1 至 200 个字符');
  }
  if (!partial || has('subject')) {
    if (typeof body.subject !== 'string' || !body.subject.trim() || body.subject.length > 100) throw new Error('科目需为 1 至 100 个字符');
  }
  if (has('description') && (typeof body.description !== 'string' || body.description.length > 2000)) throw new Error('题库简介不能超过 2000 个字符');
  return Object.fromEntries(['name', 'subject', 'description'].filter(has).map(key => [key, body[key].trim()]));
}

function validateManagementBody(body, allowedKeys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowedKeys.includes(key))) throw new Error('请求资料格式无效');
  validateVersion(body.version);
}

function validateVersion(version) {
  if (version !== undefined && (typeof version !== 'string' || !version || version.length > 128)) throw new Error('题库版本格式无效');
}

function managementError(res, error) {
  if (error instanceof GithubError) {
    if (error.status === 404) return jsonResponse(res, 404, { error: '题库不存在' });
    if (error.code === 'target_exists') return jsonResponse(res, 409, { error: '目标文件名已存在，请换一个文件名' });
    if (error.status === 409) return jsonResponse(res, 409, { error: '题库版本已更新，请重新加载后重试' });
    return jsonResponse(res, 502, { error: '题库操作失败，请稍后重试' });
  }
  return jsonResponse(res, 400, { error: error.message || '请求格式无效' });
}

function createApp(options = {}) {
  const app = express();
  const github = options.github || createGithubClient({ env: options.env || process.env, fetch: options.fetch });
  app.disable('x-powered-by');
  app.use(cors({ origin(origin, callback) { callback(null, isAllowedOrigin(origin) ? origin || false : false); }, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(express.json({ limit: MAX_BODY_BYTES }));
  initData();

  app.post('/api/auth/root/login', (req, res) => {
    const result = loginRoot(req.body?.username, req.body?.password);
    return result.error ? jsonResponse(res, 401, result) : res.json(result);
  });
  app.post('/api/auth/premium/register', (req, res) => {
    const result = registerPremium(req.body?.username, req.body?.password);
    return result.error ? jsonResponse(res, 400, result) : res.json(result);
  });
  app.post('/api/auth/premium/login', (req, res) => {
    const result = loginPremium(req.body?.username, req.body?.password);
    return result.error ? jsonResponse(res, 401, result) : res.json(result);
  });

  app.get('/api/questions', verifyToken, (req, res) => {
    if (!safeUsername(req.user.username)) return jsonResponse(res, 401, { error: '用户名格式无效' });
    const file = userFile(req); if (!fs.existsSync(file)) return res.json([]);
    try { return res.json(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return jsonResponse(res, 500, { error: '题目数据读取失败' }); }
  });
  app.put('/api/questions', verifyToken, (req, res) => {
    if (!safeUsername(req.user.username)) return jsonResponse(res, 401, { error: '用户名格式无效' });
    if (!Array.isArray(req.body)) return jsonResponse(res, 400, { error: '格式无效' });
    const dir = path.join(USERS_DIR, req.user.username); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'questions.json'); const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try { fs.writeFileSync(temp, JSON.stringify(req.body, null, 2)); fs.renameSync(temp, file); return res.json({ count: req.body.length }); } catch { try { fs.rmSync(temp, { force: true }); } catch {} return jsonResponse(res, 500, { error: '题目数据保存失败' }); }
  });

  app.get('/api/status', (req, res) => res.json({ online: true, version: '1.0' }));
  app.get('/api/publisher/status', requireRoot, (req, res) => {
    const cfg = github.config || githubConfig(options.env || process.env);
    return res.json({ configured: Boolean(cfg.token), owner: cfg.owner, repo: cfg.repo, branch: cfg.branch });
  });
  app.get('/api/question-banks', requireRoot, async (req, res) => {
    if (!github.config?.token) return jsonResponse(res, 503, { error: 'GitHub 发布未配置' });
    try { return res.json(await github.getCatalog()); } catch (error) { return jsonResponse(res, 502, { error: '题库目录读取失败' }); }
  });
  app.post('/api/question-banks', requireRoot, async (req, res) => {
    if (!github.config?.token) return jsonResponse(res, 503, { error: 'GitHub 发布未配置' });
    const body = req.body || {};
    try {
      if (!safeFilename(body.filename)) throw new Error('文件名只能使用字母、数字、下划线和连字符，且必须以 .json 结尾');
      validateBankMetadata(body);
      validateVersion(body.version);
      if (body.overwrite !== undefined && typeof body.overwrite !== 'boolean') throw new Error('覆盖标记格式无效');
      const questions = validateQuestions(body.questions);
      const size = Buffer.byteLength(JSON.stringify(questions), 'utf8'); if (size > MAX_BODY_BYTES) throw new Error('题库文件不能超过 8 MiB');
      const snapshot = await github.preparePublication(body.filename);
      if (body.version !== undefined && body.version !== snapshot.parentSha) throw new GithubError(409);
      const catalog = snapshot.catalog;
      const existing = catalog.banks.find(bank => bank && bank.filename === body.filename);
      if ((existing || snapshot.existingFile) && body.overwrite !== true) return jsonResponse(res, 409, { error: '题库已存在，请确认覆盖' });
      const updatedAt = new Date().toISOString();
      const entry = { filename: body.filename, name: body.name.trim(), subject: body.subject.trim(), description: (body.description || '').trim(), path: `question-banks/${body.filename}`, count: questions.length, types: [...new Set(questions.map(question => question.type))], updatedAt };
      const banks = existing ? catalog.banks.map(bank => bank.filename === body.filename ? entry : bank) : [...catalog.banks, entry];
      const result = await github.publish({ filename: body.filename, bankJson: questions, catalog: { version: 1, banks }, snapshot, message: `${existing || snapshot.existingFile ? 'Update' : 'Publish'} question bank ${body.filename}` });
      return res.status(existing || snapshot.existingFile ? 200 : 201).json({ ...entry, commitSha: result.commitSha });
    } catch (error) {
      if (error && error.status === 409) return jsonResponse(res, 409, { error: 'GitHub 分支已被更新，请重试' });
      if (error instanceof GithubError) return jsonResponse(res, 502, { error: '题库发布失败，请稍后重试' });
      return jsonResponse(res, 400, { error: error.message || '题库格式无效' });
    }
  });

  function validBankRoute(req, res, next) {
    if (!safeFilename(req.params.filename)) return jsonResponse(res, 400, { error: '题库文件名格式无效' });
    if (!github.config?.token) return jsonResponse(res, 503, { error: 'GitHub 发布未配置' });
    return next();
  }

  async function knownBankSnapshot(filename, version) {
    const snapshot = await github.preparePublication(filename);
    const bank = snapshot.catalog.banks.find(entry => entry && entry.filename === filename);
    if (!bank || !snapshot.existingFile) throw new GithubError(404);
    if (version !== undefined && version !== snapshot.parentSha) throw new GithubError(409);
    return { snapshot, bank };
  }

  app.get('/api/question-banks/:filename', requireRoot, validBankRoute, async (req, res) => {
    try { return res.json(await github.getBank(req.params.filename)); }
    catch (error) { return managementError(res, error); }
  });

  app.patch('/api/question-banks/:filename', requireRoot, validBankRoute, async (req, res) => {
    try {
      const body = req.body;
      validateManagementBody(body, ['filename', 'name', 'subject', 'description', 'questions', 'version']);
      const metadata = validateBankMetadata(body, true);
      const hasFilename = Object.prototype.hasOwnProperty.call(body, 'filename');
      const hasQuestions = Object.prototype.hasOwnProperty.call(body, 'questions');
      if (hasFilename && !safeFilename(body.filename)) throw new Error('题库文件名格式无效');
      const filename = hasFilename ? body.filename : req.params.filename;
      const renamed = filename !== req.params.filename;
      if (!Object.keys(metadata).length && !hasFilename && !hasQuestions) throw new Error('至少提供一项题库资料');
      const questions = hasQuestions ? validateQuestions(body.questions) : undefined;
      if (questions && Buffer.byteLength(JSON.stringify(questions), 'utf8') > MAX_BODY_BYTES) throw new Error('题库文件不能超过 8 MiB');
      const { snapshot, bank } = await knownBankSnapshot(req.params.filename, body.version);
      if (renamed) await github.requireRenameTargetAvailable(filename, snapshot);
      const updated = {
        ...bank,
        ...metadata,
        filename,
        path: `question-banks/${filename}`,
        ...(questions ? { count: questions.length, types: [...new Set(questions.map(question => question.type))] } : {}),
        updatedAt: new Date().toISOString(),
      };
      const catalog = { ...snapshot.catalog, banks: snapshot.catalog.banks.map(entry => entry.filename === req.params.filename ? updated : entry) };
      const result = await github.publish({ filename, originalFilename: renamed ? req.params.filename : undefined, bankJson: questions, catalog, snapshot, message: `${renamed ? 'Rename' : 'Update'} question bank ${req.params.filename}${renamed ? ` to ${filename}` : ''}` });
      return res.json({ ...updated, commitSha: result.commitSha });
    } catch (error) { return managementError(res, error); }
  });

  app.delete('/api/question-banks/:filename', requireRoot, validBankRoute, async (req, res) => {
    try {
      const body = req.body;
      validateManagementBody(body, ['confirm', 'version']);
      if (body.confirm !== true) throw new Error('删除题库需要明确确认');
      const { snapshot } = await knownBankSnapshot(req.params.filename, body.version);
      const catalog = { ...snapshot.catalog, banks: snapshot.catalog.banks.filter(entry => entry.filename !== req.params.filename) };
      const result = await github.publish({ filename: req.params.filename, deleteBank: true, catalog, snapshot, message: `Delete question bank ${req.params.filename}` });
      return res.json({ filename: req.params.filename, deleted: true, commitSha: result.commitSha });
    } catch (error) { return managementError(res, error); }
  });

  app.use((error, req, res, next) => {
    if (error && (error.type === 'entity.too.large' || error.status === 413)) return jsonResponse(res, 413, { error: '请求体不能超过 8 MiB' });
    if (error instanceof SyntaxError) return jsonResponse(res, 400, { error: 'JSON 格式无效' });
    return next(error);
  });
  app.use((error, req, res, next) => { if (res.headersSent) return next(error); return jsonResponse(res, 500, { error: '服务器内部错误' }); });
  return app;
}

function start(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3001);
  const host = options.host || process.env.HOST || '127.0.0.1';
  const app = options.app || createApp(options);
  return app.listen(port, host, () => { if (options.log !== false) console.log(`刷题通发布服务运行在 http://${host}:${port}`); });
}

if (require.main === module) start();
module.exports = { createApp, start, validateQuestions, safeFilename, isAllowedOrigin, MAX_BODY_BYTES };
