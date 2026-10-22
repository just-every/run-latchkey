-- Generator policy contains constraints only. Generated values and history
-- remain encrypted in each client and never enter these tables.
CREATE TABLE lky_generator_policies (
 tenant TEXT NOT NULL, scope TEXT NOT NULL, group_id TEXT REFERENCES lky_share_groups(id),
 policy TEXT NOT NULL, mutation TEXT NOT NULL,
 PRIMARY KEY(tenant,scope),
 CHECK((scope='company' AND group_id IS NULL) OR (group_id IS NOT NULL AND scope=group_id))
);
CREATE TABLE lky_generator_policy_changes (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,group_id TEXT,actor TEXT NOT NULL,device TEXT NOT NULL,
 reason TEXT NOT NULL,policy TEXT NOT NULL,created_at INTEGER NOT NULL
);
