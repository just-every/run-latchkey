# Vault client foundation

Use this checkout's Node 22.20.0 and pinned dependencies. Start an installation with `rer dev`, or use an owner's configured HTTPS installation. The browser vault and CLI/API described here use the same client-held cryptographic boundary. [Protocol](security/protocol.md) and [threat model](security/threat-model.md) describe its limits.

Run `node scripts/latchkey.mjs COMMAND`. Every command reads **one JSON object from stdin**. Supply sensitive input through a trusted local process or a private input file; do not put passwords, tokens, runtime/export keys or item values in command arguments, shell history or environment variables. The CLI never searches for credentials or a browser profile. It never emits item values or private factors on stdout. Values/archives/profile/kit/grant outputs use explicitly chosen **new** mode-0600 files; existing output paths refuse. Profiles are atomically replaced only for local checkpoint updates.

For a private input file selected by the buyer, the invocation is:

```sh
node scripts/latchkey.mjs COMMAND < /buyer/private/request.json
```

Delete temporary request/plaintext files when finished. Keep a mode-0600 profile and a separately held password; neither should be sent to the service. Keep the kit in a separate location. Save new password/recovery custody under new filenames and preserve the old files until the remote operation succeeds. A failed remote mutation may leave the prepared new files; retry deliberately with the still-working old custody rather than overwriting it. There is no hidden password-reset or vendor recovery path.

## Identity and client enrollment

| Command | Input fields | Result |
| --- | --- | --- |
| `identity-request` | `origin`, `email` | Requests the installation's real native sign-in email; generic accepted result |
| `register` | `origin`, `identityToken`, `password`, `profile`, `kit` | Consumes the native email/invitation token, creates encrypted account custody, saves profile and kit before remote commit; outputs opaque account/device IDs |
| `identity` | `profile`, `password` | Public account/tenant/recipient/authority/server pins and combined recipient/authority fingerprint |
| `trust` | `profile`, `password`, `account`, `fingerprint` | Pins a peer's public keys after independently comparing its fingerprint |
| `enroll-start` | `origin`, `account`, `tenant`, `serverKey`, `recipientKey`, `authorityKey`, `password`, `profile` | Creates a pending device and returns its verification fingerprint |
| `enroll-approve` | Existing trusted `profile`, `password`, pending `device`, `fingerprint` | Approves that exact device challenge; signed encrypted transfer contains no uploaded plaintext |
| `enroll-complete` | Pending `profile`, `password` | Verifies and consumes the transfer, saves the enrolled profile |
| `devices` | `profile`, `password` | Public device IDs/keys and revocation/generation state |
| `device-revoke` | `profile`, `password`, `device` | Refuses its next connected operation; reports residual cached/copied exposure |
| `recover` | Old `kit`, `password`, new `profile`, `newKit` | Requires both factors, revokes old devices/kit, saves fresh custody |
| `password-change` | Current `profile`, `password`, `newPassword`, `newProfile`, `newKit` | Fresh PAKE record, device factor and kit; prior device/password authority stops |

Get the new-device public locator and account pins from the existing owner's `identity` result through a trusted channel. Compare the challenge before approving it. An SSO/email identity session alone never supplies a new device's local factor. Existing CLI password admission honors Base's IdP-bound account policy; complete SSO-native CLI enrollment and MFA ceremonies are not claimed.

## Vault operations

Every row below also needs `profile` and `password`. The service checks current rights independently of the client.

| Command | Additional input | Output/behavior |
| --- | --- | --- |
| `vault-create` | None | Creates an empty encrypted vault; opaque `vault` ID |
| `put` | `vault`, `value` JSON, optional existing `object` | Encrypts locally; creates or appends a version, with compare-and-swap conflict refusal |
| `read` | `vault`, new `output` path | Decrypts all retained versions to a private local JSON file |
| `share` | `vault`, recipient `account`, verified `fingerprint`, `rights` array | Owner signs a recipient-specific wrapped vault key; rights are independent `read`, `create`, `edit`, `export`, `share`, `rotate` checks at implemented doors |
| `rotate` | `vault`, optional removed account `remove`, optional `confirmedKeys` mapping account to verified recipient public key | Owner rotates keys and all retained versions atomically; excludes removed member; existing recipient pins are required |
| `export` | `vault`, independent 32-byte base64url `exportKey`, new `output` path | Client-encrypted portable version archive; never includes active authority |
| `audit` | None | Attributed secret-free account/device/key/item event facts, up to the latest 1,000 |

A sharing recipient must first `trust` the sharing owner's fingerprint before reading the vault. The current distribution protocol requires owner-signed wraps; delegated manager certificates and the complete LKY-005 atomic-rights product are not delivered here. Wrong fingerprints, stale writes, tampered envelopes/key wraps, missing known history, expired grants, removed recipients and revoked devices refuse.

`value` can contain nested fields, sensitive metadata and inline attachment content; **all** of it is encrypted. The transport has a 1.5 MB request ceiling and each decoded envelope a 1 MiB ceiling. This generic payload door is not the complete typed item editor, native passkey store, camera QR capture, large-attachment uploader or provider integration of LKY-002/003. A history version or vault rekey never changes a provider password.

`archive-open` takes `archive`, `exportKey`, and a new `output` path. It decrypts a portable client archive locally, without authentication or a running service, and writes plaintext only to that private file. It does not activate imported grants or perform a whole-product installation restore.

## Buyer-run runtime

A runtime receives a selected item key, never an account or vault key. Its profile is encrypted under a separately held 32-byte base64url `runtimeKey` supplied on stdin.

| Command | Input fields | Behavior |
| --- | --- | --- |
| `runtime-keygen` | `origin`, `runtimeKey`, new `machineProfile` | Writes encrypted private keys and outputs only machine public keys/fingerprint |
| `runtime-grant` | Person's `profile`, `password`, `vault`, `object`, runtime public `identity`, verified `fingerprint`, optional `expiresInSeconds` (1–3,600), new `output` | Saves a scoped capability/grant file after human authorization |
| `runtime-read` | `machineProfile`, `grant`, `runtimeKey`, new `output` | Fetches only that item's latest encrypted version and decrypts in the buyer's runtime |
| `runtime-revoke` | Person's `profile`, `password`, `machine` | Stops subsequent runtime reads |

The granting person needs read and share rights. The runtime is a trusted decryptor: keep its input/output and private key away from model contexts, logs and other users. A grant stops after expiry, revoke, granting device/account invalidation or vault epoch rotation. Already disclosed data cannot be recalled. SDKs, process injection, provider authentication and isolated brokers remain separate incomplete clauses.

## Installation backup distinction

`rer export`/`rer import` use Base Records with the edition's archive policy. Product ciphertext/history is preserved; device trust, live grants, machine capabilities and in-progress authentication are excluded. Imported recipient rights are empty/inactive. The reviewed destination-rewrap and explicit activation doors below preserve inactive authority. Keep an independently encrypted client export, kit and password. LKY-033 retains Base interruption limitations; LKY-034 retains the remaining person/audit/client erasure obligations.

## Typed items and browser vault

After native installation sign-in and first-run confirmation, `/app/vault` accepts the buyer's profile file and master password. It decrypts locally. The vault offers typed fields, encrypted attachment downloads, local non-secret search, append-only history previews/restores, templates and a generator. Lock the vault before leaving the device, and download the updated profile after confirming a new account pin. This browser door does not establish the native autofill, synced passkey-provider or offline-client capabilities of LKY-003/038/039.

The following commands also require `profile` and `password`. Item values leave the CLI only through a chosen private `output` file.

| Command | Additional input and behavior |
| --- | --- |
| `item-save` | `vault`, optional `object`, `type`, `value` (title, typed `values`, custom `fields`, labels/tags/ownership/URLs), optional `attachments`; creates/appends encrypted typed content |
| `item-history` | `vault`, `object`, `output`; complete authorized typed history |
| `item-restore-preview` | `vault`, `object`, `version`, `output`; preview and provider-rotation warning |
| `item-restore` | `vault`, `object`, `version`, `confirmed:true`, optional `expectedVersion`; appends a version and retains current provider verification |
| `item-field` | `vault`, `object`, `field`, `action`, `output`; authorized selected field |
| `item-search` | `vault`, `query`, `output`; searches only decrypted non-secret views locally |
| `item-attachment` | `vault`, `object`, `attachment`, optional `version`, `output`; verifies attachment digest |
| `template-save` / `template-get` | Versioned `value` definitions / selected `object` and private `output` |
| `template-import-keeper` | Explicit Keeper JSON `value`, `vault`; imports documented `$id`/`$ref` record-type definitions |
| `generator-policy` | Effective current company/group policy and history retention |
| `generate` | Private `output`, encrypted `history` path, `acknowledgedRetentionDays`; optional stricter local policy, password `options.length` or passphrase `options.words` |
| `generator-history` / `generator-clear` | Explicit private encrypted `history` and output / selected `entry` (or clear all) |
| `totp` / `totp-import` | `vault`, `object`, selected OTP `field`, private `output` / `uri` and expected `target.issuer` and `target.account` |
| `item-erase` | `vault`, `object`, `confirmed:true`, optional exact `revision`; immediately deletes retained versions and current dependent copies, invalidates pending archives and fences the object ID |

Fields returned for a `fill` action are ordinary read-authorized plaintext. They are not an isolated browser autofill implementation. TOTP capture uses the member-selected browser screen/camera permission and local decoding, and checks the entered issuer/account before attaching a seed. Platform WebAuthn credentials remain bound to the platform authenticator; this is not a vault-synced passkey provider.

## Constrained sharing

The vault's Sharing panel shows current policy, exact reviewed objects, expiry, recipients, committed view counts and revocation. Named/group grants wrap only the selected current item keys. New group members need a separately reviewed wrap; item edits do not silently extend the old grant. Recipients compare the sender fingerprint in “Shared with me” before opening.

External links are disabled until an installation owner explicitly enables approved email domains. Email verification is mandatory. Password-protected links require a separately delivered password. The URL fragment is a client-held capability: send it through a trusted channel, never an analytics system or ticket log. `GET /share` and metadata previews consume no views. Only successful committed opens count; expiry, revocation and limits apply to later fetches and downloads. Already revealed material cannot be recalled.

`sharing-policy`, `sharing-policy-set`, `sharing-group-create`, `sharing-group-set`, `sharing-grant`, `sharing-approve`, `sharing-revoke`, `sharing-received`, `sharing-read`, `sharing-history`, `sharing-link-create` and `sharing-link-revoke` expose the same authenticated service. `sharing-link-preview`, `sharing-link-challenge` and `sharing-link-open` take an explicit complete link and need no Latchkey account. Secret results and created capabilities use a private output file. See `scripts/latchkey/sharing-commands.mjs` for the exact JSON fields.

## Encrypted Records and reviewed restore

The edition's Records policy covers every current durable product domain. Historical recipients, groups and grants travel as inactive definitions. Device trust, identity bearer tokens, machines, live grants, pending link verification challenges and pending restore approvals do not travel. External sharing is disabled on import; recipient rights are empty.

`records-seal` reads an explicit private Base Records archive (`input`), validates it, and writes a new encrypted `output` under the buyer's 32-byte base64url `exportKey`. `records-open` authenticates all chunks and the complete Base archive before publishing a private readable `output`; it never promotes partial output. Keep the key separately. An offline archive cannot prove later erasure. Supply a trusted later archive as `laterJournal` when opening and as `journal` when restoring; neither step claims it can discover a journal that the buyer did not supply.

Run `records-restore` in the receiving checkout with `{input,checkpoint,confirmed:true,partsPerRun?,finalize? ,journal?}` on stdin. The complete private source is verified before D1 opens. The command uses the receiving checkout's actual local D1, the shared checkout lock and real migrations. Each invocation stages up to `partsPerRun` parts (default 16). Reuse exactly the same private checkpoint and source to continue the same job. Set `finalize:true` explicitly when ready; Base commits an eligible import atomically. A corrupt archive or ineligible nonempty destination does not partially import product data. The checkpoint is bound to that destination, source bytes, journal and migration/policy configuration.

**Base interruption limitation:** graceful bounded commands can continue across processes while the import lease remains valid. A hard interruption during a request leaves `import_running`; an expired lease returns `import_lease_expired`. The pinned Base has no public holder reclaim or lease renewal. The wrapper preserves the original staging and refusal and never edits Base's lease tables or automatically aborts somebody else's job. Full arbitrary interruption recovery remains incomplete under LKY-033.

For approved ownership transfer, use `records-rewrap-plan` with the verified raw archive and independently compared source/destination public-key fingerprints. The source owner reviews the exact plan hash and uses `records-rewrap-approve` with unlocked custody, purpose and expiry. `records-rewrap-verify` checks the decision locally. All decision outputs use private files. A source/destination identity alone cannot activate restored access.

After import, the distinct receiving owner uses `records-recover` with the old receiving owner's private kit, password, explicitly matching `origin`/`approvedOrigin` and new custody filenames. This changes only the installation transport locator and retains its pinned PAKE server key. The destination must preserve source tenant encryption context. Then `archive-prepare` takes the private plan and approval files plus both compared fingerprints. It verifies the actual completed Base import and leaves every recipient inactive. Finally `archive-activate` requires the exact reviewed `approvedPlanHash`, a named `activation` decision and an explicit six-right owner selection. It activates only the approved destination wraps, records attribution and leaves original grants, devices, links, machines and provider actions inactive. Other source vault owners must approve their own vaults separately. See [Records custody format and service](../src/latchkey/portability/README.md).

## Confirmed person erasure

An installation owner opens **Erase a person** after unlocking, selects the actual person, reviews current deletion/anonymization counts and outstanding copies, then explicitly confirms that exact plan. The server removes owned ciphertext and active authority, replaces retained attribution with a fresh anonymous identity, records a tamper-evident audit checkpoint and invalidates archive staging. A changed plan refuses. Other owners' shared vaults require a real cryptographic rekey before new writes/shares; removing a person alone never claims that their previously copied keys have vanished.

Configure a separately held **32-byte base64url `LATCHKEY_ERASURE_SECRET`** through the installation's secret-management door before using person erasure. Keep it separately from archives and preserve it deliberately for future restores. It authenticates keyed identity/item fences and anonymous receipts; it is not a vault decryption key. The secret itself never enters an archive. When fences exist, missing or wrong key custody must be resolved before admission/verification proceeds. No session-signing-key fallback exists.

The adopted conservative identity policy refuses native reinvitation and email reuse of an erased identity; a public sign-in request sends nothing and retains its generic response. Rejoining after explicit new consent has no override door. ct approved this policy as landed under LKY-034: owner-only exact confirmation, no automatic plaintext redaction of another owner's encrypted content, and no rejoin as the erased identity (a new identity may be invited). The receipt always says full erasure is incomplete while those content scans, unreachable clients, provider/external deletion and archive expiry remain outstanding. It does not invent their deletion results.

## Application runtimes and administration

`latchkey run -- <executable> [arguments]` reads `{profile,grant,runtimeKey,references}` from stdin, resolves only the approved references, and injects values directly into the child environment. It uses no shell, environment file or persistent cache. Keep this JSON in a protected input pipe; never paste it as an argument. Only the child process receives resolved values. The Node, Python, Go and Java SDK bindings are documented under `packages/sdk-*`; Python, Go and Java invoke the explicitly installed Node runtime bridge over private pipes.

`latchkey project-create`, `project-environment` and `project-set` take the normal protected profile/password stdin plus their documented ProjectClient inputs. `latchkey api` takes the normal protected profile/password stdin and an `api` object `{command,body,...references,limit,cursor,ifMatch}`. The full command catalogue and wire protocol are in `src/latchkey/api/README.md`. Secret-bearing data stays in stdin or explicitly protected files. Values in project records and ordinary items remain client-encrypted in the REST API.
