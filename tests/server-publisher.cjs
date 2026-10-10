const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createApp, start, validateQuestions, safeFilename, isAllowedOrigin, MAX_BODY_BYTES } = require('../server/index');
const testPassword = process.env.SHUATITONG_TEST_PASSWORD || String.fromCharCode(49, 50, 51, 52, 53, 54);

const validQuestions = () => [
  { id: 1, type: 'single', question: 'Select one', options: { A: 'first', B: 'second' }, answer: 'B', difficulty: '中', explanation: '' },
  { id: 2, type: 'multi', question: [{ t: 'text', c: 'Select several' }, { t: 'f', c: 'x^2', d: true }], options: { A: [{ t: 'code', c: 'const x = 1' }], B: [{ t: 'image', c: 'https://example.com/a.png', alt: 'example' }] }, answer: 'AB' },
  { id: 3, type: 'judge', question: 'Correct?', options: { A: 'yes', B: 'no' }, answer: 'A' },
  { id: 4, type: 'fill', question: 'Fill in', options: { A: '42', B: [{ t: 'text', c: 'answer' }] }, answer: '' },
];

function fakeGithub({ catalog = { version: 1, banks: [] }, existing = false, failAt = '', movedHead = false } = {}) {
  const calls = []; const blobs = new Map(); let visibleHead = 'head-old'; let blobCount = 0;
  const fetch = async (url, options = {}) => {
    const method = options.method || 'GET'; const parsed = new URL(url); const apiPath = parsed.pathname.replace('/repos/wuyudashui/ShuaTiTong', '');
    const body = options.body ? JSON.parse(options.body) : undefined; calls.push({ method, path: apiPath, ref: parsed.searchParams.get('ref'), body, headers: options.headers });
    const result = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
    if (apiPath === failAt) return result(500, { message: 'remote secret fake-token' });
    if (method === 'GET' && apiPath === '/git/ref/heads/main') return result(200, { object: { sha: visibleHead } });
    if (method === 'GET' && apiPath.startsWith('/git/commits/')) return result(200, { tree: { sha: 'tree-old' } });
    if (method === 'GET' && apiPath === '/contents/public/question-banks/catalog.json') return result(200, { content: Buffer.from(JSON.stringify(catalog)).toString('base64'), encoding: 'base64' });
    if (method === 'GET' && apiPath.startsWith('/contents/public/question-banks/')) return existing ? result(200, { sha: 'existing-bank' }) : result(404, { message: 'Not found' });
    if (method === 'POST' && apiPath === '/git/blobs') { const sha = `blob-${++blobCount}`; blobs.set(sha, JSON.parse(Buffer.from(body.content, 'base64').toString())); return result(201, { sha }); }
    if (method === 'POST' && apiPath === '/git/trees') return result(201, { sha: 'tree-new' });
    if (method === 'POST' && apiPath === '/git/commits') return result(201, { sha: 'commit-new' });
    if (method === 'PATCH' && apiPath === '/git/refs/heads/main') {
      if (movedHead) return result(422, { message: 'Update is not a fast forward' });
      visibleHead = body.sha; return result(200, { object: { sha: body.sha } });
    }
    return result(404, { message: `Unexpected fake request ${method} ${apiPath}` });
  };
  return { fetch, calls, blobs, head: () => visibleHead };
}

async function withServer(t, options = {}) {
  const app = createApp({ env: { SHUATITONG_GITHUB_TOKEN: 'fake-token' }, ...options });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, body, token, headers = {}) => fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = await request('/api/auth/root/login', { username: 'yuhao', password: testPassword });
  assert.equal(login.status, 200); const { token } = await login.json();
  return { request, token, base };
}
const publication = (extra = {}) => ({ filename: 'calculus.json', name: 'Calculus', subject: 'Math', description: 'Practice', questions: validQuestions(), overwrite: false, ...extra });

test('root login requires matching credentials and returns a root token', async t => {
  const { request } = await withServer(t);
  for (const body of [{ username: 'root', password: testPassword }, { username: 'yuhao', password: 'wrong' }, {}, { username: 'yuhao', password: null }]) assert.equal((await request('/api/auth/root/login', body)).status, 401);
  const response = await request('/api/auth/root/login', { username: 'yuhao', password: testPassword }); const result = await response.json();
  assert.equal(result.username, 'yuhao'); assert.equal(result.tier, 'root'); assert.equal(typeof result.token, 'string');
});

test('root password override supersedes the default', () => {
  const script = `const auth = require('./server/auth'); console.log(JSON.stringify([Boolean(auth.loginRoot('yuhao','override-value').token), Boolean(auth.loginRoot('yuhao',${JSON.stringify(testPassword)}).error)]))`;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, SHUATITONG_DEV_PASSWORD: 'override-value' }, encoding: 'utf8' });
  assert.equal(run.status, 0); assert.deepEqual(JSON.parse(run.stdout), [true, true]);
});

test('publisher endpoints require a root token and never reveal configured tokens', async t => {
  const { request, token } = await withServer(t);
  for (const route of ['/api/publisher/status', '/api/question-banks']) assert.equal((await request(route)).status, 401);
  assert.equal((await request('/api/question-banks', publication())).status, 401);
  const status = await request('/api/publisher/status', undefined, token); const data = await status.json();
  assert.deepEqual(data, { configured: true, owner: 'wuyudashui', repo: 'ShuaTiTong', branch: 'main' }); assert.doesNotMatch(JSON.stringify(data), /fake-token|Authorization/);
});

test('publisher status reports missing configuration and publication fails without credentials', async t => {
  const { request, token } = await withServer(t, { env: {} });
  const result = await (await request('/api/publisher/status', undefined, token)).json(); assert.equal(result.configured, false);
  assert.equal((await request('/api/question-banks', publication(), token)).status, 503);
});

test('safe publication filenames reject catalog and path traversal', () => {
  for (const filename of ['../bank.json', '..\\bank.json', 'folder/bank.json', 'bank.JSON', 'catalog.json', 'CATALOG.json', '.bank.json', 'my bank.json', 'bank.json?x=1', 'bank%2f.json']) assert.equal(safeFilename(filename), false, filename);
  for (const filename of ['bank.json', 'bank_1-2.json']) assert.equal(safeFilename(filename), true);
});

test('validation accepts structured content and normalizes legacy fill blanks', () => {
  const questions = validateQuestions(validQuestions()); assert.deepEqual(questions[3].options, { 空1: '42', 空2: [{ t: 'text', c: 'answer' }] }); assert.equal(questions.length, 4);
});

test('validation rejects empty banks, duplicate ids, invalid content and answers', () => {
  for (const input of [[], {}, [{ ...validQuestions()[0], id: 0 }], [validQuestions()[0], validQuestions()[0]], [{ ...validQuestions()[0], type: 'essay' }], [{ ...validQuestions()[0], question: [{ t: 'html', c: 'x' }] }], [{ ...validQuestions()[0], answer: 'C' }], [{ ...validQuestions()[0], type: 'multi', answer: 'AA' }], [{ ...validQuestions()[0], options: {} }]]) assert.throws(() => validateQuestions(input));
});

test('CORS permits approved local ports and Pages origin only', async t => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:3001', 'https://localhost:8443', 'https://wuyudashui.github.io']) assert.equal(isAllowedOrigin(origin), true);
  for (const origin of ['https://evil.test', 'https://wuyudashui.github.io.evil.test', 'null', 'http://192.168.1.2:3001']) assert.equal(isAllowedOrigin(origin), false);
  const { request } = await withServer(t);
  assert.equal((await request('/api/status', undefined, undefined, { Origin: 'http://localhost:5173' })).headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await request('/api/status', undefined, undefined, { Origin: 'https://evil.test' })).headers.get('access-control-allow-origin'), null);
});

test('GET catalog returns the repository catalog object', async t => {
  const catalog = { version: 1, banks: [{ filename: 'prior.json', name: 'Prior', subject: 'Math', description: '', path: 'question-banks/prior.json', count: 1, types: ['single'], updatedAt: '2026-10-10T00:00:00.000Z' }] };
  const fake = fakeGithub({ catalog }); const { request, token } = await withServer(t, { fetch: fake.fetch });
  const response = await request('/api/question-banks', undefined, token); assert.equal(response.status, 200); assert.deepEqual(await response.json(), catalog);
});

test('publication commits bank and catalog in a single tree with a non-force ref update', async t => {
  const fake = fakeGithub(); const { request, token } = await withServer(t, { fetch: fake.fetch });
  const response = await request('/api/question-banks', publication(), token); assert.equal(response.status, 201); const result = await response.json(); assert.equal(result.commitSha, 'commit-new');
  const tree = fake.calls.find(call => call.method === 'POST' && call.path === '/git/trees').body;
  assert.deepEqual(tree.tree.map(item => item.path), ['public/question-banks/calculus.json', 'public/question-banks/catalog.json']);
  assert.equal(tree.base_tree, 'tree-old'); const bank = fake.blobs.get(tree.tree[0].sha); const catalog = fake.blobs.get(tree.tree[1].sha);
  assert.equal(bank.length, 4); assert.deepEqual(bank[3].options, { 空1: '42', 空2: [{ t: 'text', c: 'answer' }] });
  assert.equal(catalog.version, 1); assert.equal(catalog.banks[0].count, 4); assert.deepEqual(catalog.banks[0].types, ['single', 'multi', 'judge', 'fill']);
  assert.equal(catalog.banks[0].path, 'question-banks/calculus.json');
  const commits = fake.calls.filter(call => call.method === 'POST' && call.path === '/git/commits'); assert.equal(commits.length, 1); assert.deepEqual(commits[0].body.parents, ['head-old']);
  const refs = fake.calls.filter(call => call.method === 'PATCH'); assert.equal(refs.length, 1); assert.deepEqual(refs[0].body, { sha: 'commit-new', force: false });
  for (const read of fake.calls.filter(call => call.method === 'GET' && call.path.startsWith('/contents/'))) assert.equal(read.ref, 'head-old', 'repository reads must share the immutable parent commit');
  assert.equal(fake.head(), 'commit-new');
});

test('existing bank files require explicit overwrite even when catalog omits them', async t => {
  const fake = fakeGithub({ existing: true }); const { request, token } = await withServer(t, { fetch: fake.fetch });
  const response = await request('/api/question-banks', publication(), token); assert.equal(response.status, 409); assert.equal(fake.calls.some(call => call.method === 'POST'), false);
});

test('overwriting an indexed bank replaces metadata without duplicating catalog entries', async t => {
  const prior = { filename: 'calculus.json', name: 'Old', subject: 'Old', description: '', path: 'question-banks/calculus.json', count: 1, types: ['single'], updatedAt: 'old' };
  const fake = fakeGithub({ catalog: { version: 1, banks: [prior] }, existing: true }); const { request, token } = await withServer(t, { fetch: fake.fetch });
  assert.equal((await request('/api/question-banks', publication({ overwrite: true }), token)).status, 200);
  const tree = fake.calls.find(call => call.path === '/git/trees').body; const catalog = fake.blobs.get(tree.tree[1].sha); assert.equal(catalog.banks.length, 1); assert.equal(catalog.banks[0].name, 'Calculus');
});

test('blob failure leaves visible bank and catalog untouched and hides remote error details', async t => {
  const fake = fakeGithub({ failAt: '/git/blobs' }); const { request, token } = await withServer(t, { fetch: fake.fetch });
  const response = await request('/api/question-banks', publication(), token); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /fake-token|remote secret/);
  assert.equal(fake.head(), 'head-old'); assert.equal(fake.calls.some(call => call.method === 'PATCH'), false);
});

test('tree and commit failures leave the published branch untouched', async t => {
  for (const failAt of ['/git/trees', '/git/commits']) {
    const fake = fakeGithub({ failAt }); const { request, token } = await withServer(t, { fetch: fake.fetch });
    const response = await request('/api/question-banks', publication(), token);
    assert.equal(response.status, 502); assert.equal(fake.head(), 'head-old'); assert.equal(fake.calls.some(call => call.method === 'PATCH'), false);
  }
});

test('malformed repository catalogs fail before any publication mutation', async t => {
  const fake = fakeGithub({ catalog: { version: 1, banks: 'invalid' } });
  const { request, token } = await withServer(t, { fetch: fake.fetch });
  assert.equal((await request('/api/question-banks', publication(), token)).status, 502);
  assert.equal(fake.calls.some(call => call.method === 'POST'), false);
});

test('network failures never expose their message or credentials', async t => {
  const { request, token } = await withServer(t, { fetch: async () => { throw new Error('secret fake-token'); } });
  const response = await request('/api/question-banks', publication(), token);
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /fake-token|secret/);
});

test('concurrent branch changes reject publication without force', async t => {
  const fake = fakeGithub({ movedHead: true }); const { request, token } = await withServer(t, { fetch: fake.fetch });
  const response = await request('/api/question-banks', publication(), token); assert.equal(response.status, 409); assert.equal(fake.head(), 'head-old');
});

test('malformed JSON and oversized bodies have clear nonsecret errors', async t => {
  const { base, token } = await withServer(t); const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const malformed = await fetch(base + '/api/question-banks', { method: 'POST', headers, body: '{' }); assert.equal(malformed.status, 400);
  const oversized = await fetch(base + '/api/question-banks', { method: 'POST', headers, body: JSON.stringify({ value: 'x'.repeat(MAX_BODY_BYTES + 1) }) }); assert.equal(oversized.status, 413);
});

test('startup listens on loopback by default', async t => {
  const server = start({ port: 0, log: false, app: createApp({ env: {} }) }); t.after(() => new Promise(resolve => server.close(resolve))); await new Promise(resolve => server.on('listening', resolve));
  assert.equal(server.address().address, '127.0.0.1');
});

test('premium login tokens cannot reach publisher endpoints and unsafe usernames are rejected', async t => {
  const { request } = await withServer(t);
  for (const username of ['../escape', '..\\escape', 'space name', '__proto__']) assert.equal((await request('/api/auth/premium/register', { username, password: 'test-password' })).status, 400);
  const username = `test_${crypto.randomBytes(4).toString('hex')}`;
  const response = await request('/api/auth/premium/register', { username, password: 'test-password' }); assert.equal(response.status, 200); const user = await response.json();
  for (const route of ['/api/publisher/status', '/api/question-banks']) assert.equal((await request(route, undefined, user.token)).status, 403);
  assert.equal((await request('/api/question-banks', publication(), user.token)).status, 403);
  const dir = path.resolve(__dirname, '../server/data/users', username);
  t.after(() => { const usersFile = path.resolve(__dirname, '../server/data/premium-users.json'); const users = JSON.parse(fs.readFileSync(usersFile, 'utf8')); delete users[username]; fs.writeFileSync(usersFile, JSON.stringify(users)); const allowedRoot = path.resolve(__dirname, '../server/data/users') + path.sep; if (!dir.startsWith(allowedRoot)) throw new Error('Unexpected test cleanup path'); fs.rmSync(dir, { recursive: true, force: true }); });
});

test('JWT signing key is fresh per process when no key is configured', () => {
  const result = () => spawnSync(process.execPath, ['-e', `console.log(require('./server/auth').loginRoot('yuhao',${JSON.stringify(testPassword)}).token)`], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, JWT_SECRET: '', SHUATITONG_DEV_PASSWORD: '' }, encoding: 'utf8' });
  const first = result(); const second = result(); assert.equal(first.status, 0); assert.equal(second.status, 0); assert.notEqual(first.stdout.trim(), second.stdout.trim());
});

test('publication rejects unsafe image sources, blank content and unrenderable choice keys', () => {
  for (const input of [
    [{ ...validQuestions()[0], question: '   ' }],
    [{ ...validQuestions()[0], question: [{ t: 'image', c: 'javascript:alert(1)' }] }],
    [{ ...validQuestions()[0], options: { '<img>': 'x' }, answer: '<img>' }],
    [{ ...validQuestions()[0], type: 'fill', options: { A: '' }, answer: '' }],
  ]) assert.throws(() => validateQuestions(input));
});

test('publication rejects invalid metadata before contacting GitHub', async t => {
  const fake = fakeGithub(); const { request, token } = await withServer(t, { fetch: fake.fetch });
  for (const extra of [{ overwrite: 'yes' }, { filename: 'a'.repeat(200) + '.json' }, { name: 'x'.repeat(201) }, { subject: 'x'.repeat(101) }, { description: 'x'.repeat(2001) }]) {
    assert.equal((await request('/api/question-banks', publication(extra), token)).status, 400);
  }
  assert.equal(fake.calls.length, 0);
});
