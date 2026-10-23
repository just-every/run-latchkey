-- Each client installation retains its own owner, keys and consent ledger.
CREATE TABLE lky_msp_delegations (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, provider TEXT NOT NULL,
 public_key TEXT NOT NULL, console_origin TEXT NOT NULL, scopes TEXT NOT NULL,
 owner TEXT NOT NULL, device TEXT NOT NULL, generation INTEGER NOT NULL,
 operator_version INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE lky_msp_nonces (
 delegation TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(delegation,nonce)
);
CREATE TABLE lky_msp_previews (
 id TEXT PRIMARY KEY, delegation TEXT NOT NULL, tenant TEXT NOT NULL,
 hash TEXT NOT NULL, before_policy TEXT NOT NULL, after_policy TEXT NOT NULL,
 policy_mutation TEXT, expires_at INTEGER NOT NULL, operation TEXT
);
CREATE TABLE lky_msp_commercial (
 tenant TEXT PRIMARY KEY, owner TEXT NOT NULL, status TEXT NOT NULL,
 reference TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
