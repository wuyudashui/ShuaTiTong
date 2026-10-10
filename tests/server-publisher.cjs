const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const testPassword = process.env.SHUATITONG_TEST_PASSWORD || String.fromCharCode(49, 50, 51, 52, 53, 54);
// Keep importing the server independent from the developer host's .env values.
process.env.SHUATITONG_DEV_PASSWORD = testPassword;
process.env.JWT_SECRET = 'test-only-signing-key';
process.env.SHUATITONG_GITHUB_TOKEN = 'test-blocked';
process.env.GITHUB_TOKEN = 'test-blocked';
const { createApp, start, validateQuestions, safeFilename, isAllowedOrigin, MAX_BODY_BYTES } = require('../server/index');

const validQuestions = () => [
  { id: 1, type: 'single', question: 'Select one', options: { A: 'first', B: 'second' }, answer: 'B', difficulty: '中', explanation: '' },
  { id: 2, type: 'multi', question: [{ t: 'text', c: 'Select several' }, { t: 'f', c: 'x^2', d: true }], options: { A: [{ t: 'code', c: 'const x = 1' }], B: [{ t: 'image', c: 'https://example.com/a.png', alt: 'example' }] }, answer: 'AB' },
  { id: 3, type: 'judge', question: 'Correct?', options: { A: 'yes', B: 'no' }, answer: 'A' },
  { id: 4, type: 'fill', question: 'Fill in', options: { A: '42', B: [{ t: 'text', c: 'answer' }] }, answer: '' },
];

function fakeGithub({ catalog = { version: 1, banks: [] }, existing = false, existingFilenames, bankText = JSON.stringify(validQuestions()), failAt = '', movedHead = false, largeFile = false } = {}) {
  const calls = []; const blobs = new Map(); const blobBytes = new Map(); let visibleHead = 'head-old'; let blobCount = 0;
  const files = new Map((existingFilenames || (existing ? ['calculus.json'] : [])).map(filename => [`public/question-banks/${filename}`, Buffer.from(bankText)]));
  const trees = new Map(); const commits = new Map();
  const fetch = async (url, options = {}) => {
    const method = options.method || 'GET'; const parsed = new URL(url); const apiPath = parsed.pathname.replace('/repos/wuyudashui/ShuaTiTong', '');
    const body = options.body ? JSON.parse(options.body) : undefined; calls.push({ method, path: apiPath, ref: parsed.searchParams.get('ref'), body, headers: options.headers });
    const result = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
    if (apiPath === failAt) return result(500, { message: 'remote secret fake-token' });
    if (method === 'GET' && apiPath === '/git/ref/heads/main') return result(200, { object: { sha: visibleHead } });
    if (method === 'GET' && apiPath.startsWith('/git/commits/')) return result(200, { tree: { sha: 'tree-old' } });
    if (method === 'GET' && apiPath === '/contents/public/question-banks/catalog.json') return result(200, { content: Buffer.from(JSON.stringify(catalog)).toString('base64'), encoding: 'base64' });
    if (method === 'GET' && apiPath.startsWith('/contents/public/question-banks/')) return files.has(apiPath.replace('/contents/', '')) ? result(200, { type: 'file', sha: 'existing-bank', content: largeFile ? '' : Buffer.from(bankText).toString('base64'), encoding: largeFile ? 'none' : 'base64', size: Buffer.byteLength(bankText) }) : result(404, { message: 'Not found' });
    if (method === 'GET' && apiPath === '/git/blobs/existing-bank') return result(200, { sha: 'existing-bank', content: Buffer.from(bankText).toString('base64'), encoding: 'base64', size: Buffer.byteLength(bankText) });
    if (method === 'POST' && apiPath === '/git/blobs') { const sha = `blob-${++blobCount}`; const bytes = Buffer.from(body.content, 'base64'); blobBytes.set(sha, bytes); blobs.set(sha, JSON.parse(bytes.toString())); return result(201, { sha }); }
    if (method === 'POST' && apiPath === '/git/trees') { trees.set('tree-new', body.tree); return result(201, { sha: 'tree-new' }); }
    if (method === 'POST' && apiPath === '/git/commits') { commits.set('commit-new', body.tree); return result(201, { sha: 'commit-new' }); }
    if (method === 'PATCH' && apiPath === '/git/refs/heads/main') {
      if (movedHead) return result(422, { message: 'Update is not a fast forward' });
      for (const entry of trees.get(commits.get(body.sha)) || []) {
        if (entry.sha === null) files.delete(entry.path);
        else files.set(entry.path, entry.sha === 'existing-bank' ? Buffer.from(bankText) : blobBytes.get(entry.sha));
      }
      visibleHead = body.sha; return result(200, { object: { sha: body.sha } });
    }
    return result(404, { message: `Unexpected fake request ${method} ${apiPath}` });
  };
  return { fetch, calls, blobs, blobBytes, files, head: () => visibleHead, originalBankBytes: Buffer.from(bankText) };
}

async function withServer(t, options = {}) {
  const app = createApp({ env: { SHUATITONG_GITHUB_TOKEN: 'fake-token' }, fetch: async () => { throw new Error('Unexpected GitHub access in test'); }, ...options });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, body, token, headers = {}) => fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const manage = (method, route, body, token, headers = {}) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = await request('/api/auth/root/login', { username: 'yuhao', password: testPassword });
  assert.equal(login.status, 200); const { token } = await login.json();
  return { request, manage, token, base };
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
  for (const extra of [{ overwrite: 'yes' }, { version: 1 }, { version: '' }, { filename: 'a'.repeat(200) + '.json' }, { name: 'x'.repeat(201) }, { subject: 'x'.repeat(101) }, { description: 'x'.repeat(2001) }]) {
    assert.equal((await request('/api/question-banks', publication(extra), token)).status, 400);
  }
  assert.equal(fake.calls.length, 0);
});

const existingBank = (extra = {}) => ({ filename: 'calculus.json', name: 'Calculus', subject: 'Math', description: 'Practice', path: 'question-banks/calculus.json', count: 4, types: ['single', 'multi', 'judge', 'fill'], updatedAt: '2026-10-10T00:00:00.000Z', ...extra });
const indexedGithub = (extra = {}) => fakeGithub({ existing: true, catalog: { version: 1, banks: [existingBank(), existingBank({ filename: 'other.json', path: 'question-banks/other.json', name: 'Other' })] }, ...extra });
const assertImmutableReads = fake => {
  for (const read of fake.calls.filter(call => call.method === 'GET' && call.path.startsWith('/contents/'))) assert.equal(read.ref, 'head-old');
};
const assertSingleNonforceCommit = fake => {
  const commits = fake.calls.filter(call => call.method === 'POST' && call.path === '/git/commits'); assert.equal(commits.length, 1); assert.deepEqual(commits[0].body.parents, ['head-old']);
  const refs = fake.calls.filter(call => call.method === 'PATCH'); assert.equal(refs.length, 1); assert.deepEqual(refs[0].body, { sha: 'commit-new', force: false });
};

test('management endpoints require root auth before GitHub access', async t => {
  const fake = indexedGithub(); const { manage, request } = await withServer(t, { fetch: fake.fetch });
  for (const [method, body] of [['GET', undefined], ['PATCH', { name: 'Edited' }], ['DELETE', { confirm: true }]]) assert.equal((await manage(method, '/api/question-banks/calculus.json', body)).status, 401);
  const username = `test_${crypto.randomBytes(4).toString('hex')}`;
  const premium = await request('/api/auth/premium/register', { username, password: 'test-password' });
  assert.equal(premium.status, 200);
  const user = await premium.json();
  t.after(() => {
    const usersFile = path.resolve(__dirname, '../server/data/premium-users.json');
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    delete users[username]; fs.writeFileSync(usersFile, JSON.stringify(users));
    const dir = path.resolve(__dirname, '../server/data/users', username);
    const allowedRoot = path.resolve(__dirname, '../server/data/users') + path.sep;
    if (!dir.startsWith(allowedRoot)) throw new Error('Unexpected test cleanup path');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  for (const [method, body] of [['GET', undefined], ['PATCH', { name: 'Edited' }], ['DELETE', { confirm: true }]]) assert.equal((await manage(method, '/api/question-banks/calculus.json', body, user.token)).status, 403);
  assert.equal(fake.calls.length, 0);
});

test('GET bank reads metadata and original questions from one immutable commit', async t => {
  const questions = validQuestions(); const fake = indexedGithub({ bankText: '  ' + JSON.stringify(questions) + '\r\n' }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('GET', '/api/question-banks/calculus.json', undefined, token); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { bank: existingBank(), questions, version: 'head-old' }); assertImmutableReads(fake);
  assert.equal(fake.calls.some(call => call.method !== 'GET'), false);
});

test('GET bank falls back to its immutable Git blob for files above Contents inline limit', async t => {
  const fake = indexedGithub({ largeFile: true }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('GET', '/api/question-banks/calculus.json', undefined, token); assert.equal(response.status, 200); assert.deepEqual((await response.json()).questions, validQuestions());
  assert.equal(fake.calls.filter(call => call.path === '/git/blobs/existing-bank').length, 1); assertImmutableReads(fake);
});

test('PATCH edits only metadata and preserves exact existing bank JSON bytes', async t => {
  const bankText = '\ufeff  ' + JSON.stringify(validQuestions(), null, 1) + '\r\n';
  const fake = indexedGithub({ bankText }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('PATCH', '/api/question-banks/calculus.json', { name: '  Renamed  ', subject: '  Algebra ', description: 'Updated description', version: 'head-old' }, token); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.name, 'Renamed'); assert.equal(result.subject, 'Algebra'); assert.equal(result.commitSha, 'commit-new');
  const tree = fake.calls.find(call => call.method === 'POST' && call.path === '/git/trees').body;
  assert.deepEqual(tree.tree.map(item => item.path), ['public/question-banks/catalog.json']); assert.equal(tree.base_tree, 'tree-old');
  assert.equal(fake.blobBytes.size, 1, 'metadata changes must never re-serialize the bank');
  const catalog = fake.blobs.get(tree.tree[0].sha); assert.equal(catalog.banks.length, 2); assert.equal(catalog.banks[0].name, 'Renamed'); assert.equal(catalog.banks[0].subject, 'Algebra'); assert.equal(catalog.banks[0].description, 'Updated description');
  assert.equal(catalog.banks[0].count, 4); assert.deepEqual(catalog.banks[0].types, existingBank().types); assert.equal(catalog.banks[0].filename, 'calculus.json'); assert.equal(catalog.banks[0].path, 'question-banks/calculus.json'); assert.deepEqual(catalog.banks[1], existingBank({ filename: 'other.json', path: 'question-banks/other.json', name: 'Other' }));
  assertImmutableReads(fake); assertSingleNonforceCommit(fake);
});

test('PATCH accepts partial metadata without resetting omitted fields', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('PATCH', '/api/question-banks/calculus.json', { description: '' }, token); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.description, ''); assert.equal(result.name, 'Calculus'); assert.equal(result.subject, 'Math');
});

test('DELETE requires explicit boolean confirmation before GitHub access', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  for (const body of [undefined, {}, { confirm: false }, { confirm: 'true' }, { confirm: 1 }]) assert.equal((await manage('DELETE', '/api/question-banks/calculus.json', body, token)).status, 400);
  assert.equal(fake.calls.length, 0);
});

test('DELETE removes bank and catalog entry in the same atomic commit', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('DELETE', '/api/question-banks/calculus.json', { confirm: true, version: 'head-old' }, token); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { filename: 'calculus.json', deleted: true, commitSha: 'commit-new' });
  const tree = fake.calls.find(call => call.method === 'POST' && call.path === '/git/trees').body;
  const deletion = tree.tree.find(entry => entry.path === 'public/question-banks/calculus.json'); assert.deepEqual(deletion, { path: 'public/question-banks/calculus.json', mode: '100644', type: 'blob', sha: null });
  const catalogEntry = tree.tree.find(entry => entry.path === 'public/question-banks/catalog.json'); const catalog = fake.blobs.get(catalogEntry.sha);
  assert.deepEqual(catalog, { version: 1, banks: [existingBank({ filename: 'other.json', path: 'question-banks/other.json', name: 'Other' })] }); assert.equal(fake.blobBytes.size, 1); assertImmutableReads(fake); assertSingleNonforceCommit(fake);
});

test('unknown banks return 404 for GET PATCH DELETE without mutation', async t => {
  for (const options of [{ existing: false }, { catalog: { version: 1, banks: [] } }]) {
    const fake = indexedGithub(options); const { manage, token } = await withServer(t, { fetch: fake.fetch });
    for (const [method, body] of [['GET', undefined], ['PATCH', { name: 'Edited' }], ['DELETE', { confirm: true }]]) assert.equal((await manage(method, '/api/question-banks/calculus.json', body, token)).status, 404);
    assert.equal(fake.calls.some(call => call.method !== 'GET'), false);
  }
});

test('management routes reject reserved filenames and encoded traversal before reads', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  for (const filename of ['catalog.json', 'CATALOG.json', '..%5Cescape.json', '..%2Fescape.json', 'bank.json%3Fextra=1', 'bad%20name.json']) {
    for (const [method, body] of [['GET', undefined], ['PATCH', { name: 'Edited' }], ['DELETE', { confirm: true }]]) assert.equal((await manage(method, '/api/question-banks/' + filename, body, token)).status, 400);
  }
  assert.equal(fake.calls.length, 0);
});

test('PATCH rejects invalid metadata and attempts to replace protected fields', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  for (const body of [{}, [], { name: '' }, { subject: '  ' }, { description: null }, { name: 'x'.repeat(201) }, { subject: 'x'.repeat(101) }, { description: 'x'.repeat(2001) }, { filename: '../escape.json', name: 'Edited' }, { path: '../x.json', name: 'Edited' }, { questions: [], name: 'Edited' }, { count: 9, name: 'Edited' }, { name: 'Edited', version: 1 }]) assert.equal((await manage('PATCH', '/api/question-banks/calculus.json', body, token)).status, 400);
  assert.equal(fake.calls.length, 0);
});

test('stale client versions reject metadata changes and deletion before mutations', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  for (const [method, body] of [['PATCH', { name: 'Edited', version: 'stale-head' }], ['DELETE', { confirm: true, version: 'stale-head' }]]) assert.equal((await manage(method, '/api/question-banks/calculus.json', body, token)).status, 409);
  assert.equal(fake.calls.some(call => call.method !== 'GET'), false);
});

test('POST overwrite rejects an obsolete editing version before blob creation', async t => {
  const fake = indexedGithub(); const { request, token } = await withServer(t, { fetch: fake.fetch });
  const response = await request('/api/question-banks', publication({ overwrite: true, version: 'stale-head' }), token);
  assert.equal(response.status, 409); assert.equal(fake.calls.some(call => call.method !== 'GET'), false);
});

test('POST overwrite accepts the current editing version', async t => {
  const fake = indexedGithub(); const { request, token } = await withServer(t, { fetch: fake.fetch });
  assert.equal((await request('/api/question-banks', publication({ overwrite: true, version: 'head-old' }), token)).status, 200);
  assertSingleNonforceCommit(fake);
});

test('branch moves reject management commits without force or automatic retry', async t => {
  for (const [method, body] of [['PATCH', { name: 'Edited' }], ['DELETE', { confirm: true }]]) {
    const fake = indexedGithub({ movedHead: true }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
    assert.equal((await manage(method, '/api/question-banks/calculus.json', body, token)).status, 409); assert.equal(fake.head(), 'head-old'); assertSingleNonforceCommit(fake);
  }
});

test('management upstream failures expose no secret details and never change the branch', async t => {
  for (const [method, body] of [['GET', undefined], ['PATCH', { name: 'Edited' }], ['DELETE', { confirm: true }]]) {
    const fake = indexedGithub({ failAt: '/contents/public/question-banks/calculus.json' }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
    const response = await manage(method, '/api/question-banks/calculus.json', body, token); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /remote secret|fake-token/); assert.equal(fake.calls.some(call => call.method !== 'GET'), false);
  }
});

test('management requests require configured publishing credentials', async t => {
  const { manage, token } = await withServer(t, { env: {} });
  for (const [method, body] of [['GET', undefined], ['PATCH', { name: 'Edited' }], ['DELETE', { confirm: true }]]) assert.equal((await manage(method, '/api/question-banks/calculus.json', body, token)).status, 503);
});

test('DELETE publication failures never partially remove the bank or its index', async t => {
  for (const failAt of ['/git/blobs', '/git/trees', '/git/commits', '/git/refs/heads/main']) {
    const fake = indexedGithub({ failAt }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
    const response = await manage('DELETE', '/api/question-banks/calculus.json', { confirm: true }, token);
    assert.equal(response.status, 502); assert.equal(fake.head(), 'head-old'); assert.doesNotMatch(await response.text(), /remote secret|fake-token/);
  }
});

test('GET bank rejects malformed JSON without exposing parsing or upstream details', async t => {
  const fake = indexedGithub({ bankText: '{secret fake-token' }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('GET', '/api/question-banks/calculus.json', undefined, token);
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /fake-token|secret|JSON/);
});

test('CORS preflight allows PATCH and DELETE for approved origins', async t => {
  const { manage } = await withServer(t);
  for (const method of ['PATCH', 'DELETE']) {
    const response = await manage('OPTIONS', '/api/question-banks/calculus.json', undefined, undefined, { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization,content-type' });
    assert.equal(response.status, 204); assert.match(response.headers.get('access-control-allow-methods'), new RegExp(method));
  }
});

test('PATCH rename-only reuses the exact bank blob and changes both paths and catalog in one commit', async t => {
  const fake = indexedGithub({ bankText: '\ufeff ' + JSON.stringify(validQuestions(), null, 1) + '\r\n' }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('PATCH', '/api/question-banks/calculus.json', { filename: 'algebra.json', version: 'head-old' }, token);
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.filename, 'algebra.json'); assert.equal(result.path, 'question-banks/algebra.json'); assert.equal(result.name, 'Calculus'); assert.equal(result.count, 4); assert.deepEqual(result.types, existingBank().types);
  const tree = fake.calls.find(call => call.method === 'POST' && call.path === '/git/trees').body;
  assert.deepEqual(tree.tree.find(entry => entry.path === 'public/question-banks/algebra.json'), { path: 'public/question-banks/algebra.json', mode: '100644', type: 'blob', sha: 'existing-bank' });
  assert.deepEqual(tree.tree.find(entry => entry.path === 'public/question-banks/calculus.json'), { path: 'public/question-banks/calculus.json', mode: '100644', type: 'blob', sha: null });
  const catalogEntry = tree.tree.find(entry => entry.path === 'public/question-banks/catalog.json'); const catalog = fake.blobs.get(catalogEntry.sha);
  assert.equal(catalog.banks.length, 2); assert.equal(catalog.banks[0].filename, 'algebra.json'); assert.equal(catalog.banks[0].path, 'question-banks/algebra.json'); assert.equal(catalog.banks.some(entry => entry.filename === 'calculus.json'), false);
  assert.equal(fake.blobBytes.size, 1); assert.equal(fake.files.has('public/question-banks/calculus.json'), false); assert.deepEqual(fake.files.get('public/question-banks/algebra.json'), fake.originalBankBytes);
  assertImmutableReads(fake); assertSingleNonforceCommit(fake);
});

test('PATCH combined rename, metadata and replacement publishes all changes atomically', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const questions = [validQuestions()[3]];
  const response = await manage('PATCH', '/api/question-banks/calculus.json', { filename: 'blanks.json', name: 'Blank practice', subject: 'General', description: 'New', questions, version: 'head-old' }, token);
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.filename, 'blanks.json'); assert.equal(result.name, 'Blank practice'); assert.equal(result.count, 1); assert.deepEqual(result.types, ['fill']);
  const tree = fake.calls.find(call => call.method === 'POST' && call.path === '/git/trees').body;
  assert.equal(tree.tree.length, 3); assert.equal(fake.blobBytes.size, 2);
  const publishedBank = JSON.parse(fake.files.get('public/question-banks/blanks.json').toString()); assert.equal(publishedBank.length, 1); assert.deepEqual(publishedBank[0].options, { 空1: '42', 空2: [{ t: 'text', c: 'answer' }] }); assert.equal(fake.files.has('public/question-banks/calculus.json'), false);
  const catalog = JSON.parse(fake.files.get('public/question-banks/catalog.json').toString()); assert.equal(catalog.banks[0].filename, 'blanks.json'); assert.equal(catalog.banks[0].name, 'Blank practice'); assert.equal(catalog.banks[0].count, 1); assert.deepEqual(catalog.banks[0].types, ['fill']);
  assertImmutableReads(fake); assertSingleNonforceCommit(fake);
});

test('PATCH replaces questions without requiring a rename or metadata change', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('PATCH', '/api/question-banks/calculus.json', { questions: [validQuestions()[0]], version: 'head-old' }, token);
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.filename, 'calculus.json'); assert.equal(result.count, 1); assert.deepEqual(result.types, ['single']);
  const tree = fake.calls.find(call => call.method === 'POST' && call.path === '/git/trees').body; assert.equal(tree.tree.length, 2); assert.equal(tree.tree.some(entry => entry.sha === null), false); assertSingleNonforceCommit(fake);
});

test('PATCH rename rejects target conflicts in catalog or actual repository path', async t => {
  for (const options of [{ target: 'other.json', fake: indexedGithub() }, { target: 'unindexed.json', fake: indexedGithub({ existingFilenames: ['calculus.json', 'unindexed.json'] }) }, { target: 'Calculus.json', fake: indexedGithub({ existingFilenames: ['calculus.json', 'Calculus.json'] }) }]) {
    const { manage, token } = await withServer(t, { fetch: options.fake.fetch });
    const response = await manage('PATCH', '/api/question-banks/calculus.json', { filename: options.target }, token);
    assert.equal(response.status, 409); assert.equal(options.fake.calls.some(call => call.method !== 'GET'), false); assertImmutableReads(options.fake);
  }
});

test('PATCH rename target validation rejects unsafe or reserved names before repository reads', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  for (const filename of ['', null, 'catalog.json', 'CATALOG.json', '../bank.json', '..\\bank.json', 'folder/bank.json', 'bank.JSON', 'bank%2F.json', 'bad name.json', 'x'.repeat(129) + '.json']) assert.equal((await manage('PATCH', '/api/question-banks/calculus.json', { filename }, token)).status, 400);
  assert.equal(fake.calls.length, 0);
});

test('PATCH allows unchanged and case-only filenames using exact GitHub path semantics', async t => {
  for (const filename of ['calculus.json', 'Calculus.json']) {
    const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
    const response = await manage('PATCH', '/api/question-banks/calculus.json', { filename, name: 'Edited' }, token); assert.equal(response.status, 200);
    assert.deepEqual(fake.files.get('public/question-banks/' + filename), fake.originalBankBytes);
    if (filename === 'calculus.json') assert.equal(fake.calls.some(call => call.method === 'GET' && call.path.includes('Calculus.json')), false);
    assertImmutableReads(fake); assertSingleNonforceCommit(fake);
  }
});

test('PATCH replacement validation fails before rename or GitHub mutation', async t => {
  const fake = indexedGithub(); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  for (const questions of [null, [], {}, [validQuestions()[0], validQuestions()[0]], [{ ...validQuestions()[0], answer: 'Z' }]]) assert.equal((await manage('PATCH', '/api/question-banks/calculus.json', { filename: 'renamed.json', questions }, token)).status, 400);
  assert.equal(fake.calls.length, 0);
});

test('PATCH rename rejects stale versions and keeps old files on failed commits', async t => {
  for (const options of [{ version: 'stale-head', expected: 409 }, { failAt: '/git/blobs', expected: 502 }, { failAt: '/git/trees', expected: 502 }, { failAt: '/git/commits', expected: 502 }, { failAt: '/git/refs/heads/main', expected: 502 }, { movedHead: true, expected: 409 }]) {
    const fake = indexedGithub(options); const { manage, token } = await withServer(t, { fetch: fake.fetch });
    const response = await manage('PATCH', '/api/question-banks/calculus.json', { filename: 'renamed.json', ...(options.version ? { version: options.version } : {}) }, token);
    assert.equal(response.status, options.expected); assert.equal(fake.head(), 'head-old'); assert.deepEqual(fake.files.get('public/question-banks/calculus.json'), fake.originalBankBytes); assert.equal(fake.files.has('public/question-banks/renamed.json'), false); assert.doesNotMatch(await response.text(), /remote secret|fake-token/);
  }
});

test('PATCH combined rename and replacement preserves the source when any publication stage fails', async t => {
  for (const options of [{ failAt: '/git/blobs', expected: 502 }, { failAt: '/git/trees', expected: 502 }, { failAt: '/git/commits', expected: 502 }, { movedHead: true, expected: 409 }]) {
    const fake = indexedGithub(options); const { manage, token } = await withServer(t, { fetch: fake.fetch });
    const response = await manage('PATCH', '/api/question-banks/calculus.json', { filename: 'renamed.json', questions: [validQuestions()[0]] }, token);
    assert.equal(response.status, options.expected); assert.equal(fake.head(), 'head-old'); assert.deepEqual(fake.files.get('public/question-banks/calculus.json'), fake.originalBankBytes); assert.equal(fake.files.has('public/question-banks/renamed.json'), false); assert.doesNotMatch(await response.text(), /remote secret|fake-token/);
  }
});

test('PATCH target path failures hide remote messages and leave the source bank untouched', async t => {
  const fake = indexedGithub({ failAt: '/contents/public/question-banks/renamed.json' }); const { manage, token } = await withServer(t, { fetch: fake.fetch });
  const response = await manage('PATCH', '/api/question-banks/calculus.json', { filename: 'renamed.json' }, token);
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /remote secret|fake-token/); assert.equal(fake.calls.some(call => call.method !== 'GET'), false); assertImmutableReads(fake);
});
