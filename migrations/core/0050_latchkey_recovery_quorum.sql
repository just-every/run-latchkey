-- Fresh two-person custody is separate from legacy administrator envelopes.
CREATE TABLE lky_quorum_policies (
 account TEXT PRIMARY KEY, tenant TEXT NOT NULL, generation INTEGER NOT NULL,
 revision INTEGER NOT NULL, change_id TEXT NOT NULL, custodians TEXT NOT NULL
);
CREATE TABLE lky_quorum_changes (
 id TEXT PRIMARY KEY, account TEXT NOT NULL, tenant TEXT NOT NULL,
 generation INTEGER NOT NULL, base_revision INTEGER NOT NULL,
 custodians TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE lky_quorum_votes (
 change_id TEXT NOT NULL, approver TEXT NOT NULL, authority TEXT NOT NULL,
 PRIMARY KEY(change_id,approver)
);
CREATE TABLE lky_quorum_enrollments (
 id TEXT PRIMARY KEY, account TEXT NOT NULL, tenant TEXT NOT NULL,
 generation INTEGER NOT NULL, revision INTEGER NOT NULL, policy_id TEXT NOT NULL,
 payload TEXT NOT NULL, shares TEXT NOT NULL, revoked_at INTEGER
);
CREATE TABLE lky_quorum_cases (
 id TEXT PRIMARY KEY, statement TEXT NOT NULL
);
CREATE TABLE lky_quorum_approvals (
 case_id TEXT NOT NULL, custodian TEXT NOT NULL, wrapped TEXT NOT NULL,
 PRIMARY KEY(case_id,custodian)
);
CREATE TRIGGER lky_quorum_family_insert BEFORE INSERT ON lky_recipients
WHEN EXISTS(SELECT 1 FROM lky_vaults WHERE id=NEW.vault_id AND kind='family')
 AND EXISTS(SELECT 1 FROM lky_quorum_enrollments e JOIN lky_accounts a ON a.id=e.account WHERE e.account=NEW.account_id AND e.generation=a.generation AND e.revoked_at IS NULL)
BEGIN SELECT RAISE(ABORT,'independent_family_account_required'); END;
CREATE TRIGGER lky_quorum_family_update BEFORE UPDATE ON lky_recipients
WHEN EXISTS(SELECT 1 FROM lky_vaults WHERE id=NEW.vault_id AND kind='family')
 AND EXISTS(SELECT 1 FROM lky_quorum_enrollments e JOIN lky_accounts a ON a.id=e.account WHERE e.account=NEW.account_id AND e.generation=a.generation AND e.revoked_at IS NULL)
BEGIN SELECT RAISE(ABORT,'independent_family_account_required'); END;
CREATE TRIGGER lky_quorum_family_kind BEFORE UPDATE OF kind ON lky_vaults
WHEN NEW.kind='family' AND EXISTS(SELECT 1 FROM lky_recipients r JOIN lky_quorum_enrollments e ON e.account=r.account_id JOIN lky_accounts a ON a.id=e.account WHERE r.vault_id=NEW.id AND e.generation=a.generation AND e.revoked_at IS NULL)
BEGIN SELECT RAISE(ABORT,'independent_family_account_required'); END;
