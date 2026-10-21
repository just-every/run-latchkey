CREATE TABLE lky_password_changes (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES lky_accounts(id),
 device_id TEXT NOT NULL, generation INTEGER NOT NULL, setup TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE lky_machines (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, account_id TEXT NOT NULL REFERENCES lky_accounts(id),
 device_id TEXT NOT NULL, generation INTEGER NOT NULL, operator_version INTEGER NOT NULL,
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id), object_id TEXT NOT NULL, epoch INTEGER NOT NULL,
 public_key TEXT NOT NULL, recipient_key TEXT NOT NULL, wrapped_key TEXT NOT NULL,
 expires_at INTEGER NOT NULL, revoked_at INTEGER, mutation TEXT NOT NULL
);
