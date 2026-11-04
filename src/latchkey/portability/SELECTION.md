# Selected open-format exit

The native CLI reads JSON on stdin and keeps secret values out of arguments and
stdout. Use new private output paths; existing output files are never overwritten.

1. `selection-preview`: provide `profile`, `password` and `selection`, an array
   of `{ "vault": "<id>", "objects": ["<id>"] }`. Use `objects: null` for a whole
   vault, or `selection: "company"` for company vaults owned by this account.
   The `output` file contains the exact plan and its `planHash`, counts of items,
   versions and attachment bytes, omitted object references and uninspected vaults.
   The coverage record counts selected and visible company vaults. It explicitly
   marks company completeness false and other company vaults unknown: it never
   inspects another owner's inaccessible data or treats an unknown count as zero.
   Optional `review: {"purpose": "Migration", "target": "Buyer-held private file"}`
   replaces those defaults. Review purpose, target and the fixed copy-custody
   consequences together with the scope; all are bound by the plan hash.
2. Review that file. `selection-export` takes `profile`, `password`, the private
   `plan` file, `approvedPlanHash`, literal `confirmed: true`, a buyer-held 32-byte
   base64url `exportKey` and a new `output`. Encryption is the default.
3. `selection-open` takes the `archive`, `exportKey` and new private `output`.
   It works offline without an account. The documented JSON schema is
   `latchkey-selected-export-v1`: signed plan, plan hash, vault versions containing
   original JSON values and attachments, lifecycle observations and signature.
   Integrity covers the complete content and exact selection.
4. `selection-import` takes a fresh destination `profile` and `password`, the
   `archive`, `exportKey`, exact `approvedPlanHash` and `confirmed: true`. It
   prepares new destination keys and owner-only company, private-work or family
   vaults, re-encrypts every included version with its original version number
   and verifies attachment digests before any write. One transaction publishes
   every selected vault into an empty owner destination. Reconciliation compares
   complete content digests, lifecycle observations and explicit history gaps. Source grants, policies, tokens,
   schedules and account keys never authorize destination access. The command
   refuses the source installation, a nonempty destination, undisclosed history
   gaps, corrupt attachments and unsupported lifecycle metadata before writes.
   A disclosed sparse history retains its missing version intervals; no versions
   are manufactured. Archived and trashed states and their observed timestamps
   survive, with retention inactive and no operative deletion proof or source
   policy. Explicit destination decisions govern later activation. A refused
   selected import leaves no partial vaults; full installation restore and its
   resumable interruption behavior remain separate obligations.

Plaintext requires two separate decisions. First `selection-policy` takes a vault,
`allowPlaintext: true` and literal confirmation from its unlocked owner. The signed,
versioned policy denies plaintext by default. Then preview with `format: "plaintext"`
and approve that exact plan and format in `selection-export`. Each export checks
current owner authority, policy and vault revisions and records an authenticated
approval event. Approval statements include the plan hash, per-vault counts and
policy reference and expire within four minutes. After preparing the file, one
release request rechecks every selected vault together with live installation
authority, unchanged owner and source and policy revisions, and unexpired approval.
A source change or policy revocation at that boundary refuses release. Audit
separates attempted, refused and successful approval and release checks, recording
opaque scope and plan references, counts, format, timestamps, expiry and refusal
codes. It omits review text, content, filenames, signatures and keys. A successful
release check does not establish file production or disk delivery. Turning the policy off or changing any selected data invalidates
an old plan. Plaintext output is the same signed JSON document, visibly unencrypted;
opening or importing that file needs no export key. Policy consent does not travel
in an installation archive and subject erasure deletes the policy.

This door currently requires the vault owner. It exports item data, histories,
attachments and observed lifecycle state, not the full installation's non-item
domains. The plan states those omissions. Encrypted selected files use the existing
bounded AES-GCM envelope codec; a file larger than its supported decoding limit is
not a supported export. Use the full installation archive for larger transfers.
An old file without a later erasure journal cannot establish subsequent erasure.
Cancellation never gates these commands. Managed deployment and expired entitlement
proof remain separate obligations; no managed service is claimed.

Selected CLI export and offline opening write a mode-0600 temporary file, sync
it, then publish with an exclusive link that refuses existing files and symlinks.
Ordinary failure removes the temporary file. Plaintext export prints an explicit
unencrypted-file warning. A process or machine interruption can still leave a
private partial file: inventory and confirmed migration cleanup are not yet
implemented. Downloaded copies cannot be recalled, remotely expired or certified
as erased. After a successful private-file write, the connected CLI records a
client-reported outcome against its retained successful release. Ordinary write
failure records a distinct client-reported failure. Neither outcome proves
independent delivery or custody of external copies. Output includes
`auditRecorded`; false means the file was written but the audit report could
not be confirmed. Offline opening makes no network request and records no
connected file-outcome report. Interrupted reporting is not durably resumable.

## Browser encrypted selection

Unlock the source at `/app/vault`, then open **Settings → Export and import**.
Choose whole owned vaults or individual records, including inactive records.
Review the exact encrypted plan: purpose, intended target, copy custody, source
and policy revisions, included counts, omitted item references and uninspected
vaults. Company completeness remains false and inaccessible company totals stay
unknown. Preview and Cancel do not authorize release or write destination data.
Cancel also resets the purpose and intended target to their defaults, alongside the selected
scope, opened file, buyer key and exact confirmation.

Generate and save a buyer key, or load an independently retained 32-byte
base64url key file. Retain it separately from the encrypted selection and confirm
that custody explicitly. The final confirmation applies only to the displayed
plan. Download rechecks live source, owner and policy authority through
`SelectionExportClient`; stale review or revoked authority requires a new review.
The existing one-megabyte envelope limit still applies. The browser reports only
`browser_download_initiated` or `browser_download_failed` as client-reported
outcomes after successful release. A refused browser initiation requires a new
review before retrying and records a distinct failure outcome. Neither event verifies saving or delivery.
A release response lost before or after the server commit never starts a download.
The browser clears the review and buyer key and reports that release may have
been recorded, while saving and delivery are unverified. It never resends the
release automatically. Leaving the panel during an in-flight release also
prevents a late download; a returned successful release is reported as cancelled.
These client-reported interruption outcomes require the same retained successful
release as other outcomes. A failed request before release cannot manufacture
a successful receipt. If the report itself cannot reach the service or authority
has been revoked, no report confirmation is inferred. Process and device loss,
durable report recovery and independently verified delivery remain unproved.

At a fresh destination, enroll its owner and unlock `/app/vault`. Open the same
Settings action even when there are no vaults. Choose **Import selection**, load
the encrypted JSON and the separately retained key, and open locally. Review its
exact counts and omissions, then separately confirm import into fresh owner-only
vaults. Wrong keys, tampering, a source installation, a nonempty destination and
non-owner authority refuse. A destination device revoked after review is refused
at import without creating vaults; the browser clears the opened review and key.
The existing atomic importer verifies every included version and attachment digest, preserves lifecycle observations with retention
inactive, and denies plaintext by default. Source grants and active installation
authority never travel. An old file cannot prove later erasure.

Key and file contents stay in unlocked browser memory; no key, filename, purpose,
intended target or secret value is sent to audit. Cancel and leaving this panel
clear its retained form state. Browser plaintext ceremonies, full installation
recovery, external-copy cleanup and recall are not supplied by this screen.

The already loaded browser can open and verify the encrypted file with the
buyer key while disconnected from the service. Import still requires live
destination owner authority; offline review grants no import approval.

## Interrupted selected imports

After submitting the single atomic import, the client reconciles its exact
prepared destination identifiers, current ownership and kinds, every included
version and attachment digest, and inactive lifecycle observations through live
reads. If the commit response is lost, those same reads can establish success
without resubmitting the import. An unavailable read or a mismatching destination
reports an unverified outcome; vaults may already exist. In the browser, lock
and unlock the installation to load its current vaults before another import. A refused current credential never becomes a successful
reconciliation. If an included item is erased before reconciliation completes,
the changed content refuses success; reconciliation never writes that item back. The browser clears the review after an unverified result and
requires a fresh review for another attempt.

This bounded response-loss handling retains no pending files, keys or plans in
browser storage. Closing the page loses its prepared identifiers; recovery after
process or device loss, full installation restore and independent delivery remain
separate obligations. A new import still requires an empty destination and cannot
silently merge into vaults left by an earlier attempt.

The selection client checks cancellation again after the release response, before
returning either encrypted or approved plaintext file contents to its caller.
Release response loss returns an explicit unverified error for both formats and
attempts only an uncertainty report, never another release. The temporary
serialization buffer and decoded export key are cleared when export finishes,
including failure. JavaScript object collection is not certified memory erasure,
and previously downloaded files remain outside that cleanup.
