-- Owner-encrypted observations are data, never active authority.
CREATE TABLE lky_report_keys (
 vault_id TEXT PRIMARY KEY REFERENCES lky_vaults(id),
 owner TEXT NOT NULL,
 wrapped TEXT NOT NULL
);
CREATE TABLE lky_report_observations (
 id TEXT PRIMARY KEY,
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id),
 day TEXT NOT NULL,
 as_of INTEGER NOT NULL,
 source_revision INTEGER NOT NULL,
 envelope TEXT NOT NULL,
 UNIQUE(vault_id,day)
);
