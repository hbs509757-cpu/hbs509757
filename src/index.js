require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRouter      = require('./routes/auth');
const punchRouter     = require('./routes/punch');
const cfgRouter       = require('./routes/cfg');
const approvalsRouter = require('./routes/approvals');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth',      authRouter);
app.use('/api/punch',     punchRouter);
app.use('/api/cfg',       cfgRouter);
app.use('/api/approvals', approvalsRouter);

app.get('/api/health', (req, res) => {
  res.json({ data: 'ok', error: null, ts: new Date().toISOString() });
});

app.use('/api', (req, res) => {
  res.status(404).json({ data: null, error: `找不到路由 ${req.method} ${req.path}` });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 本機開發時啟動 HTTP server；Vercel 環境直接 export app
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`惠邦 API 啟動 — port ${PORT}`);
  });
}

module.exports = app;
