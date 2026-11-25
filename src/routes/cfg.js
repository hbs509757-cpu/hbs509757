const express = require('express');
const db = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_KEYS = ['allowed_ips', 'announcement', 'work_rules', 'holidays'];

// GET /api/cfg
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT key, value FROM cfg');
    const raw = {};
    rows.forEach(r => { raw[r.key] = r.value; });

    res.json({
      data: {
        allowedIps:   tryParse(raw.allowed_ips,  []),
        announcement: raw.announcement || '',
        workRules:    tryParse(raw.work_rules,   []),
        holidays:     tryParse(raw.holidays,     []),
      },
      error: null,
    });
  } catch (err) {
    console.error('cfg GET error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// PUT /api/cfg/:key  (manager only)
router.put('/:key', requireManager, async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(400).json({ data: null, error: '不允許修改此設定項目' });
  }
  const { value } = req.body;
  if (value === undefined) {
    return res.status(400).json({ data: null, error: '請提供 value' });
  }
  const stored = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    await db.query(
      `INSERT INTO cfg (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
      [key, stored, req.user.id]
    );
    res.json({ data: 'ok', error: null });
  } catch (err) {
    console.error('cfg PUT error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
