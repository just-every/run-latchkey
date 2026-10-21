-- Edition-owned encrypted product state. No item type, title, field, seed,
-- filename, password, device secret or private decryption key is stored here.
CREATE TABLE lky_accounts (
 id TEXT PRIMARY KEY, operator_id TEXT NOT NULL UNIQUE REFERENCES oa_operators(id),
 tenant TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 1,
 opaque_setup TEXT NOT NULL, opaque_record TEXT NOT NULL,
 recipient_key TEXT NOT NULL, recovery_key TEXT NOT NULL, recovery_wrap TEXT NOT NULL, mutation TEXT NOT NULL
);
CREATE TABLE lky_devices (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES lky_accounts(id),
 public_key TEXT NOT NULL, bundle TEXT NOT NULL, generation INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE lky_exchanges (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT NOT NULL,
 state TEXT NOT NULL, generation INTEGER NOT NULL, operator_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE lky_grants (
 token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES lky_accounts(id),
 device_id TEXT NOT NULL, session_id TEXT NOT NULL, generation INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, recovery INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE lky_nonces (grant_hash TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(grant_hash,nonce));
CREATE TABLE lky_limits (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
CREATE TABLE lky_registrations (
 id TEXT PRIMARY KEY, operator_id TEXT NOT NULL, session_id TEXT NOT NULL,
 tenant TEXT NOT NULL, setup TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE lky_vaults (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL REFERENCES lky_accounts(id),
 epoch INTEGER NOT NULL, revision INTEGER NOT NULL, mutation TEXT NOT NULL
);
CREATE TABLE lky_recipients (
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id), account_id TEXT NOT NULL REFERENCES lky_accounts(id),
 rights TEXT NOT NULL, wrapped_key TEXT NOT NULL, PRIMARY KEY(vault_id,account_id)
);
CREATE TABLE lky_versions (
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id), object_id TEXT NOT NULL,
 version INTEGER NOT NULL, envelope TEXT NOT NULL,
 PRIMARY KEY(vault_id,object_id,version)
);
CREATE TABLE lky_enrollments (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES lky_accounts(id),
 public_key TEXT NOT NULL, transfer_key TEXT NOT NULL, generation INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, approved_wrap TEXT, consumed_at INTEGER, approved_nonce TEXT
);
CREATE TABLE lky_events (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, device TEXT NOT NULL,
 action TEXT NOT NULL, object_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE lky_installation (singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL);
