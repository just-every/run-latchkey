CREATE TABLE lky_export_policies (
 vault_id TEXT PRIMARY KEY REFERENCES lky_vaults(id) ON DELETE CASCADE,
 owner TEXT NOT NULL,
 revision INTEGER NOT NULL,
 allow_plaintext INTEGER NOT NULL CHECK(allow_plaintext IN (0,1)),
 statement TEXT NOT NULL,
 signature TEXT NOT NULL
);
