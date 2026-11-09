-- SLEE is the single point of entry; Brevo receives a secondary copy FROM SLEE.
CREATE TABLE IF NOT EXISTS brevo_lists (
  source     TEXT PRIMARY KEY,          -- blueprint | site_optin | self_love_glow_letters | power_move_optin | sah_quiz | glotype | freedom_tax
  list_id    INTEGER NOT NULL,
  name       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE feedback_outbox ADD COLUMN target TEXT NOT NULL DEFAULT 'hub';   -- hub | brevo
ALTER TABLE contacts ADD COLUMN brevo_synced_at TEXT;
ALTER TABLE contacts ADD COLUMN brevo_error TEXT;
