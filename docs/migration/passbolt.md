# Passbolt local migration preview

Latchkey can inspect a password-protected Passbolt KDBX export locally with the
`passbolt-preview` CLI command. It uses the real kdbxweb codec. Passbolt's KDBX v3
export, protected password, both documented TOTP representations, folder names,
expiry, optional KDBX keyfiles, and the separate description and secret note are supported. This is a
partial migration door. The documented KeePass CSV variant is also supported,
using PapaParse for quoted and multiline fields. It does not claim a completed source cutover.

Every CLI command reads one JSON object from stdin. Never put a passphrase,
preview key, profile or credential value in command arguments. Inputs must be
regular files owned by the current user with mode 0600; symlinks are refused.
Outputs are created with mode 0600 without replacing an existing file. The
preview is encrypted with a buyer-held 32-byte random `previewKey` encoded as
base64url. Keep that key separately from the preview. No source private key,
recovery kit, cookie or source credential is requested.

1. Run `node scripts/latchkey.mjs passbolt-preview` with `kdbx`, `passphrase`,
   `sourceOrigin`, `sourceUser`, `previewKey` and `output`. The origin must be
   the exact HTTPS origin. The user is the source user UUID. An initial preview
   can include a private `keyfile` path when required by the KDBX export (omit
   `passphrase` for an export protected only by that keyfile) and
   can omit `metadata` and `mapping`; its entries will be blocked pending review.
2. Run `node scripts/latchkey.mjs passbolt-review` with `preview`, `previewKey`,
   `output` and `confirmed: true` to explicitly write a plaintext review file.
   This file contains secret values. Secure it and remove it after review.
   Stdout contains only a writing receipt, never the reviewed values.
3. Obtain resource metadata through the source's authorized API, independently
   of Latchkey. Supply that JSON file as `metadata` in a new preview. Its `body`
   is the resource array; each resource includes its `id`, `name`, `username`,
   `description`, `expired`, `tags` and `permissions`. Permission rows include
   `aro`, `aro_foreign_key`, `aco_foreign_key` and `type` as supplied by Passbolt.
   This release does not independently authenticate or refresh that file.
4. Review each entry and supply an explicit `mapping` array of `{entry, resource}`
   pairs. Passbolt creates new KDBX entry UUIDs during export, so a name match
   alone never proves a source identity. Duplicated and absent mappings fail.
   A missing description remains a gap; a supplied description is preserved
   separately from the exported secret note. Shared groups and unsupported
   rights remain discrepancies. Unmatched source resources remain visible.
5. For a reviewed private personal item only, create an empty family vault with
   `node scripts/latchkey.mjs vault-create`, supplying the usual `profile` and
   `password`, plus `kind: "family"`. Run `passbolt-import` with that profile,
   password, encrypted `preview`, `previewKey`, `approvedHash`, `entry`, `vault`,
   `ownership: "personal"` and `confirmed: true`. Approval binds the entire
   preview. The source permission must name only the selected source user as
   owner. The destination must be owned by the signed-in person, have no other
   recipients and contain no versions. A company vault is refused. A repeated
   import refuses the now-populated destination instead of duplicating it.

For the documented KeePass CSV variant, supply `format: "csv-kdbx"` and `csv`
instead of `kdbx`. No passphrase is needed for plaintext CSV. The required columns
are `Title`, `Username`, `URL`, `Password`, `Notes`, `Group` and `TOTP`. Extra,
duplicate and malformed columns are refused. Review uses `csv-row-1` and later
row identifiers, with the entire source file bound into the preview hash. Expiry
is absent from this export and must be recovered from resource metadata before
import. Both formats keep raw metadata fields outside the allowlist, including
source key and recovery material, out of the saved preview.

The current destination restriction is a conservative adopted policy awaiting
contract review. It does not implement shared-company cutover or classify every
private Passbolt record as personal. Only explicitly confirmed personal records
are eligible. Imported URLs use the existing never-fill rule pending review.
Neither source permissions nor OpenPGP keys become destination authority.

Remaining work includes additional export variants, live authorized
metadata acquisition and freshness, group expansion and new recipient keys,
source ownership reconciliation, custom fields, attachments, history, policy
review, resumable batches and deltas, the graphical wizard, extension and phone
use, and final cutover. No source credential is revoked and no source item is
changed. The preview always lists the unfinished cutover obligations. Recovery,
LDAP and SSO policy intent still needs explicit review. Unsupported data stays
blocked; it is never silently declared migrated.
