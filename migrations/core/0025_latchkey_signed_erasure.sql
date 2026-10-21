-- Connected clients accept history removal only with the vault owner's
-- independently pinned authority signature. The proof contains no item value.
ALTER TABLE lky_erased_items ADD COLUMN proof TEXT NOT NULL DEFAULT '{}';
