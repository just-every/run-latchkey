-- Opaque scope identifiers only. Catalogs, paths and values remain encrypted
-- in client-produced lky_versions envelopes; runtime profiles never arrive here.
CREATE TABLE lky_projects (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,vault_id TEXT NOT NULL REFERENCES lky_vaults(id),
 owner TEXT NOT NULL,metadata_object TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE TABLE lky_project_environments (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES lky_projects(id),
 catalog_object TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE TABLE lky_project_resources (
 id TEXT PRIMARY KEY,environment_id TEXT NOT NULL REFERENCES lky_project_environments(id),
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id),object_id TEXT NOT NULL,
 UNIQUE(vault_id,object_id)
);
CREATE TABLE lky_runtime_grants (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,account_id TEXT NOT NULL,device_id TEXT NOT NULL,
 machine_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,public_key TEXT NOT NULL,
 recipient_key TEXT NOT NULL,authority_key TEXT NOT NULL,generation INTEGER NOT NULL,
 operator_version INTEGER NOT NULL,expires_at INTEGER NOT NULL,max_uses INTEGER,
 uses INTEGER NOT NULL DEFAULT 0,revoked_at INTEGER,created_at INTEGER NOT NULL
);
CREATE TABLE lky_runtime_scopes (
 id TEXT PRIMARY KEY,grant_id TEXT NOT NULL REFERENCES lky_runtime_grants(id),
 kind TEXT NOT NULL CHECK(kind IN ('project','field')),vault_id TEXT NOT NULL,
 object_id TEXT NOT NULL,epoch INTEGER NOT NULL,project_id TEXT,environment_id TEXT,
 path_hash TEXT NOT NULL,can_read INTEGER NOT NULL,can_write INTEGER NOT NULL,
 wrapped_key TEXT NOT NULL,payload TEXT,source_version INTEGER,
 UNIQUE(grant_id,kind,vault_id,object_id,path_hash)
);
CREATE TABLE lky_runtime_dependencies (
 grant_id TEXT NOT NULL REFERENCES lky_runtime_grants(id),vault_id TEXT NOT NULL,
 object_id TEXT NOT NULL,epoch INTEGER NOT NULL,version INTEGER NOT NULL,
 PRIMARY KEY(grant_id,vault_id,object_id)
);
CREATE TABLE lky_runtime_guard(value INTEGER NOT NULL CHECK(value=1));
CREATE INDEX lky_runtime_scope_object ON lky_runtime_scopes(vault_id,object_id);
CREATE INDEX lky_runtime_dependency_object ON lky_runtime_dependencies(vault_id,object_id);
