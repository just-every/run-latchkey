-- Recovery custody is explicit, generation-bound and excluded from archives.
CREATE TABLE lky_recovery_custody (
 id TEXT PRIMARY KEY, account TEXT NOT NULL, generation INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('self','administrator')),
 custodian TEXT, custodian_generation INTEGER, wrapped TEXT NOT NULL,
 revoked_at INTEGER
);
CREATE TABLE lky_recovery_cases (
 id TEXT PRIMARY KEY, enrollment TEXT NOT NULL, account TEXT NOT NULL,
 generation INTEGER NOT NULL, session_id TEXT NOT NULL, setup TEXT NOT NULL,
 transfer_key TEXT NOT NULL, expires_at INTEGER NOT NULL,
 approved_wrap TEXT, consumed_at INTEGER
);
CREATE TABLE lky_emergency_access (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL, contact TEXT NOT NULL,
 owner_generation INTEGER NOT NULL, contact_generation INTEGER NOT NULL,
 vault TEXT NOT NULL, epoch INTEGER NOT NULL, wrapped TEXT NOT NULL,
 wait_ms INTEGER NOT NULL CHECK(wait_ms>0), expires_at INTEGER NOT NULL,
 requested_at INTEGER, cancelled_at INTEGER
);
-- All present and future family-recipient doors share the custody boundary.
CREATE TRIGGER lky_recovery_family_recipient_insert BEFORE INSERT ON lky_recipients
WHEN EXISTS(SELECT 1 FROM lky_vaults WHERE id=NEW.vault_id AND kind='family')
 AND EXISTS(SELECT 1 FROM lky_recovery_custody e JOIN lky_accounts a ON a.id=e.account WHERE e.account=NEW.account_id AND e.kind='administrator' AND e.revoked_at IS NULL AND e.generation=a.generation)
BEGIN SELECT RAISE(ABORT,'independent_family_account_required'); END;
CREATE TRIGGER lky_recovery_family_recipient_update BEFORE UPDATE ON lky_recipients
WHEN EXISTS(SELECT 1 FROM lky_vaults WHERE id=NEW.vault_id AND kind='family')
 AND EXISTS(SELECT 1 FROM lky_recovery_custody e JOIN lky_accounts a ON a.id=e.account WHERE e.account=NEW.account_id AND e.kind='administrator' AND e.revoked_at IS NULL AND e.generation=a.generation)
BEGIN SELECT RAISE(ABORT,'independent_family_account_required'); END;
CREATE TRIGGER lky_recovery_family_vault_update BEFORE UPDATE OF kind ON lky_vaults
WHEN NEW.kind='family' AND EXISTS(SELECT 1 FROM lky_recipients r JOIN lky_recovery_custody e ON e.account=r.account_id JOIN lky_accounts a ON a.id=e.account WHERE r.vault_id=NEW.id AND e.kind='administrator' AND e.revoked_at IS NULL AND e.generation=a.generation)
BEGIN SELECT RAISE(ABORT,'independent_family_account_required'); END;
