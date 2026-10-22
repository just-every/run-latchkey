ALTER TABLE lky_evidence_destinations ADD COLUMN max_age_seconds INTEGER NOT NULL DEFAULT 86400;
ALTER TABLE lky_evidence_deliveries ADD COLUMN signed_package TEXT;
CREATE TABLE lky_evidence_sources (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL,
 vault_id TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL,
 source_timestamp INTEGER NOT NULL, created_at INTEGER NOT NULL, active INTEGER NOT NULL
);
CREATE TABLE lky_evidence_deletions (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL,
 delivery_id TEXT UNIQUE, source_id TEXT, destination TEXT NOT NULL,
 provider_reference TEXT NOT NULL, request_reference TEXT NOT NULL,
 state TEXT NOT NULL, confirmation_reference TEXT,
 requested_at INTEGER NOT NULL, confirmed_at INTEGER
);
