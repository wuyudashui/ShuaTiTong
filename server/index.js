require("dotenv").config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { initData, loginRoot, registerPremium, loginPremium, verifyToken } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
initData();

const USERS_DIR = path.join(__dirname, 'data', 'users');

// ─── Auth ───

// Root login (hardcoded yuhao/123456)
app.post('/api/auth/root/login', (req, res) => {
  const { username, password } = req.body;
  const result = loginRoot(username, password);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

// Premium register
app.post('/api/auth/premium/register', (req, res) => {
  const { username, password } = req.body;
  const result = registerPremium(username, password);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Premium login
app.post('/api/auth/premium/login', (req, res) => {
  const { username, password } = req.body;
  const result = loginPremium(username, password);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

// ─── Questions (protected) ───

function getUserFile(req) {
  return path.join(USERS_DIR, req.user.username, 'questions.json');
}

app.get('/api/questions', verifyToken, (req, res) => {
  const f = getUserFile(req);
  if (!fs.existsSync(f)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(f, 'utf-8')));
});

app.put('/api/questions', verifyToken, (req, res) => {
  const questions = req.body;
  if (!Array.isArray(questions)) return res.status(400).json({ error: '格式无效' });
  const userDir = path.join(USERS_DIR, req.user.username);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, 'questions.json'), JSON.stringify(questions, null, 2));
  res.json({ count: questions.length });
});

// ─── Status ───

app.get('/api/status', (req, res) => {
  res.json({ online: true, version: '1.0' });
});

// ─── Start ───

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`刷题通服务运行在 http://0.0.0.0:${PORT}`);
  console.log('✅ Root 账户: yuhao / 123456');
});
