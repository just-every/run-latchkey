-- Owner-observed company expiry counts; no values, titles or expiry dates.
CREATE TABLE lky_msp_captures (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, vault TEXT NOT NULL,
 owner TEXT NOT NULL, device TEXT NOT NULL, generation INTEGER NOT NULL,
 operator_version INTEGER NOT NULL, epoch INTEGER NOT NULL, revision INTEGER NOT NULL,
 observed_at INTEGER NOT NULL, total_active_items INTEGER NOT NULL,
 with_expiry INTEGER NOT NULL, expired_count INTEGER NOT NULL, active INTEGER NOT NULL,
 UNIQUE(tenant,vault)
);
