const path = require("node:path");
const Database = require("better-sqlite3");
const config = require("./config");

const db = new Database(path.join(config.DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS extractions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type       TEXT NOT NULL,
  file_name      TEXT,
  json           TEXT NOT NULL,
  min_confidence REAL NOT NULL DEFAULT 0,
  needs_review   INTEGER NOT NULL DEFAULT 0,
  verified       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt     TEXT NOT NULL,
  file       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name  TEXT,
  text       TEXT NOT NULL,
  language   TEXT,
  duration   REAL,
  segments   TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tts_cache (
  key        TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  voice      TEXT NOT NULL,
  speed      REAL NOT NULL,
  format     TEXT NOT NULL,
  file       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  mime       TEXT,
  width      INTEGER,
  height     INTEGER,
  bytes      INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role       TEXT NOT NULL,
  text       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER,
  api           TEXT NOT NULL,
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_hit     INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL
);
`);

function now() {
  return new Date().toISOString();
}

module.exports = { db, now };
