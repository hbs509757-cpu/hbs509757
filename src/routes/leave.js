const express = require('express');
const db = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

// 台灣勞基法年資 → 特休天數
function annualDays(hireDate) {
  if (!hireDate) return 0;
  const hire = new Date(hireDate);
  const now  = new Date();
  const years = (now - hire) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0.5)  return 0;
  if (years < 1)    return 3;
  if (years < 2)    return 7;
  if (years < 3)    return 10;
  if (years < 5)    return 14;
  if (years < 10)   return 15;
  return Math.min(15 + Math.floor(years - 10), 30);
}

// GET /api/leave/balance/:userId
router.get('/balance/:userId', requireAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.userId);
    if (targetId !== req.user.id && req.user.role !== 'manager') {
      return res.status(403).json({ data: null, error: '無權查詢他人年假餘額' });
    }
    const { rows: uRows } = await db.query(
      'SELECT name, hire_date, used_before FROM users WHERE id=$1', [targetId]
    );
    if (!uRows[0]) return res.status(404).json({ data: null, error: '找不到此用戶' });
    const u = uRows[0];
    const total = annualDays(u.hire_date);
    const usedBefore = parseFloat(u.used_before) || 0;

    // 從 approvals 計算已用特休天數
    const { rows: itemRows } = await db.query(`
      SELECT ai.field_key, ai.field_value, a.id
      FROM approval_items ai
      JOIN approvals a ON a.id = ai.approval_id
      WHERE a.submitted_by = $1
        AND a.status = 'approved'
        AND a.type = '休假申請'
        AND ai.field_key IN ('kind','span')
    `, [targetId]);

    const byApproval = {};
    itemRows.forEach(r => {
      if (!byApproval[r.id]) byApproval[r.id] = {};
      byApproval[r.id][r.field_key] = r.field_value;
    });

    let usedInSystem = 0;
    Object.values(byApproval).forEach(items => {
      if (items.kind === '特休') {
        usedInSystem += items.span === '整天' ? 1 : 0.5;
      }
    });

    const usedDays = usedBefore + usedInSystem;
    res.json({
      data: {
        userId: targetId,
        name: u.name,
        hireDate: u.hire_date ? u.hire_date.toISOString().slice(0, 10) : null,
        totalAnnual: total,
        usedBefore,
        usedInSystem: Math.round(usedInSystem * 10) / 10,
        usedDays: Math.round(usedDays * 10) / 10,
        remaining: Math.max(0, Math.round((total - usedDays) * 10) / 10),
      },
      error: null,
    });
  } catch (err) {
    console.error('leave balance error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

// GET /api/leave/all  (manager only)
router.get('/all', requireManager, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT a.*, u.name AS submitted_name, r.name AS resolver_name
      FROM approvals a
      JOIN  users u ON u.id = a.submitted_by
      LEFT JOIN users r ON r.id = a.resolver
      WHERE a.type = '休假申請'
      ORDER BY a.created_at DESC
    `);

    const data = await Promise.all(rows.map(async a => {
      const { rows: items } = await db.query(
        'SELECT field_key, field_value FROM approval_items WHERE approval_id=$1', [a.id]
      );
      const itemObj = {};
      items.forEach(i => { itemObj[i.field_key] = i.field_value; });
      return {
        id: a.id,
        status: a.status,
        title: a.title,
        submittedBy: { id: a.submitted_by, name: a.submitted_name },
        resolver: a.resolver ? { id: a.resolver, name: a.resolver_name } : null,
        resolvedAt: a.resolved_at,
        reason: a.reason,
        createdAt: a.created_at,
        items: itemObj,
      };
    }));
    res.json({ data, error: null });
  } catch (err) {
    console.error('leave all error', err);
    res.status(500).json({ data: null, error: '伺服器錯誤' });
  }
});

module.exports = router;
