const express = require('express');
const db = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

async function getAllowedIps() {
  const { rows } = await db.query("SELECT value FROM cfg WHERE key = 'allowed_ips'");
  if (!rows[0] || !rows[0].value) return [];
  try { return JSON.parse(rows[0].value); } catch { return []; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function timeStr() {
  return new Date().toTimeString().slice(0, 5);
}

// GET /api/punch/today
router.get('/today', requireAuth, async (req, res) => {
  try {
    const date = todayStr();
    const { rows } = await db.query(
      'SELECT in_time, out_time FROM punch_records WHERE user_id = $1 AND date = $2',
      [req.user.id, date]
    );
    const rec = rows[0] || {};
    const inTime = rec.in_time ? rec.in_time.slice(0, 5) : null;
    const outTime = rec.out_time ? rec.out_time.slice(0, 5) : null;
    const isLate = inTime ? inTime > '09:00' : false;
    res.json({ data: { date, in: inTime, out: outTime, isLate }, error: null });
  } catch (err) {
    console.error('punch/today error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// POST /api/punch/in
router.post('/in', requireAuth, async (req, res) => {
  try {
    const allowedIps = await getAllowedIps();
    const ip = getClientIp(req);
    if (allowedIps.length > 0 && !allowedIps.includes(ip)) {
      return res.status(403).json({ data: null, error: '不在公司網路，無法打卡（IP: ' + ip + '）' });
    }
    const date = todayStr();
    const time = timeStr();
    await db.query(
      `INSERT INTO punch_records (user_id, date, in_time, in_ip)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, date) DO UPDATE SET in_time = $3, in_ip = $4`,
      [req.user.id, date, time, ip]
    );
    res.json({ data: { time, isLate: time > '09:00' }, error: null });
  } catch (err) {
    console.error('punch/in error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// POST /api/punch/out
router.post('/out', requireAuth, async (req, res) => {
  try {
    const allowedIps = await getAllowedIps();
    const ip = getClientIp(req);
    if (allowedIps.length > 0 && !allowedIps.includes(ip)) {
      return res.status(403).json({ data: null, error: '不在公司網路，無法打卡（IP: ' + ip + '）' });
    }
    const date = todayStr();
    const time = timeStr();
    const { rowCount } = await db.query(
      `UPDATE punch_records SET out_time = $1, out_ip = $2
       WHERE user_id = $3 AND date = $4`,
      [time, ip, req.user.id, date]
    );
    if (rowCount === 0) {
      return res.status(400).json({ data: null, error: '請先打上班卡' });
    }
    res.json({ data: { time }, error: null });
  } catch (err) {
    console.error('punch/out error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// GET /api/punch/records?userId=&month=2026-11
router.get('/records', requireAuth, async (req, res) => {
  try {
    const targetId = req.query.userId ? parseInt(req.query.userId) : req.user.id;
    if (targetId !== req.user.id && req.user.role !== 'manager') {
      return res.status(403).json({ data: null, error: '無權查詢他人打卡紀錄' });
    }
    let query = 'SELECT date, in_time, out_time FROM punch_records WHERE user_id = $1';
    const params = [targetId];
    if (req.query.month) {
      query += ' AND TO_CHAR(date, \'YYYY-MM\') = $2';
      params.push(req.query.month);
    }
    query += ' ORDER BY date DESC';
    const { rows } = await db.query(query, params);
    const data = rows.map(r => ({
      date: r.date.toISOString().slice(0, 10),
      in: r.in_time ? r.in_time.slice(0, 5) : null,
      out: r.out_time ? r.out_time.slice(0, 5) : null,
    }));
    res.json({ data, error: null });
  } catch (err) {
    console.error('punch/records error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

module.exports = router;
