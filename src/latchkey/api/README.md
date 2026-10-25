# Version 1 administration API

The public description is `GET /api/latchkey/v1/openapi.json`. `catalogue.mjs` maps REST resources to existing canonical handlers; `metadata.mjs` only adds authorized metadata listings. Neither module admits a session, unwraps a key, creates a replacement grant path, or accepts plaintext items. Encryption, policy proofs, stable identifiers, tenant/role checks, live authority and revision checks remain in the original handlers. API requests use the current OPAQUE-admitted operator session and short-lived grant, not a new administrative bearer key.

## Required integration

Call `apiRequest(request, dispatch)` before the legacy route parser. Its callback receives the **unchanged wire request** and `{route,input,raw,signatureMethod,signaturePath,pagination,definition}`. The service must validate origin/host and authenticate its ordinary session, grant, enrolled device, generation and replay nonce. Verify `signingText(meta.signatureMethod, meta.signaturePath, token, nonce, time, digest(meta.raw))`; only after that use `meta.route` and `meta.input` for the existing canonical handler. `signaturePath` includes the complete query string. GET signs an empty raw body. Never verify a reconstructed POST body/path or remove query parameters before signature verification.

For REST metadata only, bypass the legacy POST/content-type/body parsing checks because `apiRequest` already bounds and parses the actual wire input; retain all origin/session/device checks. Add `ApiError` to the existing safe error catch. Once actor/tenant are authenticated, call `rateApi(ctx)` for REST requests (120 per minute per tenant/account); the wrapper adds `Retry-After: 60` on a 429. Call `apiAuthenticated(route,input,ctx)` with the same live fence context as other edition handlers, plus `ctx.auth` and the original `ctx.request`. It returns null for other domains. Existing handlers still execute every mutation. Do not recursively send a newly signed internal HTTP request.

## Clients and CLI

`new ApiClient(unlockedVaultClient)` sends actual REST requests with signatures over the actual method, path/query and body. `requestApi` is its generic wire primitive. `invokeApi` is an optional direct canonical command adapter using the existing client's signed POST door, with the same page formatting. `apiCommand(client,{command,...pathIds,body,limit,cursor,ifMatch})` sends actual REST. It also accepts `{method,path,body,ifMatch}`. The exported `commands` catalogue contains all supported domain commands. Feed secret-bearing input through protected stdin; never a process argument or environment dump. Output from encrypted REST item routes is ciphertext; explicit client decryption is a separate authority-bearing action.

Collections accept `limit` (1–200, default 50) and an opaque `cursor`; responses are `{data,nextCursor}`. Encrypted item and environment collections also include `context` with the canonical handler's surrounding metadata. Cursors bind the canonical route and filter, use lexicographic stable IDs and preserve the first page's upper bound. This is a monotonic scan, not an immutable transactional snapshot: concurrent additions/deletions may be absent; start a fresh scan to reconcile changes. Audit is bounded by the canonical audit handler's current 1,000-event window. Authorization is re-evaluated for every page.

Conditional item/share/rotation writes require their ordinary signed body `revision`; item writes also require the next object `version`. An optional quoted numeric `If-Match` must agree with body revision; disagreement yields 412. A concurrent canonical revision conflict remains 409. Never fetch and silently replace the caller's stale revision. Other useful errors include 400 malformed input, 401 expired authentication, 403 denied authority, 404 foreign/unknown resource, 409 replay or changed state, 413 body size and 429 rate limit. Errors return `{error:<stable_code>}` without request contents.

## Actual capability boundaries

- Users list, lookup, invitation, role/status changes and cancellation reuse the public OperatorAuth methods. User IDs are operator IDs; `/directory/{account}` separately looks up a cryptographic account. Existing role policy, fresh owner proof, last-owner protection and version/session invalidation remain in Base. User transitions are atomic against Base's current observed target version; the API does not claim a caller-supplied expected-version precondition for these methods. Item CAS supplies the published conditional-write flow. Inviting a user does not enroll decryption keys or grant a vault.
- Group create/read/membership update reuse sharing management. Membership updates retain its existing behavior; they do not acquire a new CAS guarantee from the REST wrapper.
- Vault creation requires client wraps, explicit vault kind and the existing signed retention policy. Encrypted item updates and project catalog updates use existing revision CAS.
- Projects and environments contain opaque scope references; their names, catalogs and values remain encrypted item envelopes. Project metadata changes therefore use conditional encrypted item writes, not a plaintext server project store.
- Imports and operation status expose the existing reviewed archive preparation/activation/status lifecycle. This is not an implemented incumbent-provider importer or a universal operation inventory.
- Policies expose the implemented sharing and password-generator policy handlers. Unimplemented policy domains remain unimplemented.
- Webhooks and owner access-request actions delegate the automation handlers. MCP machine credentials never authorize these human REST doors.

These boundaries must remain visible in clause evidence; an OpenAPI document alone does not establish execution of user-administration or import behavior.

Review administration also exposes the existing assigned-reviewer lookup, exact row assignment, reconciliation, overdue reminder, effective-removal and signed-package verification handlers. The CLI commands are `reviews.reviewers`, `reviews.assign`, `reviews.reconcile`, `reviews.remind`, `reviews.remove` and `reviews.verify-package`. Direct-recipient removal still requires the owner client to perform its cryptographic vault rotation; the metadata removal endpoint cannot unwrap keys or replace that ceremony.

## Authenticated activity and manual people foundations

The activity commands are `activity.query`, `activity.csv`, `activity.checkpoint`,
`activity.verify`, `activity.retention` and `activity.expire`. Query and CSV bodies
contain `filters`, numeric `after` (initially zero) and `limit` (at most 200).
The response's `next` is the next sequence position, or null. Each page rechecks
owner authority. Filters are `person`, `serviceIdentity`, `agent`, `vault`,
`item`, `action`, `device`, `ip`, `from` and `to`; dates are epoch milliseconds.
Machine, agent and offline coverage remains absent, even though these filters
accept those fields. The earlier Events resource remains its legacy actor-local
1,000-row window. The new activity resource has sequence pagination across all
retained connected request facts.

Save checkpoint responses outside the installation, then submit the complete
checkpoint to `activity.verify`. Verification detects modified facts, removed
or reordered chain entries and truncation against that held checkpoint. HMAC
keys derive from the installation session secret with a separate audit domain;
retain that secret for verification. Key rotation and external anchoring services
are not implemented. Signed commitments contain no actor or target identifiers.
Identifying details are separate and person erasure replaces them with an
authenticated disposition. Audit data and live administrative rights are excluded
from installation archives; a restored installation starts a separate trail.

Current instrumentation covers admitted connected human requests after device
signature and nonce verification. It records intent before the product handler
and outcome afterward. A crash between the mutation and outcome leaves an
attempt without a claimed success. This is not an atomic mutation receipt.
Authentication and recovery before this admission point, subject erasure itself,
public recipient use, machine reads and MCP public requests retain their existing
logs and are not claimed as authenticated-chain coverage. Permission categories
are recorded; full policy versions are explicitly unrecorded. Facts contain no
request body, URL, item values, CSV content or provider response. Querying the
trail does not itself append another event. The activity console, anomaly rules,
signed offline evidence and named SIEM adapters are not implemented.

The retention door describes the 365-day explicit expiry threshold and its
consequences. Expiry requires owner confirmation and removes at most 200 old
identifying detail rows per call, retaining signed anonymized commitments.
Automatic expiry and extension are not implemented. List results are not an
integrity attestation: verify with an independently held checkpoint.

`admin.set-permissions` requires an owner, a target cryptographic `account`, an
explicit `confirmed: true` and an exact `permissions` array. Its rights are
`people.read`, `people.invite`, `people.suspend` and `people.offboard`. They grant
no vault key, item right, role change, settings or provider authority. Non-owner
administrative roles do not imply these rights. Base still enforces current
sessions, invitation integrity, role boundaries and last-owner protections.

`people.preview` accepts CSV with exactly `email` and `displayName` headers and
at most 100 rows. It identifies invalid, duplicate and existing addresses before
sending anything. `people.invite` requires the CSV, the current `previewHash`
and explicit confirmation. Both independent read and invite rights are required;
Base checks invite authority for each row. Results distinguish accepted requests,
refusals and skipped rows. Acceptance is not proof of mailbox delivery. A claimed
batch is never automatically resent after interruption; reconciliation is manual.
The current roster changes the preview, so replaying its previous hash refuses.
The existing user invitation and cancellation doors support explicit resend and
revocation with stable Base identities. No new confirmation bypass is added.

`people.member` displays manual authority or linked identity sources with lifecycle
authority explicitly unverified. A sign-in link is never called a directory source. `people.offboard`
requires independent read and offboard permissions, a member `operator`, an
active owner `custodian` and explicit confirmation. It suspends connected access,
revokes current sponsored machine, agent, share and link authority, removes
company recipient grants and retains custodian-owned critical rotation obligations.
Family vault data is untouched. The result explicitly reports unknown historical
and disconnected coverage. Missing enrolled company custody blocks hand-back;
no transferred key, provider rotation or directory equivalence is claimed.
`people.offboarding` retrieves the same durable operation and obligations.
Linked identity sources require lifecycle reconciliation before manual suspension;
this fail-closed fence does not prove a directory adapter or its authority. Deletion refuses a pending hand-back, and an
offboarded member cannot reactivate until a future reviewed fresh-authority path
exists. Scheduling, DST handling, device delays, email changes and complete
cryptographic hand-back remain unimplemented.
