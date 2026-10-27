# Recovery custody

The shipped client and CLI support three bounded recovery paths. All cryptography
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
rotation, graphical ceremonies and applicable native proof remain outstanding.
The administrator and emergency policies are conservative defaults pending ct.
