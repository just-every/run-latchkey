-- Destination credentials stay in the authorized owner's client, never here.
CREATE TABLE lky_evidence_destinations (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,
 destination TEXT NOT NULL,endpoint TEXT NOT NULL,target TEXT NOT NULL,
 workspace TEXT,active INTEGER NOT NULL,revision INTEGER NOT NULL,
 UNIQUE(tenant,owner,destination)
);
CREATE TABLE lky_evidence_deliveries (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,
 review_id TEXT NOT NULL,destination_id TEXT NOT NULL,destination_revision INTEGER NOT NULL,
 package_hash TEXT NOT NULL,source_timestamp INTEGER NOT NULL,
 phase TEXT NOT NULL,provider_reference TEXT,retryable INTEGER NOT NULL,
 status INTEGER,stage TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
