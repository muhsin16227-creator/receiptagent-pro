const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// CHANGE THIS — your admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2024secure';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MIDDLEWARE ───────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── LICENSE ROUTES ───────────────────────────────────────────

// Verify license
app.post('/api/verify-license', (req, res) => {
  const { code, device_id } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const license = db.prepare('SELECT * FROM licenses WHERE code = ?').get(code.trim().toUpperCase());

  if (!license) return res.json({ valid: false, reason: 'Invalid code' });
  if (license.revoked) return res.json({ valid: false, reason: 'License revoked' });

  const now = new Date();

  // If not yet activated — activate it
  if (license.status === 'inactive') {
    const activatedAt = now.toISOString();
    let expiresAt = null;

    if (license.type === 'beta') {
      const exp = new Date(now);
      exp.setDate(exp.getDate() + 14);
      expiresAt = exp.toISOString();
    } else if (license.type === 'trial') {
      const exp = new Date(now);
      exp.setDate(exp.getDate() + 7);
      expiresAt = exp.toISOString();
    }

    db.prepare(`
      UPDATE licenses SET status='active', activated_at=?, expires_at=?, device_id=? WHERE code=?
    `).run(activatedAt, expiresAt, device_id || null, code.trim().toUpperCase());

    logAnalytics(code, 'license_activated');
    return res.json({ valid: true, type: license.type, expires_at: expiresAt });
  }

  // Check expiry
  if (license.expires_at) {
    const expiry = new Date(license.expires_at);
    if (now > expiry) {
      db.prepare("UPDATE licenses SET status='expired' WHERE code=?").run(code.trim().toUpperCase());
      return res.json({ valid: false, reason: 'License expired' });
    }
  }

  // Device check (soft — warn but allow for now)
  if (license.device_id && device_id && license.device_id !== device_id) {
    logAnalytics(code, 'device_mismatch');
  }

  logAnalytics(code, 'license_verified');
  return res.json({
    valid: true,
    type: license.type,
    expires_at: license.expires_at,
    business_name: license.business_name
  });
});

// ─── RECEIPT ROUTES ───────────────────────────────────────────

app.post('/api/receipts', (req, res) => {
  const { license_code, receipt_data } = req.body;
  if (!license_code || !receipt_data) return res.status(400).json({ error: 'Missing fields' });

  db.prepare('INSERT INTO receipts (license_code, receipt_data) VALUES (?, ?)').run(
    license_code.toUpperCase(),
    JSON.stringify(receipt_data)
  );

  logAnalytics(license_code, 'receipt_created');
  res.json({ success: true });
});

// ─── FEEDBACK ROUTES ──────────────────────────────────────────

app.post('/api/feedback', (req, res) => {
  const f = req.body;
  db.prepare(`
    INSERT INTO feedback (license_code, name, phone, business_name, rating, what_worked, what_confused, missing_features, bugs, would_pay, suggested_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(f.license_code || null, f.name, f.phone, f.business_name, f.rating, f.what_worked, f.what_confused, f.missing_features, f.bugs, f.would_pay, f.suggested_price);

  logAnalytics(f.license_code, 'feedback_submitted');
  res.json({ success: true });
});

// ─── ANALYTICS ────────────────────────────────────────────────

app.post('/api/analytics', (req, res) => {
  const { license_code, event } = req.body;
  if (event) logAnalytics(license_code, event);
  res.json({ success: true });
});

function logAnalytics(license_code, event) {
  try {
    db.prepare('INSERT INTO analytics (license_code, event) VALUES (?, ?)').run(license_code || null, event);
  } catch (e) {}
}

// ─── ADMIN ROUTES ─────────────────────────────────────────────

// Generate beta codes
app.post('/api/admin/generate-beta', requireAdmin, (req, res) => {
  const { count = 1, business_name, phone } = req.body;
  const codes = [];

  for (let i = 0; i < Math.min(count, 50); i++) {
    const code = 'RA-BETA-' + randomSegment() + '-' + randomSegment();
    db.prepare(`
      INSERT INTO licenses (code, type, status, business_name, phone)
      VALUES (?, 'beta', 'inactive', ?, ?)
    `).run(code, business_name || null, phone || null);
    codes.push(code);
  }

  res.json({ success: true, codes });
});

// Get all licenses
app.get('/api/admin/licenses', requireAdmin, (req, res) => {
  const licenses = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
  res.json(licenses);
});

// Revoke license
app.post('/api/admin/revoke', requireAdmin, (req, res) => {
  const { code } = req.body;
  db.prepare("UPDATE licenses SET revoked=1, status='revoked' WHERE code=?").run(code.toUpperCase());
  res.json({ success: true });
});

// Extend license
app.post('/api/admin/extend', requireAdmin, (req, res) => {
  const { code, days } = req.body;
  const license = db.prepare('SELECT * FROM licenses WHERE code=?').get(code.toUpperCase());
  if (!license) return res.status(404).json({ error: 'Not found' });

  const base = license.expires_at ? new Date(license.expires_at) : new Date();
  base.setDate(base.getDate() + (days || 7));
  db.prepare("UPDATE licenses SET expires_at=?, status='active', revoked=0 WHERE code=?").run(base.toISOString(), code.toUpperCase());
  res.json({ success: true, new_expiry: base.toISOString() });
});

// Get analytics summary
app.get('/api/admin/analytics', requireAdmin, (req, res) => {
  const events = db.prepare(`
    SELECT license_code, event, COUNT(*) as count
    FROM analytics GROUP BY license_code, event ORDER BY count DESC
  `).all();

  const totals = db.prepare(`
    SELECT event, COUNT(*) as count FROM analytics GROUP BY event ORDER BY count DESC
  `).all();

  const receipts = db.prepare('SELECT COUNT(*) as total FROM receipts').get();

  res.json({ events, totals, total_receipts: receipts.total });
});

// Get feedback
app.get('/api/admin/feedback', requireAdmin, (req, res) => {
  const feedback = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all();
  res.json(feedback);
});

// Stats overview
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const stats = {
    total_licenses: db.prepare("SELECT COUNT(*) as c FROM licenses").get().c,
    active: db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status='active' AND revoked=0").get().c,
    beta: db.prepare("SELECT COUNT(*) as c FROM licenses WHERE type='beta' AND revoked=0").get().c,
    expired: db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status='expired'").get().c,
    revoked: db.prepare("SELECT COUNT(*) as c FROM licenses WHERE revoked=1").get().c,
    total_receipts: db.prepare("SELECT COUNT(*) as c FROM receipts").get().c,
    feedback_count: db.prepare("SELECT COUNT(*) as c FROM feedback").get().c,
  };
  res.json(stats);
});

// APK download (gated — paid/beta only)
app.get('/api/download-apk', (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(403).json({ error: 'License required' });

  const license = db.prepare('SELECT * FROM licenses WHERE code=?').get(code.toUpperCase());
  if (!license || license.revoked || license.status === 'expired') {
    return res.status(403).json({ error: 'Invalid license' });
  }

  logAnalytics(code, 'apk_download');
  // Serve APK file
  const apkPath = path.join(__dirname, 'public', 'ReceiptAgentPro.apk');
  res.download(apkPath, 'ReceiptAgentPro.apk', (err) => {
    if (err) res.status(404).json({ error: 'APK not yet available' });
  });
});

// ─── HELPERS ──────────────────────────────────────────────────
function randomSegment() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`ReceiptAgent Pro running on port ${PORT}`);
});
