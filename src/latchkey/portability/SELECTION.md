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
