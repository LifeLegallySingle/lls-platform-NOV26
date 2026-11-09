-- Track ALL Brevo email (transactional + marketing campaigns) in SLEE.
ALTER TABLE email_events ADD COLUMN channel TEXT NOT NULL DEFAULT 'transactional';  -- transactional | marketing
ALTER TABLE email_events ADD COLUMN campaign TEXT;                                  -- Brevo campaign id
ALTER TABLE email_events ADD COLUMN campaign_name TEXT;
ALTER TABLE email_events ADD COLUMN url TEXT;                                       -- clicked link (marketing)
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign);
