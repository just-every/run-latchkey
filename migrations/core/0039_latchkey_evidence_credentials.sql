-- Only owner-signed ciphertext is retained; no provider token reaches the service.
ALTER TABLE lky_evidence_destinations ADD COLUMN credential TEXT;
ALTER TABLE lky_evidence_destinations ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0;
