-- Independent recover authority is explicit and never part of an archive.
CREATE TABLE lky_recovery_scopes (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, custodian TEXT NOT NULL,
 custodian_generation INTEGER NOT NULL, custodian_version INTEGER NOT NULL, member TEXT NOT NULL,
 member_generation INTEGER NOT NULL, member_version INTEGER NOT NULL, domain TEXT NOT NULL CHECK(domain='company-account'),
 permission TEXT NOT NULL CHECK(permission='accounts.recover'),
 recipient_key TEXT NOT NULL, authority_key TEXT NOT NULL,
 granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL,
 UNIQUE(tenant,custodian,member,domain)
);
CREATE TABLE lky_scoped_recovery_enrollments (
 enrollment TEXT PRIMARY KEY, scope TEXT NOT NULL, policy TEXT NOT NULL
);
