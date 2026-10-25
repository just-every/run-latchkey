# Local Bitwarden and LastPass migration

The CLI accepts Bitwarden plaintext vault JSON and portable password-protected
JSON using PBKDF2 and authenticated type-2 encryption. The committed synthetic
fixtures were emitted by the official `@bitwarden/sdk-internal`
`0.2.0-main.1157` exporter with a local synthetic identity. The fixture generator
is `./tests/fixtures/migration/generate.cjs`; pass the absolute path to a separately
installed SDK package. No live organization or Secrets Manager connection is
claimed. Account-restricted exports and Argon2 exports are refused; export a
supported portable variant in an authorized Bitwarden client instead. Never give
a server your source master password or account key.

LastPass accepts the documented seven-column CSV: `url`, `username`, `password`,
`extra`, `name`, `grouping`, `fav`. Provide `mapping` with one `{row, id}` pair per
one-based CSV data row, using stable separately recorded source identities.
Titles and folder names never establish identity. Changed exports need an updated
row mapping to the same source IDs. Conflicting duplicate IDs refuse the preview;
identical duplicates are counted. A folder name supplies no membership or rights.

Invoke `node ./scripts/latchkey.mjs migration-preview` with a private JSON object
on standard input. Supply `source` (`bitwarden` or `lastpass`), `input` (an
owner-only source file), `output` (a new encrypted-preview file), `sourceOrigin`
(an HTTPS origin), `sourceOwner` (the approving personal owner's stable source
identity), and `previewKey` (a separately held 32-byte base64url key). Bitwarden
portable exports also require the export `passphrase`; LastPass requires the
explicit row mapping. Secrets never belong in command arguments. The receipt
contains counts and an approval hash; it contains no item values.

`migration-review` takes `preview`, `previewKey`, a new `output` file and
`confirmed: true`. This deliberately writes an owner-only plaintext review.
Without explicit confirmation it writes nothing. Cancel by abandoning the
preview: preview and review never write to a vault. Preview outputs are encrypted
and never replace an existing file. Securely manage source exports and review
files on the client; this implementation does not erase the user's originals.
Erasure of plaintext temporary files after confirmed cutover remains unproved.

`migration-import` takes the encrypted preview, its key, `approvedHash`, the
unlocked destination `profile` and `password`, destination `vault`,
`confirmed: true`, `ownership: "personal"` and the exact reviewed `sourceOwner`.
This is an explicit personal-owner assertion, not proof of source API authority.
The LKY-045 restricted initial-import ruling applies: destination must be an empty
owner-only family vault. Company destinations, organization records, shared
folders and ambiguous mappings refuse. Existing batches from the same source
namespace can resume and receive approved deltas. Deterministic source identities
and optimistic version checks prevent duplicate writes after interruption.
Unchanged source records preserve destination corrections; a changed source
conflicting with a destination edit refuses before the batch writes. Batches are
resumable, not atomic; completed writes survive an interruption. Sources are never
mutated, URLs never fill automatically and no source credential is retired.

The encrypted review retains original source records and folder associations,
including unsupported classes. Supported login and secure-note values, multiline
notes, custom fields and TOTP normalize to native encrypted items. Unmapped types,
invalid fields, attachments, history and passkeys appear as blocking discrepancies.
Class reconciliation distinguishes exported counts from unknown source totals;
zero exported attachments never proves the source had none. Assigned extraction,
rights-review and re-enrollment tasks remain unresolved, and every receipt says
`cutoverComplete: false`.

Remaining work includes the graphical wizard and migration API, remaining source
formats, complete atomic rights mapping and enforcement, source-authorized omitted
class extraction, Secrets Manager inventory and fresh CI identity, and actual
source and native-client cutover. The 40-folder synthetic CSV preview is parser
and reconciliation evidence; it is not a live LastPass Business journey.
