CREATE TABLE lky_company_custody (
 vault_id TEXT PRIMARY KEY REFERENCES lky_vaults(id) ON DELETE CASCADE,
 owner TEXT NOT NULL, custodian TEXT NOT NULL, epoch INTEGER NOT NULL,
 enrollment TEXT NOT NULL, enrollment_hash TEXT NOT NULL, accepted INTEGER NOT NULL DEFAULT 0
);
