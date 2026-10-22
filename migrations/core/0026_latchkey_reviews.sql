-- Access metadata only. Item values, wraps, link capabilities and provider keys
-- never enter review snapshots or signed evidence.
CREATE TABLE lky_reviews (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,vault_id TEXT NOT NULL,owner TEXT NOT NULL,
 reviewer TEXT NOT NULL,period TEXT NOT NULL,phase TEXT NOT NULL,
 scheduled_at INTEGER NOT NULL,due_at INTEGER NOT NULL,created_at INTEGER NOT NULL,
 as_of INTEGER,policy_version TEXT NOT NULL,snapshot TEXT NOT NULL,
 closed_at INTEGER,package TEXT
);
CREATE TABLE lky_review_rows (
 review_id TEXT NOT NULL,key TEXT NOT NULL,snapshot TEXT NOT NULL,
 reviewer TEXT NOT NULL,decision TEXT,reason TEXT,decided_at INTEGER,
 superseded INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(review_id,key)
);
CREATE TABLE lky_review_reminders (
 review_id TEXT NOT NULL,reviewer TEXT NOT NULL,day INTEGER NOT NULL,
 created_at INTEGER NOT NULL,PRIMARY KEY(review_id,reviewer,day)
);
CREATE TABLE lky_review_guard (value INTEGER NOT NULL CHECK(value=1));
