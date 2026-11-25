require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./db');
const fs = require('fs');
const path = require('path');

async function seed() {
  console.log('建立資料表…');
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations/001_init.sql'),
    'utf8'
  );
  await db.query(sql);

  console.log('建立初始帳號…');
  const hash = await bcrypt.hash('12345', 10);
  const users = [
    { name: '孟宏 Jason', email: 'jason@huibang.com', role: 'manager',   sort: 1, color: '#B9C9A8' },
    { name: 'Sara',       email: 'sara@huibang.com',  role: 'manager',   sort: 2, color: '#EADFD3' },
    { name: '宛汝',       email: 'wanru@huibang.com', role: 'planner',   sort: 3, color: '#F5C658' },
    { name: '麗潔',       email: 'lijie@huibang.com', role: 'designer',  sort: 4, color: '#9ED3F0' },
    { name: '佳勲',       email: 'jiaxun@huibang.com',role: 'designer',  sort: 5, color: '#B5DC8E' },
  ];
  for (const u of users) {
    await db.query(
      `INSERT INTO users (name, email, password_hash, role, sort_order, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, hash, u.role, u.sort, u.color]
    );
    console.log(`  ✓ ${u.name} (${u.email})`);
  }

  console.log('\n完成！所有帳號預設密碼：12345');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
