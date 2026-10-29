# Company agents in Latchkey

An owner can delegate the existing metadata and reference-request jobs through
one shared Base door at `/mcp`, with native policy and review pages at `/agents`.
The compatible signed-client MCP path is `/api/latchkey/mcp`.

| Tool | Scope | Effect and class | Contract |
| --- | --- | --- | --- |
| `latchkey.posture.read` | `posture:read` | Read the scoped vault revision, epoch and request count; standard | LKY-029, LKY-035 |
| `latchkey.access.requests` | `access:request` | Read this credential's request IDs and states; standard | LKY-029, LKY-035 |
| `latchkey.access.request` | `access:request` | Save exact object, recipient, rights and expiry references; standard | LKY-029, LKY-035 |

A request creates no grant. The enrolled vault owner must decide the exact
request and separately confirm a client-encrypted sharing submission. The real
sharing service validates all key wraps and current grants. Agent preparation
is labelled as the agent for its sponsor; the native owner remains the decision
maker. Client-held keys, plaintext values, item names and secret envelopes never
enter these tools. Do not infer MFA or provider state from posture metadata.

Business tokens resolve the signed owner_id or team id to a current native
operator. An email is never an identity binding; changed-email and unknown
subjects refuse. The operator must be active and must have an enrolled Latchkey
account. A person issues an ordinary device-held vault credential and may bind
its explicit agent ID through `mcp/credential/issue`; `agent` is optional for
existing signed local clients. Current source device, native account generation,
operator version, vault ownership, scopes, expiry and revocation remain live
checks. Business administrator approval references come from the signed team
mapping; a local role promotion does not create a Business editor.

An unset, unanswered, expired, blocked or paused policy causes no agent effect.
Owner approval and review retain the exact server summary and native revision.
Identical keys retain one native request; changed arguments conflict. The native
write also fences concurrent credential, agent, consent and policy changes.

The declared capabilities are tools, policy, pause, audit and idempotency.
Resources, events, prompts and subscriptions return typed capability-not-declared
refusals; they are not advertised as supported. Device enrollment, signing,
decryption and owner fulfillment remain device/screen work. Imports, installation
and webhooks keep their separate import, installation and connector doors.
No standing access/security grant tool is registered, so no widening or native
Undo capability is claimed. The registry declares no provider cost and the
journey declares spend none. No outbound provider is reachable by these tools;
verification replaces only the existing native sign-in mail network edge.

Native schedules and provider changes are not agent tools in this adoption.
Queued continuation, multiple sponsors, timed histories, resource refresh,
provider delivery and brokered secret use remain separate, unproved lifecycle
families. This core adoption does not complete LKY-024, LKY-035, LKY-067 or
LKY-075. Erasure retains its fail-closed unmapped-content protection; this does
not claim safe redaction of retained door decisions. Installation archives
exclude live agent credentials, approvals, policy and Business bindings.
