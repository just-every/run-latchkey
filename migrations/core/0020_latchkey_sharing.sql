-- Only encrypted values and delivery verifiers. URL fragments and passwords
-- never cross the client boundary. Grants are snapshots, not future key grants.
CREATE TABLE lky_sharing_policy (
 tenant TEXT PRIMARY KEY, external_enabled INTEGER NOT NULL DEFAULT 0,
 domains TEXT NOT NULL DEFAULT '[]', default_days INTEGER NOT NULL DEFAULT 7,
 max_days INTEGER NOT NULL DEFAULT 30, mutation TEXT NOT NULL
);
CREATE TABLE lky_share_groups (id TEXT PRIMARY KEY,tenant TEXT NOT NULL,created_by TEXT NOT NULL);
CREATE TABLE lky_share_group_members (
 group_id TEXT NOT NULL REFERENCES lky_share_groups(id),account_id TEXT NOT NULL REFERENCES lky_accounts(id),
 PRIMARY KEY(group_id,account_id)
);
CREATE TABLE lky_shares (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,vault_id TEXT NOT NULL REFERENCES lky_vaults(id),
 source_account TEXT NOT NULL,source_device TEXT NOT NULL,source_generation INTEGER NOT NULL,
 source_operator_version INTEGER NOT NULL,epoch INTEGER NOT NULL,scope TEXT NOT NULL,
 group_id TEXT,rights TEXT NOT NULL,starts_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 approved_at INTEGER,revoked_at INTEGER,created_at INTEGER NOT NULL,mutation TEXT NOT NULL
);
CREATE TABLE lky_share_keys (
 share_id TEXT NOT NULL REFERENCES lky_shares(id),account_id TEXT NOT NULL,
 recipient_generation INTEGER NOT NULL,object_id TEXT NOT NULL,version INTEGER NOT NULL,
 wrapped_key TEXT NOT NULL,PRIMARY KEY(share_id,account_id,object_id)
);
CREATE TABLE lky_links (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,vault_id TEXT NOT NULL REFERENCES lky_vaults(id),
 object_id TEXT NOT NULL,source_version INTEGER NOT NULL,epoch INTEGER NOT NULL,
 source_account TEXT NOT NULL,source_device TEXT NOT NULL,source_generation INTEGER NOT NULL,
 source_operator_version INTEGER NOT NULL,verifier_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,password_required INTEGER NOT NULL,recipient_email TEXT NOT NULL,
 envelope TEXT NOT NULL,starts_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 max_views INTEGER NOT NULL,views INTEGER NOT NULL DEFAULT 0,revoked_at INTEGER,
 created_at INTEGER NOT NULL,mutation TEXT NOT NULL
);
CREATE TABLE lky_link_challenges (
 id TEXT PRIMARY KEY,link_id TEXT NOT NULL REFERENCES lky_links(id),code_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed_at INTEGER
);
CREATE INDEX lky_share_source ON lky_shares(vault_id,created_at);
CREATE INDEX lky_link_source ON lky_links(vault_id,object_id,created_at);
