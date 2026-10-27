CREATE TABLE lky_health_suppressions (
 id TEXT PRIMARY KEY,
 tenant TEXT NOT NULL,
 actor TEXT NOT NULL REFERENCES lky_accounts(id),
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id),
 object_id TEXT NOT NULL,
 item_version INTEGER NOT NULL,
 generation INTEGER NOT NULL,
 epoch INTEGER NOT NULL,
 code TEXT NOT NULL,
 until_at INTEGER,
 wrapped TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 source_revision INTEGER NOT NULL,
 sequence INTEGER NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1))
);
CREATE UNIQUE INDEX lky_health_sequence ON lky_health_suppressions(tenant,actor,vault_id,sequence);
CREATE INDEX lky_health_actor ON lky_health_suppressions(tenant,actor,vault_id);
