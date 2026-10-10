const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Development tokens are invalidated on restart unless a signing key is set.
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const DATA_DIR = path.join(__dirname, 'data');
const ROOT_USERNAME = 'yuhao';
const DEFAULT_ROOT_PASSWORD_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
const configuredRootPassword = process.env.SHUATITONG_DEV_PASSWORD;
const ROOT_PASSWORD_HASH = configuredRootPassword
  ? crypto.createHash('sha256').update(configuredRootPassword, 'utf8').digest('hex')
  : DEFAULT_ROOT_PASSWORD_HASH;

function initData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const premiumFile = path.join(DATA_DIR, 'premium-users.json');
  if (!fs.existsSync(premiumFile)) fs.writeFileSync(premiumFile, '{}');
  const rootDir = path.join(DATA_DIR, 'users', ROOT_USERNAME);
  fs.mkdirSync(rootDir, { recursive: true });
  const questionsFile = path.join(rootDir, 'questions.json');
  if (!fs.existsSync(questionsFile)) fs.writeFileSync(questionsFile, '[]');
}

function loadPremiumUsers() {
  initData();
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'premium-users.json'), 'utf8'));
}

function savePremiumUsers(users) {
  const file = path.join(DATA_DIR, 'premium-users.json');
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(users, null, 2));
  fs.renameSync(temp, file);
}

function safeUsername(username) {
  return typeof username === 'string' && /^[A-Za-z0-9_-]{2,64}$/.test(username);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(typeof password === 'string' ? password : '', 'utf8').digest('hex');
}

function equalDigest(actual, expected) {
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function loginRoot(username, password) {
  if (username !== ROOT_USERNAME || !equalDigest(hashPassword(password), ROOT_PASSWORD_HASH)) {
    return { error: '账号或密码错误' };
  }
  return {
    token: jwt.sign({ username: ROOT_USERNAME, tier: 'root' }, SECRET, { expiresIn: '7d' }),
    username: ROOT_USERNAME,
    tier: 'root',
  };
}

function registerPremium(username, password) {
  if (!safeUsername(username)) return { error: '用户名格式无效' };
  if (typeof password !== 'string' || password.length < 3) return { error: '密码至少3位' };
  const users = loadPremiumUsers();
  if (users[username]) return { error: '用户名已存在' };
  users[username] = { passwordHash: bcrypt.hashSync(password, 10), createdAt: Date.now() };
  savePremiumUsers(users);
  const userDir = path.join(DATA_DIR, 'users', username);
  fs.mkdirSync(userDir, { recursive: true });
  const file = path.join(userDir, 'questions.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
  return { token: jwt.sign({ username, tier: 'premium' }, SECRET, { expiresIn: '7d' }), username, tier: 'premium' };
}

function loginPremium(username, password) {
  if (!safeUsername(username)) return { error: '用户不存在，请先注册' };
  const user = loadPremiumUsers()[username];
  if (!user) return { error: '用户不存在，请先注册' };
  if (typeof password !== 'string' || !bcrypt.compareSync(password, user.passwordHash)) return { error: '密码错误' };
  return { token: jwt.sign({ username, tier: 'premium' }, SECRET, { expiresIn: '7d' }), username, tier: 'premium' };
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未授权' });
  try {
    req.user = jwt.verify(auth.slice(7), SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Token 无效或已过期' });
  }
  return next();
}

function requireRoot(req, res, next) {
  return verifyToken(req, res, () => {
    if (!req.user || req.user.tier !== 'root' || req.user.username !== ROOT_USERNAME) {
      return res.status(403).json({ error: '需要开发者权限' });
    }
    return next();
  });
}

module.exports = { initData, loginRoot, registerPremium, loginPremium, verifyToken, requireRoot, safeUsername };
