require('dotenv').config();
const { Pool } = require('pg');

const isLocal = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: process.env.VERCEL === '1' ? 1 : 10,  // serverless 每個 function 只用一條連線
  idleTimeoutMillis: 10000,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
