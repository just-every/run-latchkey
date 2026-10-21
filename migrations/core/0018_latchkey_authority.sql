-- The encrypted root holds the corresponding private signing key. A separate
-- public anchor authenticates key distribution, including a malicious store.
ALTER TABLE lky_accounts ADD COLUMN authority_key TEXT NOT NULL DEFAULT '';
