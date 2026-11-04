# Rehearse service recovery locally

This runbook covers an independently retained encrypted installation archive and
fresh local owner recovery. It does not establish Cloudflare or domain recovery,
physical device replacement, a ten-hour offline client guarantee, or recovery of
an expired Base import lease. LKY-033 and LKY-027 keep their existing boundaries.

Before stopping the service, assign at least two named installation owners. Each
must have enrolled a vault account and independently retained its current recovery
kit and password. An owner role alone supplies no vault decryption keys. Retain:

- A complete Base installation export, sealed with `records-seal`, and its
  independently held 32-byte export key. Open and verify a copy before relying on it.
- Each named owner's current recovery kit; retain passwords separately from the
  archive and kits. Never make this vault the only place these materials exist.
- The exact software revision, dependency lock, migrations, archive policy and
  installation configuration. Keep later trusted erasure journals independently;
  an old archive cannot establish that no later erasure occurred.
- Separately protected infrastructure and domain recovery access. This rehearsal
  cannot validate these external authorities or substitute for provider receipts.

Use a fresh checkout of the retained revision with its locked dependencies. Keep
the source service stopped and the original device profiles unavailable. Supply
all command inputs as JSON on stdin; never put passwords or keys in argv. Private
files must belong to the current user and have no group or other permissions.
Do not upload any of these files as evidence.

Create an owner-only restore configuration JSON file containing `schema: 1`, the
archive's `sourceIdentity`, and `variables`. The variables must supply every name
in the archive's `requiredConfiguration`, including the explicitly selected local
`AUTH_ORIGIN`. Retain the original erasure verification material where required;
use fresh session and setup credentials. This command validates supplied material;
it neither discovers ambient credentials nor installs these variables for you.
Configure the fresh local service with those reviewed values before starting it.

Run `node scripts/latchkey.mjs records-recovery-check` from the fresh checkout.
Its stdin object contains `input` (the sealed archive path), `exportKey`,
`restoreConfiguration` (the private JSON file path), `approvedOrigin` (the exact
loopback origin), and `owners`. Each owner entry contains `name`, `kit` (a private
file path) and `password`. The command authenticates both factors against the
archived account records locally. Wrong keys, wrong passwords, stale or wrong
kits, duplicate owners, nonowners and missing configuration refuse. No source
request, session, device enrollment or destination write is performed.
The receipt reports complete member, enrolled-account, item, version and part
totals without returning recovery factors or decrypted values. A successful
material check alone does not prove an import will pass schema validation.

Run `records-recovery-restore` with the same object plus `confirmed: true`, a
private `checkpoint` path, `partsPerRun` (1 to 128) and `finalize: true` when ready.
It validates materials before opening the destination, decrypts into temporary
private storage, and invokes the existing real Base local restore. Repeat with
the same checkpoint to continue the same unexpired import job. The receipt reports
staging or completion and always describes restored operations as inactive.
Schema incompatibility, a nonempty destination or an expired lease refuses;
never delete an unfinished job to pretend that resume succeeded. Scratch plaintext
is removed on completion or refusal. An abrupt process kill may require private
scratch cleanup by the file owner; killed-request lease recovery remains LKY-033.

Start only the destination service. For each retained owner, run `records-recover`
with its kit, password, `origin`, identical `approvedOrigin`, `confirmed: true`,
and new private `profile` and `newKit` paths. This explicitly enrolls a fresh
device and retires the archived generation's device authority and kit. Missing or
wrong factors cannot recover. Recovered installation ownership grants no restored
vault access by itself.

For a source owner's vaults, recover that owner on the destination first. Use its
fresh unlocked profile with `records-rewrap-plan` and `records-rewrap-approve` for
a different independently recovered owner, confirming both fingerprints, exact
archive and plan hash, purpose and expiry. These steps work from retained archive
bytes and recovered keys; they never need the stopped source service. Finally use
`archive-prepare` and `archive-activate` with an explicit activation name and full
owner rights. Unapproved vaults remain inaccessible. Never treat another owner's
private vault as company recovery material.

Reconcile every archived item and version, including attachment sizes and computed
digests, against the independently retained inventory. Compare complete totals;
a sample or an empty list is insufficient. Check that old device profiles,
grants, links, schedules, sends and rotation approvals cannot act. Even after
explicit vault activation, historical outbound and scheduled authority remains
inactive and requires separate fresh decisions. Record only totals, outcome and
software revision outside this repository; never record keys, passwords or values.

`tests/latchkey-local-records.test.mjs` runs the clean-machine rehearsal with a
real enrolled source population and the emitted Worker, real Base export and the
local restore command. Its detailed restore checks live in
`tests/latchkey-restore.mjs`. Provider mail is an official-schema network edge;
no live provider recovery or mailbox delivery is claimed.
