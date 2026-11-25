const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ data: null, error: '請先登入' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ data: null, error: 'Token 無效或已過期，請重新登入' });
  }
}

function requireManager(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ data: null, error: '權限不足，需要主管帳號' });
    }
    next();
  });
}

module.exports = { requireAuth, requireManager };
