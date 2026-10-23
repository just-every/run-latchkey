# Company fleet

Each client runs its own Latchkey installation and retains its owner identities,
account roots, vault keys, data and audit. A provider fleet is a collection of
explicit client delegations, not a shared company or a vault recipient.

Open **More → Company fleet** (`/app/fleet`). Create a provider signing identity
and keep its downloaded private file securely. Give the public identity file to
each client owner through a trusted channel. Nothing is saved in browser storage.
The private identity is confined to the console page's memory and the file the
operator explicitly downloads; clear it or close the page when finished.

A client owner opens **More → Service provider** in the unlocked vault, imports
and verifies the provider's public identity, selects the duration and confirms
the displayed scopes. The downloaded delegation file names that exact provider,
console origin, client installation, expiry and scopes. It conveys no vault,
item, export, recovery, connector or runtime authority. Import each client's file
into the fleet and refresh to retrieve its current metadata.

Summary scope exposes pseudonymous member references, operator status and device
enrollment counts, current external-sharing policy and the owner-recorded
commercial status/reference. It projects no member names or email fields, item metadata,
values, keys, personal/family content or company audit. Enrollment is not actual
usage, MFA coverage or credential health: those views explicitly remain unknown.
Owner-entered commercial records do not establish a paid subscription, quantity,
price or successful payment. Keep the reference free of secrets and personal data.

Optional template scope permits only tighter external-sharing settings. The
current fleet template disables external sharing, removes allowed domains and
reduces link durations. Refresh and preview the selected companies, review every
before/after policy, then approve those exact successful previews. Each client
checks current consent, expiry and unchanged policy independently. A changed
policy requires a new preview. Outcomes remain separate; one failure never makes
the other clients appear successful. Failed transport is unverified, so refresh
before another action. Applied operations are idempotent and the client owner can
read their operation/provider references in **Provider policy audit**.

A client owner can revoke one delegation or remove every provider and operate
independently. To change providers, verify and authorize the new identity and
revoke the old identity's delegations. No client keys, accounts or credentials
pass through either provider, and no infrastructure ownership is transferred.
Previously disclosed metadata cannot be recalled. Removing a file from a fleet's
portfolio only removes the local reference; client-owner revocation ends access.
Consent also fails when its approving owner, account generation or device no
longer has current authority. An archive preserves delegation history and
commercial facts but restores delegations revoked, without previews or nonces.
Erasing the consenting owner removes those disclosures and future requests fail.

## Public interfaces

Owner operations use the normal signed REST API (and the existing `latchkey api`
command):

- `GET /api/latchkey/v1/msp/delegations`
- `POST /api/latchkey/v1/msp/delegations`
- `DELETE /api/latchkey/v1/msp/delegations/{delegation}`
- `POST /api/latchkey/v1/msp/independent`
- `PUT /api/latchkey/v1/msp/commercial`

The provider uses `FleetClient` in `src/latchkey/msp/client.mjs` or the shipped
`latchkey msp-provider` command. CLI input comes on stdin and explicitly names
private `identity`, `delegation` and `output` files, the `consoleOrigin`, and
`action` (`summary`, `preview`, `apply`) with its `input`. `latchkey msp-identity`
takes `consoleOrigin` and a new private `output` file. Keys and results are never
written to command output. Owner operations retain normal operator/device
signatures; provider requests use a separate signature and never send cookies.

The provider transport is `POST /api/latchkey/msp/provider`, with JSON fields
`delegation`, `provider`, `nonce`, `time`, `action`, `input`. The header
`x-latchkey-provider-signature` signs
`JSON.stringify(['latchkey/msp/v1', clientOrigin, exactBodyString])`. The service
pins the console origin, signing key and delegation; it rejects stale time,
replayed nonces, foreign clients, expired/revoked consent, broader templates and
all other actions. Cross-origin replies never permit credentials. HTTPS is
required except for explicit loopback development origins.

LKY-028 remains partial. Actual credential-risk and usage/adoption sources,
complete onboarding/commercial workflows and a review of these delegation and
handover semantics are outstanding. LKY-011/013/055 own the corresponding richer
sources and records; LKY-008/052 inherit these client and delegation boundaries
when directory and connector administration are added. The current metadata-only
handover does not claim transfer of provider-owned vaults or infrastructure.
