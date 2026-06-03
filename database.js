const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DATABASE_PATH || path.join(__dirname, 'receiptagent.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'beta',
    status TEXT NOT NULL DEFAULT 'inactive',
    business_name TEXT,
    phone TEXT,
    activated_at TEXT,
    expires_at TEXT,
    device_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    revoked INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_code TEXT NOT NULL,
    receipt_data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_code TEXT,
    event TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_code TEXT,
    name TEXT,
    phone TEXT,
    business_name TEXT,
    rating INTEGER,
    what_worked TEXT,
    what_confused TEXT,
    missing_features TEXT,
    bugs TEXT,
    would_pay TEXT,
    suggested_price TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
