-- Original person identifiers are never retained in these receipts/fences.
-- HMAC custody is the separately held LATCHKEY_ERASURE_SECRET configuration.
CREATE TABLE lky_subject_erasures (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,label TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase='control-plane-erased'),counts TEXT NOT NULL,
 outstanding TEXT NOT NULL,created_at INTEGER NOT NULL,proof TEXT NOT NULL
);
CREATE TABLE lky_subject_fences (
 tenant TEXT NOT NULL,kind TEXT NOT NULL,digest TEXT NOT NULL,
 operation TEXT NOT NULL REFERENCES lky_subject_erasures(id),created_at INTEGER NOT NULL,
 PRIMARY KEY(tenant,kind,digest)
);
CREATE TABLE lky_subject_invalidations (
 tenant TEXT NOT NULL,vault_id TEXT NOT NULL REFERENCES lky_vaults(id),
 operation TEXT NOT NULL REFERENCES lky_subject_erasures(id),epoch INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','rotated')),
 PRIMARY KEY(vault_id,operation)
);
CREATE TABLE lky_subject_audit (
 operation TEXT NOT NULL REFERENCES lky_subject_erasures(id),position INTEGER NOT NULL,
 facts TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL,
 PRIMARY KEY(operation,position)
);
CREATE TABLE lky_subject_guard(value INTEGER NOT NULL CHECK(value=1));
