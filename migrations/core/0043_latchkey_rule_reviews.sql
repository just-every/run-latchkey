-- A campaign is evidence for one exact obligation, never reusable completion.
CREATE TABLE lky_rule_reviews (
 obligation TEXT PRIMARY KEY REFERENCES lky_rule_obligations(id),
 review_id TEXT NOT NULL UNIQUE,
 binding TEXT NOT NULL, phase TEXT NOT NULL, bound_at INTEGER NOT NULL,
 result TEXT, recorded_at INTEGER
);
