# Reviewed company custody

Company custody is available in Settings, under Erase a person. Its enrollment,
suspension and fresh-authority review forms are separate from person erasure.
Enrollment does not transfer ownership or grant ordinary vault access.

The current owner of a company or private-work vault explicitly enrolls its key
to a fingerprint-confirmed, active installation owner custodian. The client
wraps the key locally; the service stores signed ciphertext. Family vaults refuse
enrollment in both the client and Worker. Installation ownership alone supplies
no key. Confirm fingerprints with their holders through a trusted channel.

After explicit suspension, only the named custodian, while still an active
installation owner, may review hand-back. A review identifies every owned
company vault, source revisions, item and version counts, content commitments,
current account generations and custodian authority. It lasts four minutes,
requires explicit confirmation of its exact hash, and is single-use. Source,
authority or membership changes require another review. A missing active named
custodian produces a blocked state; the product never chooses a fallback person.

The custodian confirms the former owner's fingerprint, opens enrolled ciphertext
locally and reencrypts every included version with fresh vault keys. Applying the
review atomically transfers the company vaults and project metadata, removes all
prior recipients, disables prior machine and delegated grants, sharing and links,
and resets plaintext export policy. Histories and embedded attachments remain
encrypted. Archived and trashed states are preserved; automatic retention is
paused rather than carrying the former owner's destructive consent forward.
Existing copies and old keys cannot be remotely recalled. Provider credentials
are unchanged; their critical rotation obligations remain pending human approval.

Reactivation has a separate review after company hand-back completes. It restores
membership only, invalidates existing sessions and tokens, and requires fresh
sign-in. It restores no company vault access, transferred ownership, delegated
grants or provider credentials. Family ciphertext is preserved; access still
requires this installation's sign-in and the buyer's client keys.

## CLI

The maintained CLI accepts one JSON object on standard input. Keep passwords off
command arguments and environment variables. Profile and review files must be
owned by the caller and private. The existing CLI identity command supplies an
account fingerprint. Confirm it independently before using it.

- `node scripts/latchkey.mjs custody-enroll`: `profile`, `password`, `vault`,
  `custodian`, `fingerprint`, and `confirmed: true`.
- `node scripts/latchkey.mjs people-offboard`: the custodian's `profile` and
  `password`, the member's `operator`, `custodian`, and `confirmed: true`.
- `node scripts/latchkey.mjs custody-preview`: the custodian's `profile` and
  `password`, `operation`, `action` (`handback` or `reactivate`), and a new private
  `output` file. Read the complete plan before approving it.
- `node scripts/latchkey.mjs custody-commit`: the custodian's `profile` and
  `password`, the private `review` file, its exact `approvedPlanHash`, and
  `confirmed: true`. Hand-back also accepts `sourceFingerprint` to explicitly pin
  the former owner's keys when that account is already suspended.

## Current limits

LKY-078 remains partial. Vaults with retained erasure proofs refuse transfer
pending authority reconciliation; erased content is never reconstructed.
Repeated offboarding after a completed reactivation requires a new-cycle path
that is not yet implemented. Complete archive, restore and later-erasure
reconciliation across these paths remains unproved. Live custody enrollments
and reviews are excluded from installation archives.

Default adopted pending ct: fresh authority means the current named active
installation owner custodian, exact four-minute single-use review, no automatic
custodian replacement, owner-only destination access, paused inherited retention,
and membership-only reactivation. No policy approval, native-device completeness,
provider rotation, external-copy deletion or independent security review is
claimed. LKY-010 and LKY-069 retain their full remaining obligations.
