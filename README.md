# ReceiptAgent Pro

Receipt generation and sales management platform for Ugandan small businesses.

## Stack
- Node.js + Express (backend)
- SQLite via better-sqlite3 (database)
- Plain HTML/CSS/JS (frontend)
- Railway (hosting)

## Local Setup

```bash
npm install
node server.js
```

Open http://localhost:3000

## Admin Dashboard

Go to `/admin.html` — password is set in `ADMIN_PASSWORD` environment variable.

## Environment Variables (set these in Railway)

| Variable | Value |
|---|---|
| `PORT` | 3000 (Railway sets this automatically) |
| `ADMIN_PASSWORD` | Choose a strong password |

## Routes

| Route | Description |
|---|---|
| `/` | License gate (index.html) |
| `/app.html` | Receipt generator |
| `/admin.html` | Admin dashboard |
| `/download.html` | APK download page |
| `POST /api/verify-license` | Verify a license code |
| `POST /api/receipts` | Save a receipt |
| `POST /api/feedback` | Submit feedback |
| `GET /api/admin/stats` | Admin stats |
| `GET /api/admin/licenses` | All licenses |
| `POST /api/admin/generate-beta` | Generate beta codes |
| `POST /api/admin/revoke` | Revoke a license |
| `POST /api/admin/extend` | Extend a license |
| `GET /api/admin/analytics` | Analytics |
| `GET /api/admin/feedback` | All feedback |
