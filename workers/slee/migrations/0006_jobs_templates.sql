-- One-off admin jobs run by the cron (results readable in D1), and a cache of Brevo email templates.
CREATE TABLE IF NOT EXISTS slee_jobs (job TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending', params TEXT, result TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), done_at TEXT);
CREATE TABLE IF NOT EXISTS brevo_templates (id INTEGER PRIMARY KEY, name TEXT, subject TEXT, is_active INTEGER, modified_at TEXT,
  sender TEXT, html TEXT, fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
