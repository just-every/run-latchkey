# Selected open-format exit

The native CLI reads JSON on stdin and keeps secret values out of arguments and
stdout. Use new private output paths; existing output files are never overwritten.

1. `selection-preview`: provide `profile`, `password` and `selection`, an array
   of `{ "vault": "<id>", "objects": ["<id>"] }`. Use `objects: null` for a whole
   vault, or `selection: "company"` for company vaults owned by this account.
   The `output` file contains the exact plan and its `planHash`, counts of items,
   versions and attachment bytes, omitted object references and uninspected vaults.
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
   creates new destination keys and owner-only vaults, re-encrypts all versions
   and compares complete content digests. Source grants, policies, tokens,
   schedules and account keys never authorize destination access. The command
   refuses the source installation, a nonempty destination, gapped histories and nonactive lifecycle
   selections before creating anything. Those selections need a separate review;
   they are never silently reactivated. An interrupted import may leave a partial
   new destination; it does not claim atomic or resumable installation restore.

Plaintext requires two separate decisions. First `selection-policy` takes a vault,
`allowPlaintext: true` and literal confirmation from its unlocked owner. The signed,
versioned policy denies plaintext by default. Then preview with `format: "plaintext"`
and approve that exact plan and format in `selection-export`. Each export checks
current owner authority, policy and vault revisions and records an authenticated
approval event. Turning the policy off or changing any selected data invalidates
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
