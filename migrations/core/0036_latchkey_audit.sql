-- Authenticated facts are separate from identity-bearing retained details.
CREATE TABLE lky_audit_chain (
 tenant TEXT NOT NULL, sequence INTEGER NOT NULL, id TEXT NOT NULL UNIQUE,
 previous_hash TEXT NOT NULL, commitment TEXT NOT NULL, hash TEXT NOT NULL,
 PRIMARY KEY(tenant,sequence)
);
CREATE TABLE lky_audit_details (
 id TEXT PRIMARY KEY, facts TEXT, disposition TEXT, authorization TEXT
);
CREATE TABLE lky_admin_permissions (
 tenant TEXT NOT NULL, account TEXT NOT NULL, permission TEXT NOT NULL,
 granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL,
 PRIMARY KEY(tenant,account,permission)
);
CREATE TABLE lky_people_batches (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, actor TEXT NOT NULL,
 preview_hash TEXT NOT NULL, result TEXT
);
CREATE TABLE lky_people_offboarding (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,account TEXT NOT NULL,operator TEXT NOT NULL,
 custodian TEXT NOT NULL,started_at INTEGER NOT NULL,status TEXT NOT NULL,
 handback TEXT NOT NULL,coverage TEXT NOT NULL,UNIQUE(tenant,account)
);
CREATE TABLE lky_people_exposures (
 operation TEXT NOT NULL,vault TEXT NOT NULL,item TEXT NOT NULL,evidence TEXT NOT NULL,
 custodian TEXT NOT NULL,criticality TEXT NOT NULL,rotation TEXT NOT NULL,
 PRIMARY KEY(operation,vault,item)
);
