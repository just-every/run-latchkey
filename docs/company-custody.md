# Company custody and reviewed hand-back

This is a bounded client-held custody door. It does not complete LKY-078.
Company membership or an administrative role supplies no vault key. Family
vaults cannot enroll. The current vault owner explicitly proposes a key envelope
for a named, active installation owner after confirming that person's fingerprint.
The custodian verifies the source fingerprint, decrypts the envelope locally and
signs its key commitment before enrollment is accepted. The service stores only
the encrypted envelope and signed references. Enrollment alone grants no normal
vault read. An owner may explicitly revoke enrollment before suspension; it cannot
recall a key already decrypted by that trusted custodian.

The existing manual Offboard action suspends the member. A matching active owner
custodian can then preview an exact encrypted inventory with the source epoch,
revision, identity keys, enrollment commitment and a four-minute review deadline.
Only explicit approval of that exact plan permits hand-back. The custodian client
decrypts every included version and attachment, encrypts it under a new vault key,
and signs its own owner wrap and retention policy. The Worker atomically checks
current authority, inventory, revision and expiry, replaces recipients and vault
ownership, and revokes old shares, links and machine grants. No provider credential
is changed. Previously decrypted data and disconnected copies cannot be recalled.
Rotation obligations stay pending human approval.

Use the shipped CLI with private JSON on standard input. Every command requires
`profile` and `password`. `custody-enroll` also takes `vault`, `custodian`,
`fingerprint` and `confirmed: true`; `custody-accept` takes `vault`, the source
`fingerprint` and `confirmed: true`. `custody-revoke` takes `vault` and
`confirmed: true`. `custody-preview` writes the encrypted review to the private
`output` file. Review that file before passing its `planHash` as
`approvedPlanHash`, its path as `plan`, and `confirmed: true` to
`custody-handback`. Files use mode 0600 and are never overwritten silently.
No password, plaintext value or private key belongs in command arguments.
The matching signed REST routes are documented in `src/latchkey/api/openapi.json`.
The browser-compatible `CompanyCustodyClient` uses the same canonical Worker doors.

A missing, revoked or stale enrollment blocks hand-back. A custodian who loses
active owner authority produces `blocked-no-active-owner-custodian` in the
operation result; another administrator is never substituted. Item histories with
special lifecycle, erased-item proofs, projects, reviews or aliases currently
refuse hand-back rather than silently discard their linked state. Custody enrollment
is excluded from installation archives and is removed by person erasure; restoring
an archive does not restore operative custody consent.

Remaining LKY-078 work includes the web custody review console, its refusal and
blocked-state screens, complete linked-state migration, reviewed fresh-authority
reactivation, and broader concurrent-authority and interruption proof. Ordinary
reactivation after Offboard remains refused at both signed and native doors.
There is no supported reactivation ceremony yet. No independent cryptographic
review, external-copy erasure or provider rotation is claimed.
