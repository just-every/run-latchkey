CREATE TABLE lky_checkouts (
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id),
 object_id TEXT NOT NULL,
 id TEXT NOT NULL UNIQUE,
 holder TEXT NOT NULL REFERENCES lky_accounts(id),
 version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(vault_id, object_id)
);
