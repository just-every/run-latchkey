-- Client-created ciphertext; enrollment is not authorization to transfer.
CREATE TABLE lky_company_custody (
 vault_id TEXT PRIMARY KEY REFERENCES lky_vaults(id), tenant TEXT NOT NULL,
 owner TEXT NOT NULL, custodian TEXT NOT NULL, epoch INTEGER NOT NULL,
 generation INTEGER NOT NULL, wrapped TEXT NOT NULL, enrolled_at INTEGER NOT NULL
);
CREATE TABLE lky_custody_reviews (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, actor TEXT NOT NULL,
 operation TEXT NOT NULL, action TEXT NOT NULL, plan TEXT NOT NULL,
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
