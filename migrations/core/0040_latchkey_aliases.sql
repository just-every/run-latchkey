-- Hide-my-email aliases. Addresses and provider tokens never reach this service:
-- an alias address lives in the encrypted login item, a provider token in the
-- authorized person's client. These rows hold the relationship, ownership and
-- provider-reported state that authorize and audit forwarding changes.
CREATE TABLE lky_alias_domains (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,scope TEXT NOT NULL,
 provider TEXT NOT NULL,zone TEXT NOT NULL,domain TEXT NOT NULL,
 provider_status TEXT NOT NULL,routing_enabled INTEGER NOT NULL,observed_at INTEGER NOT NULL,
 active INTEGER NOT NULL,revision INTEGER NOT NULL,
 UNIQUE(tenant,scope,owner,zone)
);
CREATE TABLE lky_alias_mailboxes (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,scope TEXT NOT NULL,
 address TEXT NOT NULL,provider_ref TEXT,verified_at INTEGER,observed_at INTEGER NOT NULL,
 active INTEGER NOT NULL,revision INTEGER NOT NULL,
 UNIQUE(tenant,scope,owner,address)
);
CREATE TABLE lky_aliases (
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,scope TEXT NOT NULL,
 vault_id TEXT NOT NULL,object_id TEXT NOT NULL,domain_id TEXT NOT NULL,mailbox_id TEXT NOT NULL,
 rule_ref TEXT,state TEXT NOT NULL,intent TEXT,next_mailbox TEXT,
 replaces TEXT,replaced_by TEXT,delivery TEXT NOT NULL,failure TEXT,
 revision INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,delivery_reported_at INTEGER
);
CREATE INDEX lky_aliases_object ON lky_aliases(vault_id,object_id);
