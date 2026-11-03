-- All Brevo transactional events (SLEE + WP plugins) for deliverability analytics.
-- Replaces bounce_log (0002). Lean on purpose: 2 indexes to keep D1 row-writes low.
CREATE TABLE IF NOT EXISTS email_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  domain     TEXT NOT NULL,      -- recipient domain (gmail.com, yahoo.com…)
  type       TEXT NOT NULL,      -- sent | delivered | deferred | soft_bounce | hard_bounce | invalid_email | blocked | spam | unsubscribed | first_opening | unique_opened | clicked | error
  reason     TEXT,
  message_id TEXT,
  tag        TEXT,               -- Brevo tags; contains "slee" for SLEE mail, else plugin mail
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_email_events_day    ON email_events(created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_domain ON email_events(domain, created_at);

INSERT INTO email_events (email, domain, type, reason, message_id, created_at)
  SELECT email, substr(email, instr(email, '@') + 1), type, reason, message_id, created_at FROM bounce_log;
DROP TABLE IF EXISTS bounce_log;

-- Daily counters (write guard for analytics events).
CREATE TABLE IF NOT EXISTS daily_counters (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);
