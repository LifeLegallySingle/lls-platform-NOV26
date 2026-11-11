-- Approximate country (2-letter, from Cloudflare at signup or on email click). No IP addresses are stored.
ALTER TABLE contacts ADD COLUMN country TEXT;
ALTER TABLE contacts ADD COLUMN country_source TEXT;   -- signup | click
ALTER TABLE contacts ADD COLUMN country_at TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(country);
