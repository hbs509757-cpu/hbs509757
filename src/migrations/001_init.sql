-- 惠邦內部平台 v2 — Phase 1 初始化

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(50)  NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('manager', 'planner', 'designer')),
  hire_date     DATE,
  used_before   NUMERIC(4,1) NOT NULL DEFAULT 0,
  sort_order    INT          NOT NULL DEFAULT 99,
  avatar_color  CHAR(7),
  active        BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS punch_records (
  id         SERIAL PRIMARY KEY,
  user_id    INT  NOT NULL REFERENCES users(id),
  date       DATE NOT NULL,
  in_time    TIME,
  out_time   TIME,
  in_ip      VARCHAR(50),
  out_ip     VARCHAR(50),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS cfg (
  key        VARCHAR(50) PRIMARY KEY,
  value      TEXT,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMPTZ
);

-- 初始系統設定
INSERT INTO cfg (key, value) VALUES
  ('allowed_ips',  '["36.237.204.79"]'),
  ('announcement', ''),
  ('work_rules',   '["09:00 上班","18:00 下班","午休 12:00–13:00"]'),
  ('holidays',     '[]')
ON CONFLICT (key) DO NOTHING;

-- 初始帳號（密碼 12345，執行前請先用 seed.js 產生 hash 再替換）
-- 此處用 placeholder，請執行 node src/seed.js 完成初始化
