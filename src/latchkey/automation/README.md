# Signed security webhooks and MCP

Integrate `automationAuthenticated(route,input,ctx)` after normal signed-human authentication and the existing live fence, before vault-specific fallback. Context is `{db,env,now,actor,device,tenant,session,fence,fenceArgs}`; optional `fetcher` is the network-edge dependency. Add `AutomationError` to the service's safe code/status catch. Only real enrolled human devices pass owner decisions; machines, recovery/enrollment sessions and a bare session cannot approve them.

Call `automationPublic(route,input,{db,env,now,request,raw})` before human-session authentication for `mcp`, `mcp/posture` and `mcp/requestaccess`. It performs its own scoped-machine authentication. It returns null for unrelated routes. For MCP notifications it returns an HTTP `Response` with 202: return that directly, rather than serializing it as JSON. Other results use the service's normal JSON response. Keep the existing origin/host/body bounds. Never log credentials, raw request bodies, private signing keys or signatures.

## MCP scope and exact human approval

The vault owner issues an independent credential through signed-human `mcp/credential/issue` with `{vault,publicKey,scopes,expiresAt,confirmed:true}`. `publicKey` is the external agent's P-256 ECDSA signing key; `scopes` is a nonempty selection of `posture:read` and `access:request`. The result contains `{credential,token,vault,scopes,expiresAt}`. Deliver its one-time random token securely; only a hash is stored. `mcp/credential/revoke {credential}` revokes it. Every call rechecks issuer account generation, active operator/version, current enrolled source device, current ownership of the scoped vault, expiry, signature freshness and nonce replay. Machine rate limit is 60 requests/minute.

`mcpRequest` and `McpClient` sign actual wire requests with `Authorization: Bearer <token>` and the existing `x-latchkey-nonce`, `x-latchkey-time`, `x-latchkey-signature` headers. They do not use or persist a human cookie. The signature uses actual method, full path/query, token, nonce, milliseconds timestamp and digest of the exact raw JSON. The token holder also needs the independently held private signing key.

The `mcp` endpoint implements stateless JSON-RPC 2.0 initialize, ping, tools/list, tools/call and initialized/cancelled notifications using MCP protocol `2025-06-18`. Its only tools are `latchkey_posture` and `latchkey_request_access`. It never exposes approval tools. Direct authenticated equivalents are `mcp/posture {vault}` and `mcp/requestaccess {vault,account,objects,rights,expiresAt}`. Posture returns opaque vault identifiers, revision/epoch, timestamp, request count and explicitly unknown MFA state; never values, key material, envelopes or filenames. Request fields are stable references, with no instruction text or free-form grant expansion.

Access requests capture exact object versions, recipient fingerprint/generation, rights, expiry, vault epoch/revision and a hash. They create **no grant**. Human-owner routes:

- `mcp/requests {}` lists the owner's queue.
- `mcp/ownerpreview {request}` returns the exact captured request.
- `mcp/ownerapprove {request,revision,previewHash,decision:'approve'|'deny',confirmed:true}` records a decision under CAS. Approval still returns `granted:false`.
- `mcp/fulfill {request,revision,shareInput}` only accepts an exact approved selection and delegates to the **real** `sharing/grant` handler with a request/credential/vault gate folded into its transaction fence. It validates every ordinary client key wrap and current sharing policy. It never manufactures a server grant or wraps a key.

`AutomationClient.fulfill(approvedPreview)` uses the existing `SharingClient.grant` cryptographic preparation and routes that actual submission through the approval-bound fulfill door. The generated share ID is claimed to the request so a second share cannot be substituted on a retry. Uncertain outcomes retain the claimed share reference; inspect existing share state before another cryptographic preparation. Request, human decision and fulfillment each produce value-free audit events. Changed vault revision, rotated recipient generation, revoked agent credential or a foreign owner blocks fulfillment. This implements item-scoped internal sharing for an existing tenant recipient, not an invented external-agent vault identity or automatic provisioning workflow.

## Webhooks

Only an installation owner on an enrolled human session may subscribe, rotate, revoke, enqueue or dispatch. The deployment's `LATCHKEY_WEBHOOK_ORIGINS` must be an array (or JSON-encoded array) of approved exact HTTPS receiver origins. There is no permissive default. Endpoint URLs may not contain userinfo, query credentials or fragments; redirects are never followed and remain backlog. This explicit egress boundary prevents the owner-configured sender from becoming a DNS/redirect SSRF proxy. A receiver administrator must provide a 32-byte cryptographically random signing key encoded as unpadded base64url; it is retained as authenticated ciphertext in the dedicated server signing table, bound to tenant, subscription and revision under a key derived from the installation session secret and never returned by status/list. It is not vault decryption material.

- `webhook/list {}` lists own subscriptions without secrets.
- `webhook/subscribe {endpoint,events,secret,confirmed:true}` records owner consent and exact event scopes.
- `webhook/rotate {subscription,revision,secret,confirmed:true}` replaces the key, incrementing revision. There is no old-key overlap.
- `webhook/revoke {subscription,revision}` disables future dispatch and clears the signing key.
- `webhook/status {subscription}` returns subscription and delivery obligations without payloads or keys.
- `webhook/enqueue {subscription,revision,event,confirmed:true}` snapshots one existing account-scoped allowlisted security event produced since subscription. A unique subscription/event pair deduplicates enqueue.
- `webhook/dispatch {subscription,revision,delivery,confirmed:true}` attempts one delivery. The same route explicitly replays backlog or a previously accepted delivery. There is no unattended outbound job in this implementation.

Delivery uses Standard Webhooks headers `webhook-id`, `webhook-timestamp` and `webhook-signature`. HMAC-SHA256 signs `eventId.timestamp.rawBody`; signature is `v1,` plus standard base64. Timestamp is Unix seconds. Payload is `{schema,id,type,occurredAt,scope:{account,events}}`; no credential values, employee names, email, item metadata or key material. The source event ID, body and consumer deduplication key stay stable across attempts; attempt timestamps/signatures change. Scope and issuing account/device/version are checked immediately before dispatch. Rotation/revocation fences the next dispatch; already delivered bytes cannot be recalled.

Semantics are **at least once**. Consumers verify HMAC against raw bytes, enforce a timestamp tolerance, and durably deduplicate event IDs before effects. All non-2xx/network outcomes remain backlog; no response body/raw exception is stored. An interrupted worker's 60-second lease permits explicit replay; a 15-second network timeout bounds an attempt. Do not equate accepted HTTP delivery with consumer business completion. Every attempt retains status and subscription revision independently of the queue.

Primary protocol references: [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [Standard Webhooks specification](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md). This implementation supplies its own cryptographic machine authentication and exact owner approval; it does not claim an OAuth authorization server or unrelated MCP transports.

## Integration obligations

Migration `0030_latchkey_automation.sql` owns the dedicated tables. Register them with the product's existing archive/inactive-restore and subject-erasure lifecycle before claiming full inherited portability/erasure acceptance. Historic subscriptions and MCP credentials must never become active merely by restoring historical rows. The sender signing secret needs the same inactive-authority treatment. Do not claim full LKY-029 solely from these primitives; execute the actual REST, CLI, machine MCP, owner gate and webhook replay journeys.
