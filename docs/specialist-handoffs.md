# Specialist references and privileged checkout

Latchkey stores a certificate, its private key, passphrase and attachments in
client-encrypted item versions. Select Certificate in the existing item editor,
or use `item-save` with type `certificate`. Document items also accept an expiry
date. Importing a certificate does not issue, renew or revoke it.

`item-expiry` receives an on-demand report for currently readable active items.
Dates and values remain inside the encrypted vault until the client opens them.
The report contains object IDs, versions, dates and expiry states; it contains no
item titles, keys or document contents. This is a client report, with no configured
mail delivery or disconnected-client scheduling.

## Record a specialist reference

Every CLI command takes JSON on standard input. Supply the private profile path
and master password using the normal CLI input boundary, never command arguments.
`handoff-record` also takes `vault`, `confirmed: true` and a `handoff` object with
exactly `category`, `provider`, `source`, `destination`, `owner` and `origin`.
Source, destination and responsible owner are opaque UUID references. Origin is
an HTTPS origin without credentials, a path, query or fragment. The encrypted
record preserves all of these fields.

Categories are pki (Venafi, Keyfactor, Infisical), session (CyberArk, Delinea,
StrongDM, Teleport), mdm (Jamf, Kandji, Intune), spend (Zylo, Productiv), tls
(Uptime), workforce (Willow, Auth), ticket (Linen), audit (Porthole), review
(Evidence), incident (Oncall), task (Pegboard) and payroll (Envelope). Use the
lowercase provider name in JSON. General task work and payroll stay with those
products; this door carries references only.

`handoff-open` writes the reference and destination origin to the explicitly
selected private `output` file. It makes no provider request. Every record stays
`unresolved`, with `adapter-unavailable`, no acknowledgement and
`providerVerified: false`. Opening an origin is never evidence of successful
handoff. No specialist receives a vault value through this command. Extra fields,
including reasons, employment details and payroll data, are refused. Provider
authentication and observed acknowledgement are future adapter work.

## Coordinate a privileged credential ceremony

Checkout is currently limited to the company vault owner, with explicit
confirmation and existing read, edit and rotate authority. It coordinates owner
use of a shared credential; it does not mediate existing read rights or recall
old copies. Delegated checkout and provider verification are not implemented.

1. `checkout-acquire` takes `vault`, `object`, `expiresAt` and `confirmed: true`.
   Expiry is at most an hour away. Concurrent acquisition has one winner.
2. Save the replacement credential through `item-save`. Store any specialist
   session reference in an encrypted custom field. Recording a reference does
   not create a privileged session or a recording.
3. `checkout-complete` takes the same vault and object, returned `checkout` ID,
   the new `version` and `confirmed: true`. It requires a later current version.
   This records an owner-attested vault replacement only. Provider state stays
   `unchanged`; Latchkey does not claim a successful provider login or rotation.

`checkout-status` reports checked-out, expired-rotation-required or available.
Expiry never silently releases a credential; expired status also reports `stale: true`. Completion after expiry still needs
a replacement version. Interrupted replacement can be inspected and completed;
repeated or stale completion refuses. The owner can explicitly release an active
or expired lease with `checkout-release`, supplying `vault`, `object`, `checkout`,
`confirmed: true` and a `reason` of `ceremony-cancelled`, `holder-unavailable` or
`replacement-pending`. These fixed reasons prevent accidental secret disclosure
in audit. The attributed audit action records `checkout_released:` followed by
the reason. Release does not claim a replacement version or provider rotation. Checkout metadata contains only identifiers,
a version and a deadline. Item erasure removes it, and installation archives
exclude live checkout authority.

The matching REST resources are documented by the installed API catalogue:
`GET` and `POST` on `./api/latchkey/v1/vaults/{vault}/items/{object}/checkout`,
and `POST` on the same resource followed by `./complete` or `./release`. Existing signed device
authentication, current authority checks and transaction fences apply.
