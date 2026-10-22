-- Destination-local approval capabilities never travel through Records.
CREATE TABLE lky_restore_preparations (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, tenant TEXT NOT NULL,
 import_id TEXT NOT NULL, plan_hash TEXT NOT NULL, approval_hash TEXT NOT NULL,
 plan TEXT NOT NULL, approval TEXT NOT NULL, expires_at INTEGER NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('prepared','activated')),
 prepared_at INTEGER NOT NULL, activated_at INTEGER, activation TEXT,
 UNIQUE(actor,plan_hash,approval_hash)
);
CREATE TABLE lky_restore_guard (value INTEGER NOT NULL CHECK(value=1));
-- Durable operation history contains no approval signature or usable wrap.
CREATE TABLE lky_restore_history (
 restore_id TEXT PRIMARY KEY, source_identity TEXT NOT NULL,
 content_hash TEXT NOT NULL, archive_hash TEXT NOT NULL,
 source_account TEXT NOT NULL, destination_account TEXT NOT NULL,
 plan_hash TEXT NOT NULL, vaults TEXT NOT NULL, activation TEXT NOT NULL,
 activated_at INTEGER NOT NULL
);
