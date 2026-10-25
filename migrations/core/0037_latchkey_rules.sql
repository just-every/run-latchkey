-- Rules retain immutable versions and decisions; scheduling never carries keys.
CREATE TABLE lky_rules (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL,
 version INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE TABLE lky_rule_versions (
 rule_id TEXT NOT NULL REFERENCES lky_rules(id), version INTEGER NOT NULL,
 definition TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(rule_id,version)
);
CREATE TABLE lky_rule_runs (
 id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES lky_rules(id),
 version INTEGER NOT NULL, slot INTEGER NOT NULL, state TEXT NOT NULL,
 created_at INTEGER NOT NULL, UNIQUE(rule_id,version,slot)
);
CREATE TABLE lky_rule_obligations (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES lky_rule_runs(id),
 object_id TEXT NOT NULL, recipient TEXT NOT NULL, source_version INTEGER NOT NULL,
 phase TEXT NOT NULL, result_version INTEGER, created_at INTEGER NOT NULL,
 UNIQUE(run_id,object_id,recipient)
);
CREATE TABLE lky_rule_decisions (
 id TEXT PRIMARY KEY, obligation TEXT NOT NULL REFERENCES lky_rule_obligations(id),
 actor TEXT NOT NULL, decision TEXT NOT NULL, created_at INTEGER NOT NULL
);
