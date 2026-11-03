-- Soft-bounce tracking + deliverability flag + bounce log for metrics.
ALTER TABLE contacts ADD COLUMN soft_bounces INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN last_soft_bounce_at TEXT;
ALTER TABLE contacts ADD COLUMN deliverability TEXT NOT NULL DEFAULT 'ok';   -- ok | unreliable
CREATE INDEX IF NOT EXISTS idx_contacts_deliverability ON contacts(deliverability);

-- Every Brevo bounce/complaint event (incl. emails sent by WP plugins, not just SLEE).
CREATE TABLE IF NOT EXISTS bounce_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  type       TEXT NOT NULL,      -- soft_bounce | hard_bounce | spam | unsubscribed | blocked | invalid_email
  reason     TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_bounce_log_email ON bounce_log(email, created_at);
CREATE INDEX IF NOT EXISTS idx_bounce_log_day   ON bounce_log(created_at);
