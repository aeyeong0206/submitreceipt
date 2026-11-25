-- 배포 때 BAZE 가 이 파일을 D1 에 적용한다. 바꿀 때는 기존 표를 지우지 말고 더하기만 한다.
CREATE TABLE IF NOT EXISTS rate_limit (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- 소유자가 /admin 에서 바꾸는 값(src/content.ts 의 settings). value 는 JSON. 없으면 content.ts 의 기본값.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

-- _base 의 /admin 견본이 쓰는 문의 표. 새 템플릿은 자기 표로 바꾸거나 지운다(아직 배포 전일 때만).
CREATE TABLE IF NOT EXISTS inquiry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  assignee TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  spent_on TEXT NOT NULL,
  submitter TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  bank TEXT NOT NULL,
  account TEXT NOT NULL,
  holder TEXT NOT NULL,
  photo TEXT NOT NULL,
  checked_at TEXT,
  printed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS receipts_date ON receipts(spent_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  booked_on TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  receipt_id TEXT UNIQUE REFERENCES receipts(id),
  exempt INTEGER NOT NULL DEFAULT 0 CHECK(exempt IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(exempt = 0 OR receipt_id IS NULL)
);
CREATE INDEX IF NOT EXISTS transactions_date ON transactions(booked_on DESC, created_at DESC);
