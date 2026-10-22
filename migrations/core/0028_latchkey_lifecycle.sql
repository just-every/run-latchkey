ALTER TABLE lky_vaults ADD COLUMN kind TEXT NOT NULL DEFAULT 'company';
ALTER TABLE lky_vaults ADD COLUMN trash_policy TEXT;
-- Restore and delete are independently delegated; inactive imported recipients
-- stay inactive. Existing active owners receive the new owner capabilities.
UPDATE lky_recipients SET rights=json_insert(json_insert(rights,'$[#]','delete'),'$[#]','restore')
 WHERE account_id=(SELECT owner FROM lky_vaults WHERE id=vault_id) AND json_array_length(rights)>0;
CREATE TABLE lky_vault_capabilities (
 vault_id TEXT NOT NULL,account_id TEXT NOT NULL,capability TEXT NOT NULL,
 PRIMARY KEY(vault_id,account_id)
);
CREATE TABLE lky_lifecycle (
 vault_id TEXT NOT NULL,object_id TEXT NOT NULL,state TEXT NOT NULL,
 state_version INTEGER NOT NULL,nonce TEXT NOT NULL,
 trashed_at INTEGER,expires_at INTEGER,proof TEXT,retention_active INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(vault_id,object_id)
);
CREATE TABLE lky_bulk_operations (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,actor TEXT NOT NULL,
 plan TEXT NOT NULL,result TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,
 undone_at INTEGER,created_at INTEGER NOT NULL
);
CREATE TABLE lky_lifecycle_guard (value INTEGER NOT NULL CHECK(value=1));
