-- Durable, value-free object fences travel with Records. No credential,
-- attachment, key wrap, recipient email or encrypted value belongs here.
CREATE TABLE lky_erased_items (
 vault_id TEXT NOT NULL REFERENCES lky_vaults(id), object_id TEXT NOT NULL,
 tenant TEXT NOT NULL, receipt_id TEXT NOT NULL UNIQUE,
 erased_by TEXT NOT NULL, erased_device TEXT NOT NULL, erased_at INTEGER NOT NULL,
 revision INTEGER NOT NULL, counts TEXT NOT NULL,
 PRIMARY KEY(vault_id,object_id)
);
-- This empty CHECK table makes authority/inventory failures roll back the
-- entire D1 batch, including unconditional Base journal statements.
CREATE TABLE lky_erasure_guard (value INTEGER NOT NULL CHECK(value=1));
CREATE INDEX lky_machine_object ON lky_machines(vault_id,object_id);
CREATE INDEX lky_share_key_object ON lky_share_keys(object_id,share_id);
