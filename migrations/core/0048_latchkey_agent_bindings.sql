-- Business agents reuse the exact native, device-held vault grant.
CREATE TABLE lky_agent_bindings (
 agent_id TEXT PRIMARY KEY, credential_id TEXT NOT NULL REFERENCES lky_mcp_credentials(id)
);
CREATE TABLE lky_agent_requests (
 request_id TEXT PRIMARY KEY REFERENCES lky_mcp_requests(id), agent_id TEXT NOT NULL,
 sponsor_id TEXT NOT NULL, operation_id TEXT NOT NULL UNIQUE, consent TEXT, attribution TEXT NOT NULL
);
