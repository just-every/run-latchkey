CREATE TABLE lky_automation_guard (valid INTEGER NOT NULL CHECK(valid=1));
CREATE TABLE lky_mcp_credentials (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL,
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id), token_hash TEXT NOT NULL UNIQUE,
 public_key TEXT NOT NULL, scopes TEXT NOT NULL, source_device TEXT NOT NULL,
 generation INTEGER NOT NULL, operator_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, revoked_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE lky_mcp_requests (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,credential_id TEXT NOT NULL,
 owner TEXT NOT NULL,vault_id TEXT NOT NULL,account_id TEXT NOT NULL,
 recipient_generation INTEGER NOT NULL,fingerprint TEXT NOT NULL,
 objects TEXT NOT NULL,rights TEXT NOT NULL,expires_at INTEGER NOT NULL,
 epoch INTEGER NOT NULL,vault_revision INTEGER NOT NULL,preview_hash TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('pending','approved','denied','fulfilled')),
 revision INTEGER NOT NULL,created_at INTEGER NOT NULL,decided_at INTEGER,share_id TEXT
);
CREATE INDEX lky_mcp_requests_owner ON lky_mcp_requests(tenant,owner,created_at,id);
CREATE TABLE lky_webhook_subscriptions (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,endpoint TEXT NOT NULL,
 events TEXT NOT NULL,secret TEXT NOT NULL,source_device TEXT NOT NULL,
 generation INTEGER NOT NULL,operator_version INTEGER NOT NULL,
 revision INTEGER NOT NULL,active INTEGER NOT NULL,created_at INTEGER NOT NULL
);
CREATE TABLE lky_webhook_deliveries (
 id TEXT PRIMARY KEY,subscription_id TEXT NOT NULL REFERENCES lky_webhook_subscriptions(id),
 event_id TEXT NOT NULL,payload TEXT NOT NULL,phase TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,
 status INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 UNIQUE(subscription_id,event_id)
);
CREATE TABLE lky_webhook_attempts (
 id TEXT PRIMARY KEY,delivery_id TEXT NOT NULL REFERENCES lky_webhook_deliveries(id),
 subscription_revision INTEGER NOT NULL,started_at INTEGER NOT NULL,
 completed_at INTEGER,status INTEGER,outcome TEXT NOT NULL
);
