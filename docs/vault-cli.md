# Vault client foundation

Use this checkout's Node 22.20.0 and pinned dependencies. Register against an installation whose mail is set up: `register` consumes the token from its sign-in or invitation email, and a copy started with `rer dev` sends no mail. The application UI is still a foundation; the functioning product door in this revision is the CLI/API described here. [Protocol](security/protocol.md) and [threat model](security/threat-model.md) describe its limits.

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
| `audit` | None | Attributed secret-free account/device/key/item event facts, up to 1,000 |

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

`rer export`/`rer import` use Base Records with the edition's archive policy. Product ciphertext/history is preserved; device trust, live grants, machine capabilities and in-progress authentication are excluded. Imported recipient rights are empty/inactive. This foundation has no whole-product approval/reactivation or destination-rewrap door: keep an independently encrypted client export, kit and password. See LKY-033/034 for the remaining restore/erasure requirements.
