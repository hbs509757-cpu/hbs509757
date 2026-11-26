const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function fmt(d) {
  return {
    id: d.id,
    project: d.project,
    client: d.client,
    status: d.status,
    due: d.due ? d.due.toISOString().slice(0, 10) : null,
    byTime: d.by_time,
    qty: d.qty,
    description: d.description,
    note: d.note,
    priority: d.priority,
    path: d.path,
    reviewNote: d.review_note,
    createdAt: d.created_at,
    applicant: d.applicant_id ? { id: d.applicant_id, name: d.applicant_name } : null,
    maker:     d.maker_id    ? { id: d.maker_id,    name: d.maker_name }    : null,
    filedBy:   d.filed_by_id ? { id: d.filed_by_id, name: d.filed_name }   : null,
  };
}

const JOIN = `
  SELECT d.*,
    a.name AS applicant_name,
    m.name AS maker_name,
    f.name AS filed_name
  FROM draws d
  LEFT JOIN users a ON a.id = d.applicant_id
  LEFT JOIN users m ON m.id = d.maker_id
  LEFT JOIN users f ON f.id = d.filed_by_id
`;

async function getDraw(id) {
  const { rows } = await db.query(JOIN + ' WHERE d.id = $1', [id]);
  return rows[0] || null;
}

// GET /api/draws?status=&makerId=
router.get('/', requireAuth, async (req, res) => {
  try {
    let q = JOIN + ' WHERE 1=1';
    const params = [];
    if (req.query.status !== undefined) {
      params.push(parseInt(req.query.status));
      q += ` AND d.status = $${params.length}`;
    }
    if (req.query.makerId) {
      params.push(parseInt(req.query.makerId));
      q += ` AND d.maker_id = $${params.length}`;
    }
    q += ' ORDER BY d.due ASC, d.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json({ data: rows.map(fmt), error: null });
  } catch (err) {
    console.error('draws GET error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// POST /api/draws
router.post('/', requireAuth, async (req, res) => {
  const { project, client, applicantId, filedById, due, byTime, qty, description, note, priority } = req.body;
  if (!project || !due || !description) {
    return res.status(400).json({ data: null, error: '請填寫專案名稱、期望完成日和製圖說明' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO draws (project, client, applicant_id, filed_by_id, due, by_time, qty, description, note, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [project, client || null,
       applicantId || req.user.id,
       filedById   || req.user.id,
       due, byTime || null, qty || null, description, note || null, priority || '中']
    );
    const draw = await getDraw(rows[0].id);
    res.status(201).json({ data: fmt(draw), error: null });
  } catch (err) {
    console.error('draws POST error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/draws/:id/take  — 美編接單 (0→1)
router.put('/:id/take', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'UPDATE draws SET status=1, maker_id=$1 WHERE id=$2 AND status=0',
      [req.user.id, req.params.id]
    );
    if (!rowCount) return res.status(400).json({ data: null, error: '無法接單（狀態錯誤或不存在）' });
    res.json({ data: fmt(await getDraw(req.params.id)), error: null });
  } catch (err) {
    console.error('draws take error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/draws/:id/send  — 美編送審 (1→2)，需 path
router.put('/:id/send', requireAuth, async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ data: null, error: '請填寫完稿位置' });
  try {
    const { rowCount } = await db.query(
      `UPDATE draws SET status=2, path=$1, review_note='待申請人確認'
       WHERE id=$2 AND status=1 AND maker_id=$3`,
      [path, req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(400).json({ data: null, error: '無法送審（狀態錯誤或不是製圖者）' });
    res.json({ data: fmt(await getDraw(req.params.id)), error: null });
  } catch (err) {
    console.error('draws send error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/draws/:id/pass  — 申請人確認完成 (2→3)
router.put('/:id/pass', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT applicant_id, filed_by_id, status FROM draws WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ data: null, error: '找不到製圖申請' });
    const d = rows[0];
    const canPass = d.applicant_id === req.user.id || d.filed_by_id === req.user.id || req.user.role === 'manager';
    if (!canPass) return res.status(403).json({ data: null, error: '無權確認完成' });
    if (d.status !== 2) return res.status(400).json({ data: null, error: '狀態錯誤，無法確認完成' });
    await db.query(`UPDATE draws SET status=3, review_note='已通過' WHERE id=$1`, [req.params.id]);
    res.json({ data: fmt(await getDraw(req.params.id)), error: null });
  } catch (err) {
    console.error('draws pass error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/draws/:id/fix  — 退回修改 (2→1)，附備註
router.put('/:id/fix', requireAuth, async (req, res) => {
  const { reviewNote } = req.body;
  try {
    const { rows } = await db.query('SELECT applicant_id, filed_by_id, status FROM draws WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ data: null, error: '找不到製圖申請' });
    const d = rows[0];
    const canFix = d.applicant_id === req.user.id || d.filed_by_id === req.user.id || req.user.role === 'manager';
    if (!canFix) return res.status(403).json({ data: null, error: '無權退回修改' });
    if (d.status !== 2) return res.status(400).json({ data: null, error: '狀態錯誤，無法退回' });
    await db.query('UPDATE draws SET status=1, review_note=$1 WHERE id=$2', [reviewNote || '請重新製作', req.params.id]);
    res.json({ data: fmt(await getDraw(req.params.id)), error: null });
  } catch (err) {
    console.error('draws fix error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/draws/:id  — 一般編輯（專案名、說明、期限、指派）
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT applicant_id, filed_by_id, status FROM draws WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ data: null, error: '找不到製圖申請' });
    const d = rows[0];
    const canEdit = d.applicant_id === req.user.id || d.filed_by_id === req.user.id || req.user.role === 'manager';
    if (!canEdit) return res.status(403).json({ data: null, error: '無權修改此製圖申請' });
    if (d.status >= 2 && req.user.role !== 'manager') {
      return res.status(400).json({ data: null, error: '已進入審核階段，無法編輯' });
    }
    const { project, client, due, byTime, qty, description, note, priority, makerId } = req.body;
    await db.query(`
      UPDATE draws SET
        project     = COALESCE($1, project),
        client      = COALESCE($2, client),
        due         = COALESCE($3, due),
        by_time     = COALESCE($4, by_time),
        qty         = COALESCE($5, qty),
        description = COALESCE($6, description),
        note        = COALESCE($7, note),
        priority    = COALESCE($8, priority),
        maker_id    = COALESCE($9, maker_id)
      WHERE id = $10
    `, [project || null, client || null, due || null, byTime || null,
        qty || null, description || null, note || null, priority || null,
        makerId || null, req.params.id]);
    res.json({ data: fmt(await getDraw(req.params.id)), error: null });
  } catch (err) {
    console.error('draws PUT error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// DELETE /api/draws/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT applicant_id, filed_by_id, status FROM draws WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ data: null, error: '找不到製圖申請' });
    const d = rows[0];
    const canDel = d.applicant_id === req.user.id || d.filed_by_id === req.user.id || req.user.role === 'manager';
    if (!canDel) return res.status(403).json({ data: null, error: '無權刪除此製圖申請' });
    if (d.status >= 2 && req.user.role !== 'manager') {
      return res.status(400).json({ data: null, error: '已進入審核階段，請聯絡主管處理' });
    }
    await db.query('DELETE FROM draws WHERE id=$1', [req.params.id]);
    res.json({ data: 'deleted', error: null });
  } catch (err) {
    console.error('draws DELETE error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

module.exports = router;
