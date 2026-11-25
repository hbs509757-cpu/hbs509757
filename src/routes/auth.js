const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ data: null, error: '請填寫 Email 和密碼' });
  }
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE email = $1 AND active = true',
      [email.trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ data: null, error: '找不到這個 Email' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ data: null, error: '密碼不正確' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarColor: user.avatar_color,
        },
      },
      error: null,
    });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤，請稍後再試' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ data: null, error: '請填寫舊密碼和新密碼' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ data: null, error: '新密碼至少 6 個字元' });
  }
  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const match = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ data: null, error: '舊密碼不正確' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ data: 'ok', error: null });
  } catch (err) {
    console.error('change-password error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// POST /api/auth/register  (manager only)
router.post('/register', requireManager, async (req, res) => {
  const { name, email, role, hireDate } = req.body;
  if (!name || !email || !role) {
    return res.status(400).json({ data: null, error: '請填寫姓名、Email 和角色' });
  }
  if (!['manager', 'planner', 'designer'].includes(role)) {
    return res.status(400).json({ data: null, error: '角色必須是 manager / planner / designer' });
  }
  try {
    const hash = await bcrypt.hash('12345', 10);
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, role, hire_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name.trim(), email.trim().toLowerCase(), hash, role, hireDate || null]
    );
    res.status(201).json({ data: { id: rows[0].id, tempPassword: '12345' }, error: null });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ data: null, error: '這個 Email 已被使用' });
    }
    console.error('register error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

module.exports = router;
