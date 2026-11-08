# Recovery custody

The shipped client and CLI support bounded recovery paths. All cryptography
runs in the buyer client. The Worker stores encrypted envelopes and public keys.
Recovery does not reset an independent MFA factor or recall copied plaintext.

An unlocked member can enroll an independent self-recovery code with
`recovery-self-enroll`. Its output is a private file containing a random code and
an authenticated encrypted account envelope. It does not require the old vault
password or Emergency Kit. Store it independently. Successful recovery revokes
all prior enrollments, devices, connected sessions and grants; reusing a code
is refused. The account's existing recipient and historical signing keys remain
inside newly encrypted custody; complete account-root rotation is outstanding.

`recovery-administrator-enroll` requires explicit member consent and a pinned,
named active installation owner. Installation ownership alone does not enroll
anyone. The member wraps account custody to that administrator's client-held
key. A company account with family access cannot enroll this path, and family
recipient writes refuse while administrator recovery remains enrolled. Keep
independent family accounts under separate roots and authority.

After an email sign-in verified within the last five minutes, `recovery-start` prepares a four-minute case
bound to that session, account generation, new password registration and fresh
client transfer key. Its private pending file contains session authority and
must be protected like a credential. The review names the person, vaults,
devices and unchanged MFA boundary. The administrator pins the member identity,
performs the human identity check and invokes `recovery-approve` for that exact
case. `recovery-finish` requires explicit confirmation, possession of the
client-held recovery key and the approved case; it writes a fresh profile and
Emergency Kit privately. It never prints recovery material. Old enrollment,
expired case, changed generation and revoked administrator authority refuse.

`emergency-enroll` selects one owner-held family vault and a pinned contact,
with an explicit wait of at least one hour and an expiry within thirty days.
`emergency-request` sends a minimal notice to the owner's previously verified
mailbox and starts the wait once. The owner can use `emergency-cancel` before
or after waiting. `emergency-open` refuses early, cancelled, expired, revoked,
foreign or changed-key authority. It writes only the selected vault's content
to a private file; it does not add ordinary vault rights or release account-root
keys. Waiting is enforced by the connected service, not a cryptographic time
lock. Delivered copies cannot be recalled.

Mail acceptance by the configured provider is required before enrollment,
recovery initiation, recovery completion or an emergency request proceeds.
Mail contains no recovery code, key, item content or recovery URL. Provider
acceptance is not proof of inbox delivery. Attributed events record successful
product operations; mail describes authorization rather than claiming a
completed recovery before its transaction commits.

Installation archives exclude every recovery enrollment, case and emergency
capability. Restore requires fresh enrollment. Person erasure removes custody
and cases for the member, administrator or contact and leaves downloaded copies
explicitly outside product control. Separate MFA recovery, complete root-key
rotation, complete graphical authority coverage and applicable native proof remain outstanding.
The administrator and emergency policies are conservative defaults pending ct.

## Fresh two-person company custody

`recovery-quorum-propose` proposes exactly two distinct named active owners, or
an empty list to remove custody. The member is the requester and cannot approve.
Two other active owners use `recovery-quorum-change-review` and
`recovery-quorum-change-approve`, with `exactChange` equal to the reviewed reference
and `confirmed: true`. Votes bind the exact proposal, member generation, prior
policy revision and each approver's current authority. A changed or removed
owner invalidates their prior vote. The second approval activates a new revision
and invalidates old enrollments and pending cases. Adding a custodian never
transfers an existing share: the member must freshly enroll.

`recovery-quorum-enroll` takes the two trusted fingerprints and explicit member
confirmation. It writes a private credential file using `output`. The client
creates a random AES key for the encrypted account payload and splits that key
into two 256-bit XOR shares. One independently random share alone gives no
information about the payload key. Each share is encrypted to its named
custodian and signed by the member. Neither custodian receives a full root
envelope. No raw share or payload key is sent to the service. The credential
contains the public enrollment transcript and supplies no share.

The existing `recovery-start` and `recovery-finish` commands accept this explicitly
marked quorum credential. Each owner uses `recovery-quorum-review`, pins the
member identity, checks the exact case and invokes `recovery-quorum-approve`
with `exactCase`, `identityChecked: true` and `confirmed: true`. The member
shares the exact approval reference printed by their own client. It contains
the case identifier and a case-sensitive SHA-256 transcript digest, including
the member-held transfer key. Custodians compare and type that reference; a
service that substitutes a transfer key produces a different reference. The client
unwraps only that owner's share and re-encrypts it to the case transfer key.
Shares and releases bind tenant, member generation, enrollment, policy revision,
named owner keys and generations, operator authority version, transfer key,
case reference and expiry. The requester combines both verified releases on
their client, opens the encrypted payload and proves recovery-key possession.
A single release cannot finish recovery. Duplicate approval and completion
replay refuse; current authority and revision fences repeat atomically at writes.

The browser exposes the same ceremonies under Settings → Recovery custody,
and the locked page's Recover with two custodians form. Human approval requires
typing the exact reference and explicit identity review. Agent and machine
credentials provide no approval door. Recovery custody grants no everyday
vault read rights. Family recipients are refused while fresh quorum enrollment
is active; independent family roots remain excluded. Recovery-only custodians
must be current owners in this bounded implementation; delegated recovery
administrators and independent permission scopes are outstanding.

All six quorum tables are excluded from actual installation archives. Restore
requires a fresh policy and member enrollment. Subject erasure removes associated
policies, proposals, votes, enrollments, cases and releases, including custody
assigned to the erased person. Already delivered copies cannot be recalled.

Legacy `recovery-administrator-enroll` remains single-custodian custody. Existing
single-custodian envelopes are never counted or relabeled as quorum shares.
An account with recorded legacy administrator custody cannot enroll quorum
custody, even after revocation: a previously copied full root cannot be
recalled. An account with quorum enrollment history cannot add legacy
administrator custody. Use a separate freshly enrolled account; no automatic
migration or root replacement is implemented. A non-authorizing root-history
restriction retains only the member account and two custody-history booleans.
It survives custodian erasure and archives so removal cannot silently permit
relabelling an exposed root. Erasing the member removes this restriction too.
Other existing recovery kits also remain independent authorities. Quorum
custody does not claim complete root rotation, recall of copied roots, hardware
factor qualification, separate MFA bypass or an independent cryptographic audit.
## Scoped single-custodian recovery

An installation owner can grant `accounts.recover` to one named active non-owner
member with `recovery-scopes-set`. Supply `custodian`, `confirmed: true` and an
explicit `members` array, each entry containing `account`, current `generation`
and `domain: "company-account"`. An empty array revokes that custodian's scopes.
There are no wildcard scopes. Replacing this array creates fresh grant identities
and requires fresh enrollment even for retained members. `recovery-scopes` shows
only the caller's relevant grants, or all grants for the installation owner.
These permissions are independent of people-management permissions and cannot
be delegated by their holder.

The member pins that exact custodian's fingerprint and explicitly confirms
`recovery-scoped-enroll`, supplying the scope id and a private `output` file.
The encrypted envelope binds the grant identity and current member generation.
It uses the existing full company-account root; it does not isolate individual
vaults. Family access makes this enrollment ineligible. Custodians retain their
own client-held keys; the server never receives a root or a plaintext share.
The existing start, human review, approval and finish commands then apply.
Every stage checks both the enrollment and live grant, active member and
custodian, key domain and generations. Narrowing, revocation, key changes,
deactivation, erasure and incompatible policies refuse pending operations.
Regranting cannot revive an old envelope. Replayed approval or finish refuses.
Previously copied roots or envelopes cannot be recalled.

Settings → Scoped recovery exposes owner grants, member enrollment and exact-case
custodian approval. The locked screen's account recovery ceremony accepts the
member's credential file under a freshly verified sign-in. Changing the custodian,
scope or pinned fingerprint clears enrollment consent and requires confirmation
of the new selection. No scope grants
ordinary item or attachment reads, export, policy, billing, settings or
owner-only actions. Archives exclude the scopes and enrollment bindings; person
erasure removes both. Legacy named-owner custody remains separate. This policy
is single-custodian only, never a two-person quorum, and never converts an
unknown or quorum-protected enrollment. LKY-051 remains independent.
The member-signed envelope's purpose must match its stored policy at every
recovery stage. A missing scope binding or altered envelope refuses; neither
can reinterpret scoped custody as legacy named-owner recovery.
Starting a scoped case also requires the credential's exact policy, scope and
custodian. Missing or incompatible descriptors refuse before creating a case;
legacy credentials remain accepted only for their original enrollment policy.

Scoped case requests also bind the credential’s exact account, tenant and
generation before any case is created or notice is sent. Changing these fields
refuses without preparing recovery for the signed-in member. Legacy named-owner
and self-recovery credentials retain their original ceremony.
