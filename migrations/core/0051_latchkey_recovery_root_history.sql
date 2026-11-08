-- Remember root-custody constraints without retaining a removed custodian.
-- This is a restriction, never executable recovery authority.
CREATE TABLE lky_recovery_root_history (
 account TEXT PRIMARY KEY, legacy_seen INTEGER NOT NULL DEFAULT 0,
 quorum_seen INTEGER NOT NULL DEFAULT 0
);
INSERT INTO lky_recovery_root_history(account,legacy_seen,quorum_seen)
 SELECT account,1,0 FROM lky_recovery_custody WHERE kind='administrator' GROUP BY account;
INSERT INTO lky_recovery_root_history(account,legacy_seen,quorum_seen)
 SELECT account,0,1 FROM lky_quorum_enrollments GROUP BY account
 ON CONFLICT(account) DO UPDATE SET quorum_seen=1;
