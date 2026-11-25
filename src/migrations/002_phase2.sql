-- Phase 2: approvals, draws, work_logs

CREATE TABLE IF NOT EXISTS approvals (
  id              SERIAL PRIMARY KEY,
  type            VARCHAR(20)  NOT NULL CHECK (type IN ('休假申請','製圖審核','文案送審','請款','其他')),
  title           VARCHAR(200) NOT NULL,
  project         VARCHAR(100),
  submitted_by    INT NOT NULL REFERENCES users(id),
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  priority        VARCHAR(10)  NOT NULL DEFAULT '中' CHECK (priority IN ('高','中','低')),
  deadline        DATE,
  resolver        INT REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  reason          TEXT,
  note            TEXT,
  resubmit_count  INT NOT NULL DEFAULT 0,
  reminded_at     TIMESTAMPTZ,
  remind_count    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_items (
  id          SERIAL PRIMARY KEY,
  approval_id INT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  field_key   VARCHAR(50) NOT NULL,
  field_value TEXT
);

CREATE TABLE IF NOT EXISTS approval_comments (
  id          SERIAL PRIMARY KEY,
  approval_id INT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS draws (
  id           SERIAL PRIMARY KEY,
  project      VARCHAR(100) NOT NULL,
  client       VARCHAR(100),
  applicant_id INT NOT NULL REFERENCES users(id),
  maker_id     INT REFERENCES users(id),
  filed_by_id  INT REFERENCES users(id),
  status       SMALLINT NOT NULL DEFAULT 0,
  due          DATE NOT NULL,
  by_time      VARCHAR(10),
  qty          SMALLINT,
  description  TEXT NOT NULL,
  note         TEXT,
  priority     VARCHAR(10) NOT NULL DEFAULT '中' CHECK (priority IN ('高','中','低')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  date       DATE NOT NULL,
  project    VARCHAR(100) NOT NULL,
  content    TEXT NOT NULL,
  progress   VARCHAR(20) NOT NULL DEFAULT '進行中'
             CHECK (progress IN ('待開始','進行中','完成','待確認','暫緩')),
  qty        INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
