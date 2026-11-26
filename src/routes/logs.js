const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function fmt(r, name) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: name || r.name || null,
    date: r.date.toISOString().slice(0, 10),
    project: r.project,
    content: r.content,
    progress: r.progress,
    qty: r.qty,
    createdAt: r.created_at,
  };
}

// GET /api/logs?userId=&date=
router.get('/', requireAuth, async (req, res) => {
  try {
    const targetId = req.query.userId ? parseInt(req.query.userId) : req.user.id;
    if (targetId !== req.user.id && req.user.role !== 'manager') {
      return res.status(403).json({ data: null, error: '無權查詢他人工作日誌' });
    }
    let q = `SELECT l.*, u.name FROM work_logs l
             JOIN users u ON u.id = l.user_id WHERE l.user_id = $1`;
    const params = [targetId];
    if (req.query.date) {
      params.push(req.query.date);
      q += ` AND l.date = $${params.length}`;
    }
    q += ' ORDER BY l.date DESC, l.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json({ data: rows.map(r => fmt(r)), error: null });
  } catch (err) {
    console.error('logs GET error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// POST /api/logs
router.post('/', requireAuth, async (req, res) => {
  const { date, project, content, progress, qty } = req.body;
  if (!date || !project || !content) {
    return res.status(400).json({ data: null, error: '請填寫日期、專案和工作內容' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO work_logs (user_id, date, project, content, progress, qty)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, date, project, content, progress || '進行中', qty || null]
    );
    res.status(201).json({ data: fmt(rows[0], req.user.name), error: null });
  } catch (err) {
    console.error('logs POST error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/logs/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { project, content, progress, qty } = req.body;
  if (!project || !content) {
    return res.status(400).json({ data: null, error: '請填寫專案和工作內容' });
  }
  try {
    const { rows, rowCount } = await db.query(
      `UPDATE work_logs SET project=$1, content=$2, progress=$3, qty=$4
       WHERE id=$5 AND user_id=$6 RETURNING *`,
      [project, content, progress || '進行中', qty || null, req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ data: null, error: '找不到這筆日誌或無權修改' });
    res.json({ data: fmt(rows[0], req.user.name), error: null });
  } catch (err) {
    console.error('logs PUT error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// DELETE /api/logs/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM work_logs WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ data: null, error: '找不到這筆日誌或無權刪除' });
    res.json({ data: 'deleted', error: null });
  } catch (err) {
    console.error('logs DELETE error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

module.exports = router;
