-- SLEE schema v1. Timestamps are ISO-8601 UTC strings (lexicographically comparable).
CREATE TABLE IF NOT EXISTS contacts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  hub_id        TEXT,
  firstname     TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}',          -- additive merge of every HUB attribute (mirrors HUB array_merge)
  sah_score     INTEGER,
  sah_tier      TEXT,                                -- TRUE | MOSTLY | SOME | NOT
  glotype       TEXT,
  power_move    TEXT,
  cia_tier      TEXT NOT NULL DEFAULT 'COLD',        -- COLD | WARM | HOT | CHAMPION
  cohort        TEXT,                                -- legacy cohort / wave label for imported contacts
  quality       TEXT NOT NULL DEFAULT 'ok',          -- ok | bot | suspect
  identify_qs   TEXT,                                -- HUB identity-restore query string (refreshed on every HUB event)
  status        TEXT NOT NULL DEFAULT 'active',      -- active | unsubscribed | bounced | complained | suppressed
  clicks        INTEGER NOT NULL DEFAULT 0,
  last_click_at TEXT,
  last_sent_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_hub    ON contacts(hub_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_cohort ON contacts(cohort);

CREATE TABLE IF NOT EXISTS events (
  event_id    TEXT PRIMARY KEY,                      -- idempotency key
  contact_id  INTEGER,
  type        TEXT NOT NULL,
  signals     TEXT,
  source      TEXT,
  payload     TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_contact ON events(contact_id, received_at);

CREATE TABLE IF NOT EXISTS enrollments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  INTEGER NOT NULL,
  sequence    TEXT NOT NULL,
  step        INTEGER NOT NULL DEFAULT 0,
  next_at     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',        -- active | completed | exited
  exit_reason TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(contact_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_enroll_due ON enrollments(status, next_at);

CREATE TABLE IF NOT EXISTS sends (
  id            TEXT PRIMARY KEY,
  contact_id    INTEGER NOT NULL,
  enrollment_id INTEGER,
  sequence      TEXT,
  step          INTEGER,
  template      TEXT NOT NULL,
  subject       TEXT,
  provider_id   TEXT,
  status        TEXT NOT NULL,                       -- sent | dry_run | failed
  error         TEXT,
  sent_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sends_contact ON sends(contact_id);
CREATE INDEX IF NOT EXISTS idx_sends_day     ON sends(sent_at);
CREATE INDEX IF NOT EXISTS idx_sends_provider ON sends(provider_id);

CREATE TABLE IF NOT EXISTS clicks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  send_id    TEXT,
  contact_id INTEGER,
  url        TEXT,
  clicked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_clicks_contact ON clicks(contact_id);

CREATE TABLE IF NOT EXISTS suppressions (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,                          -- unsubscribed | bounced | complained | bot | suspect | sunset | manual
  source     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- SLEE -> HUB engagement feedback, retried until Lightsail/WordPress accepts it.
CREATE TABLE IF NOT EXISTS feedback_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  payload    TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  next_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON feedback_outbox(next_at);
