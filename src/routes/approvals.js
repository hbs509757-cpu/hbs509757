const express = require('express');
const db = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

function userRow(r) {
  return r ? { id: r.id, name: r.name } : null;
}

async function getApproval(id) {
  const { rows } = await db.query(`
    SELECT a.*,
      s.name AS submitted_name,
      r.name AS resolver_name
    FROM approvals a
    LEFT JOIN users s ON s.id = a.submitted_by
    LEFT JOIN users r ON r.id = a.resolver
    WHERE a.id = $1
  `, [id]);
  return rows[0] || null;
}

async function getItems(id) {
  const { rows } = await db.query(
    'SELECT field_key, field_value FROM approval_items WHERE approval_id = $1', [id]
  );
  const obj = {};
  rows.forEach(r => { obj[r.field_key] = r.field_value; });
  return obj;
}

async function getComments(id) {
  const { rows } = await db.query(`
    SELECT ac.id, ac.text, ac.created_at,
      u.id AS uid, u.name AS uname
    FROM approval_comments ac
    JOIN users u ON u.id = ac.user_id
    WHERE ac.approval_id = $1
    ORDER BY ac.created_at ASC
  `, [id]);
  return rows.map(r => ({
    id: r.id, text: r.text, createdAt: r.created_at,
    user: { id: r.uid, name: r.uname },
  }));
}

function formatApproval(a, items, comments) {
  return {
    id: a.id, type: a.type, title: a.title,
    project: a.project, priority: a.priority, status: a.status,
    deadline: a.deadline ? a.deadline.toISOString().slice(0, 10) : null,
    submittedBy: { id: a.submitted_by, name: a.submitted_name },
    resolver: a.resolver ? { id: a.resolver, name: a.resolver_name } : null,
    resolvedAt: a.resolved_at,
    reason: a.reason, note: a.note,
    resubmitCount: a.resubmit_count,
    remindCount: a.remind_count, remindedAt: a.reminded_at,
    createdAt: a.created_at,
    items: items || {},
    comments: comments || [],
  };
}

// GET /api/approvals?type=&status=&mine=true
router.get('/', requireAuth, async (req, res) => {
  try {
    const { type, status, mine } = req.query;
    let q = `
      SELECT a.*, s.name AS submitted_name, r.name AS resolver_name
      FROM approvals a
      LEFT JOIN users s ON s.id = a.submitted_by
      LEFT JOIN users r ON r.id = a.resolver
      WHERE 1=1
    `;
    const params = [];
    if (req.user.role !== 'manager') {
      params.push(req.user.id);
      q += ` AND a.submitted_by = $${params.length}`;
    } else if (mine === 'true') {
      params.push(req.user.id);
      q += ` AND a.submitted_by = $${params.length}`;
    }
    if (type) { params.push(type); q += ` AND a.type = $${params.length}`; }
    if (status && status !== 'all') { params.push(status); q += ` AND a.status = $${params.length}`; }
    q += ' ORDER BY a.created_at DESC';
    const { rows } = await db.query(q, params);
    const data = await Promise.all(rows.map(async a => {
      const [items, comments] = await Promise.all([getItems(a.id), getComments(a.id)]);
      return formatApproval(a, items, comments);
    }));
    res.json({ data, error: null });
  } catch (err) {
    console.error('approvals GET error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// POST /api/approvals
router.post('/', requireAuth, async (req, res) => {
  const { type, title, project, priority, deadline, note, items } = req.body;
  if (!type || !title) return res.status(400).json({ data: null, error: '請填寫類別和標題' });
  try {
    const { rows } = await db.query(
      `INSERT INTO approvals (type, title, project, submitted_by, priority, deadline, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [type, title, project || null, req.user.id, priority || '中', deadline || null, note || null]
    );
    const aid = rows[0].id;
    if (items && typeof items === 'object') {
      for (const [k, v] of Object.entries(items)) {
        await db.query(
          'INSERT INTO approval_items (approval_id, field_key, field_value) VALUES ($1,$2,$3)',
          [aid, k, v != null ? String(v) : null]
        );
      }
    }
    const a = await getApproval(aid);
    const [its, comments] = await Promise.all([getItems(aid), getComments(aid)]);
    res.status(201).json({ data: formatApproval(a, its, comments), error: null });
  } catch (err) {
    console.error('approvals POST error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/approvals/:id/approve  (manager)
router.put('/:id/approve', requireManager, async (req, res) => {
  try {
    const { note } = req.body;
    const { rowCount } = await db.query(
      `UPDATE approvals SET status='approved', resolver=$1, resolved_at=NOW(), note=COALESCE($2, note)
       WHERE id=$3 AND status='pending'`,
      [req.user.id, note || null, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ data: null, error: '找不到待審核的簽核單' });
    const a = await getApproval(req.params.id);
    const [its, comments] = await Promise.all([getItems(a.id), getComments(a.id)]);
    res.json({ data: formatApproval(a, its, comments), error: null });
  } catch (err) {
    console.error('approvals approve error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/approvals/:id/reject  (manager)
router.put('/:id/reject', requireManager, async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ data: null, error: '退回必須填寫原因' });
  try {
    const { rowCount } = await db.query(
      `UPDATE approvals SET status='rejected', resolver=$1, resolved_at=NOW(), reason=$2
       WHERE id=$3 AND status='pending'`,
      [req.user.id, reason, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ data: null, error: '找不到待審核的簽核單' });
    const a = await getApproval(req.params.id);
    const [its, comments] = await Promise.all([getItems(a.id), getComments(a.id)]);
    res.json({ data: formatApproval(a, its, comments), error: null });
  } catch (err) {
    console.error('approvals reject error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/approvals/:id/resubmit  (本人)
router.put('/:id/resubmit', requireAuth, async (req, res) => {
  const { note } = req.body;
  try {
    const { rowCount } = await db.query(
      `UPDATE approvals
       SET status='pending', resolver=NULL, resolved_at=NULL, reason=NULL,
           note=$1, resubmit_count=resubmit_count+1
       WHERE id=$2 AND submitted_by=$3 AND status='rejected'`,
      [note || null, req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ data: null, error: '找不到可重送的簽核單' });
    const a = await getApproval(req.params.id);
    const [its, comments] = await Promise.all([getItems(a.id), getComments(a.id)]);
    res.json({ data: formatApproval(a, its, comments), error: null });
  } catch (err) {
    console.error('approvals resubmit error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// POST /api/approvals/:id/remind  (本人，每日一次)
router.post('/:id/remind', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT reminded_at FROM approvals WHERE id=$1 AND submitted_by=$2 AND status=$3',
      [req.params.id, req.user.id, 'pending']
    );
    if (!rows[0]) return res.status(404).json({ data: null, error: '找不到此簽核單' });
    const last = rows[0].reminded_at;
    if (last) {
      const hours = (Date.now() - new Date(last).getTime()) / 3600000;
      if (hours < 24) return res.status(429).json({ data: null, error: '今天已催簽過，請明天再試' });
    }
    await db.query(
      'UPDATE approvals SET reminded_at=NOW(), remind_count=remind_count+1 WHERE id=$1',
      [req.params.id]
    );
    res.json({ data: 'ok', error: null });
  } catch (err) {
    console.error('approvals remind error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// POST /api/approvals/:id/comments
router.post('/:id/comments', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ data: null, error: '請填寫評論內容' });
  try {
    const { rows } = await db.query(
      `INSERT INTO approval_comments (approval_id, user_id, text)
       VALUES ($1,$2,$3) RETURNING id, created_at`,
      [req.params.id, req.user.id, text]
    );
    res.status(201).json({
      data: { id: rows[0].id, text, createdAt: rows[0].created_at,
              user: { id: req.user.id, name: req.user.name } },
      error: null,
    });
  } catch (err) {
    console.error('approvals comment error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

module.exports = router;
