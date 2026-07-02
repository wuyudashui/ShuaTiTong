const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'shuatitong-sync-secret-2026';
const DATA_DIR = path.join(__dirname, 'data');

// ─── Root user (hardcoded) ───
const ROOT = { username: process.env.ROOT_USER || 'yuhao', password: process.env.ROOT_PASS || '123456' };

// ─── Init ───

function initData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // Premium users file
  const pFile = path.join(DATA_DIR, 'premium-users.json');
  if (!fs.existsSync(pFile)) fs.writeFileSync(pFile, '{}');
  // Root data dir
  const rootDir = path.join(DATA_DIR, 'users', 'yuhao');
  if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
  const qFile = path.join(rootDir, 'questions.json');
  if (!fs.existsSync(qFile)) fs.writeFileSync(qFile, '[]');
}

function loadPremiumUsers() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'premium-users.json'), 'utf-8'));
}

function savePremiumUsers(users) {
  fs.writeFileSync(path.join(DATA_DIR, 'premium-users.json'), JSON.stringify(users, null, 2));
}

// ─── Root login ───

function loginRoot(username, password) {
  if (username !== ROOT.username || password !== ROOT.password) {
    return { error: '账号或密码错误' };
  }
  const token = jwt.sign({ username, tier: 'root' }, SECRET, { expiresIn: '7d' });
  return { token, username, tier: 'root' };
}

// ─── Premium register ───

function registerPremium(username, password) {
  initData();
  const users = loadPremiumUsers();
  if (users[username]) return { error: '用户名已存在' };
  if (username.length < 2) return { error: '用户名至少2位' };
  if (password.length < 3) return { error: '密码至少3位' };
  const hash = bcrypt.hashSync(password, 10);
  users[username] = { passwordHash: hash, createdAt: Date.now() };
  savePremiumUsers(users);
  // Create user data dir
  const userDir = path.join(DATA_DIR, 'users', username);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
  const qFile = path.join(userDir, 'questions.json');
  if (!fs.existsSync(qFile)) fs.writeFileSync(qFile, '[]');
  const token = jwt.sign({ username, tier: 'premium' }, SECRET, { expiresIn: '7d' });
  return { token, username, tier: 'premium' };
}

// ─── Premium login ───

function loginPremium(username, password) {
  initData();
  const users = loadPremiumUsers();
  const user = users[username];
  if (!user) return { error: '用户不存在，请先注册' };
  if (!bcrypt.compareSync(password, user.passwordHash)) return { error: '密码错误' };
  const token = jwt.sign({ username, tier: 'premium' }, SECRET, { expiresIn: '7d' });
  return { token, username, tier: 'premium' };
}

// ─── Verify token ───

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未授权' });
  try {
    const decoded = jwt.verify(auth.slice(7), SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

module.exports = { initData, loginRoot, registerPremium, loginPremium, verifyToken };
