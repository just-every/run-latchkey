# Client-held vault protocol

Status: implemented CLI/API foundation; independent Latchkey cryptographic review pending. This document describes the current code, not the completed product contract. The web app remains a foundation. Native storage, platform passkeys, full item editors, administrator recovery and brokers have separate incomplete journeys.

## Keys and custody

| Material | Created and used | Service receives |
| --- | --- | --- |
| Unlock password | Buyer client, OPAQUE registration/login | Blinded protocol messages and registration record |
| OPAQUE export key | Buyer client after registration/login | Nothing; the server's session key is never a decryption key |
| Device secret | Buyer client, 32 random bytes | Nothing |
| Account unlock key | HKDF-SHA-256 over export key and device secret, salted by account UUID | AES-GCM wrapped account bundle |
| Account recipient key | Client P-256 ECDH key pair inside the wrapped bundle | Public recipient key |
| Account authority key | Separate client P-256 ECDSA key pair inside the wrapped bundle | Public signing anchor |
| Device signing key | Separate client P-256 ECDSA pair, private half inside its wrapped bundle | Public request-verification key |
| Vault key | Client CSPRNG, 32 bytes per vault epoch | Recipient-specific signed ECDH/AES-GCM wraps |
| Item key | HKDF-SHA-256 of vault key, tenant/vault/item salt and item purpose | Nothing |
| Recovery secret | Buyer kit, 32 random bytes | A bundle encrypted using export key plus recovery secret |
| Recovery signing key | Client, private half inside encrypted account/recovery bundles | Public recovery-verification key |
| Machine key material | Buyer runtime, encrypted under an independently held 32-byte runtime key | Public signing/recipient keys and a selected item's wrapped key |

A device profile contains its secret factor, public pins, account/device locators and local integrity checkpoints. The account bundle on the server contains encrypted account recipient/authority/recovery private keys and the device signing private key. The CLI requires owner-only regular files, refuses final-component symlinks and writes secret outputs with mode 0600. This is file custody, not a claim of hardware-backed storage or native biometrics. Protect the profile independently from the password and keep the kit away from both.

JavaScript cannot guarantee erasure of garbage-collected strings. `lock()` drops live references; raw key arrays are cleared where practical. An unlocked or compromised process is inside the trusted client boundary.

## OPAQUE and initial identity

`@serenity-kit/opaque` is pinned to 1.1.0. It implements RFC 9807 using opaque-ke and Ristretto255. Its published upstream [7ASecurity assessment](https://7asecurity.com/reports/pentest-report-opaque.pdf) is a library review, not a review of this release's complete dependency graph or Latchkey's integration. Latchkey uses the library's memory-constrained Argon2id configuration: 65,536 KiB, three iterations and parallelism four. No test lowers these parameters.

A current Base identity session is required to register the first client key. The CLI can request and consume the installation's actual native email sign-in/invitation token; it does not discover a browser profile or export a browser session. Account and tenant identifiers bind both OPAQUE identifiers. The service creates one setup per account and stores it with the password record. Each login has a fresh, single-use, two-minute server state. Failed client authentication sends no finish proof.

The client pins the OPAQUE server public key obtained during authenticated first registration. Later login requires this pin. A password change intentionally installs a fresh OPAQUE record/setup and updates that local pin. Server setup material can authenticate the protocol but cannot recreate the export key or the independent device/kit factor from a server snapshot.

After a successful PAKE finish, the service uses a current matching identity session or admits a password session through Base's existing identity and IdP-binding rules. An IdP-bound identity cannot acquire a password sign-in by bypassing those rules. Its valid identity session still needs PAKE and its enrolled local factor to decrypt. Named SSO provider sandbox journeys remain unproved; an authenticated session alone is not an unwrap factor.

## Envelope format and authentication

`src/latchkey/crypto/envelope.mjs` is shared client cryptography. Envelopes have exactly `schema`, `algorithm`, `context`, `nonce` and `ciphertext`. Schema 1 uses AES-256-GCM, a fresh 96-bit `crypto.getRandomValues` nonce and a 128-bit authentication tag. Ciphertext includes the tag. Encodings are canonical, unpadded base64url; malformed lengths and encodings refuse.

The authenticated data is UTF-8 JSON of this ordered tuple:

```text
[tenant, vault, object, purpose, epoch, version]
```

All components are mandatory. Epoch and version are positive integers. Item values, type, title, URLs, TOTP seeds, private material, custom field labels/values, filenames and attachment contents are inside the encrypted body. The service needs only opaque IDs, ownership, rights, versions, ciphertext lengths and event timing. It does not provide a plaintext title index. This foundation accepts bounded JSON bodies and inline attachments; it is not the full typed-item or large-attachment implementation.

ECDH wraps use a new ephemeral P-256 pair and HKDF-SHA-256 over the shared secret, with authenticated context as salt and `latchkey/v1/recipient-wrap` as purpose. Key derivation has separate purposes for account unlocking, item keys and machine profiles. Password/PAKE session/request-signing/recovery/wrapping keys are not interchangeable.

Public-key encryption alone does not authenticate a sender. A wrapped key therefore also includes `signer` and `signature`. ECDSA-SHA-256 authenticates an ordered transcript containing the protocol tag, signer, ephemeral public key, canonical context, schema, algorithm, nonce and ciphertext. The service and client verify it. Vault wraps require the vault owner's separately pinned authority key; enrollment wraps require the account authority; runtime wraps use the granting account authority pinned in the buyer-held grant file. A storage service cannot replace a vault key with a known key and induce the client to encrypt its next secret under it.

Recipients compare a fingerprint over **both** account recipient and authority public keys through a trusted channel. A recipient explicitly pins the sharing owner with `trust` before opening that vault. A changed pin, wrong owner, unsigned wrap, foreign context or ciphertext alteration refuses. Current CLI distribution and rotation require an owner-signed wrap; delegated manager signing/certificate flows under LKY-005 remain unimplemented.

The service validates envelope context before persistence. The client independently rebuilds expected context and authenticates it before use. Local profiles retain observed owners, vault epoch/revision/key fingerprints and per-version content digests. Missing known versions, changed known contents or backwards state refuse. A new device has no independent historical checkpoint; a malicious store can withhold data or present a consistent older snapshot to a fresh client. External checkpoint/witness work is not claimed here.

## Request authority

Every product request is same-origin POST JSON, with a 1.5 MB streamed input ceiling. The service never echoes invalid input or cryptographic exception details. A normal product grant lasts at most ten minutes and is bound to a live Base session, account generation and active enrolled device. Every use also requires a fresh device ECDSA signature over:

```text
["latchkey/v1", method, path, grant, nonce, timestamp, SHA256(body)]
```

Nonces are one-use database entries. Timestamps outside a 60-second window refuse. OPAQUE starts/finishes are bounded to 20 requests per account/IP-minute or finish/IP-minute. Empty, foreign, revoked, expired and cross-origin authority cannot read a vault. Account/tenant/object checks run in the service, independently of client controls. Mutations recheck live authority inside the same D1 transaction as their writes.

Vault writes use a revision compare-and-swap; item versions append. Membership removal rotates to fresh vault/item keys and re-encrypts **all** retained versions. One transaction checks the exact item/version and remaining-recipient sets, publishes the next epoch and removes the departing wrap. A stale or incomplete rotation commits no partial state. Provider passwords are separate: re-encrypting a vault does not rotate a password at its website.

## Devices, recovery and password changes

An untrusted device can use PAKE to request an enrollment exchange, but that grant is restricted to pending enrollment doors. It creates new signing/transfer keys and a local secret. Its public account locator must already include the existing recipient/authority pins. A trusted device compares the challenge fingerprint, approves the exact new keys, and signs an ECDH transfer of the account root. The new device verifies this signature, decrypts locally and proves its own signing key while publishing its device-encrypted bundle. Enrollment challenges expire after two minutes and are consumed once. Password or SSO alone does not receive the root.

Device revocation immediately refuses its next connected request and PAKE login. Previously copied plaintext, private keys or offline ciphertext cannot be recalled. A lost/compromised endpoint requires the vault owner's explicit `rotate` for exposed vaults and provider credential rotation; revoking a row alone is not cryptographic erasure. Full account-root replacement, native key-store/clipboard/lock policy and member offboarding are not completed by this command.

The kit is a buyer-held factor and locator, not a server escrow key. Recovery requires PAKE with the password and successful client decryption using the kit secret. A recovery-only grant can authorize only recovery, signed with the old recovery key. The transaction advances account generation, revokes every old device and creates one newly keyed device plus a fresh kit/recovery signing key. The old kit and old device grants fail. The root recipient and authority keys remain stable to preserve existing encrypted vault access; exposed-vault/provider rotation remains an explicit separate operation.

Changing the password requires a currently unlocked trusted device. It generates a new OPAQUE record/setup, device secret/signing key and kit/recovery key, wraps under the new export key, then atomically advances generation and revokes old devices. Both ceremonies save new local custody files before attempting the remote mutation and preserve old files for failure recovery. No administrative password reset bypass exists. Required MFA, administrator-assisted waiting/quorum recovery and printed Emergency Kit journeys belong to the still-incomplete recovery/authenticator clauses.

## Machine boundary

A buyer-run runtime creates its own signing and recipient keys, encrypted in a local profile under an independently supplied 32-byte runtime key. A person with current read and share rights confirms its fingerprint and grants **one item**, for at most one hour. The client wraps the derived item key, never the whole vault key, for that runtime. The service stores a hash of the random capability and the signed encrypted item-key wrap.

The runtime signs every read. The service checks the current account/operator/device generation, rights, expiry, revocation, exact object and vault epoch. It returns only the latest encrypted version of that item. The runtime validates the granting authority and context and decrypts in its own process. Revoke, expiry, account generation change or vault rekey stops subsequent reads. Already received plaintext remains an exposure. This is an owner-run runtime door, not a claim of the SDKs, environment injection, providers, model isolation or brokers promised elsewhere.

## Export and Records

The vault CLI's `export` requires export rights, decrypts inside the client and seals a portable JSON archive under an independently buyer-held export key. `archive-open` works locally and needs no live service; it writes plaintext only to a new private file. Neither archive contains active application authority. Full domain destination rewrapping/restore under LKY-017/033 remains incomplete.

The installation's Base Records policy preserves encrypted account/vault/version rows and historical facts. It excludes device trust, application grants, PAKE exchanges, enrollment/password transactions, replay caches and machine capabilities. Import normalizes every restored vault recipient's rights to `[]`; old grants do not activate. Records' existing integrity, staging and atomic-restore machinery remains unchanged. Complete destination approval/reactivation and erasure-journal product integration are pending LKY-033/034. Keep the kit, password and a client encrypted export separately; installation recovery cannot create a missing client factor.

## Proof and review boundary

`tests/runtime.mjs` exercises the emitted Worker over HTTPS with actual OPAQUE, WebCrypto, migrated D1 and public client/API doors. Its only provider replacement is the SendGrid v3 network edge for a native invitation. It checks encrypted payload classes and metadata, history, recipient pinning/removal/rekey, authenticated tampering, device/kit/password lifecycles, scoped runtime reads, foreign installations, server-state leakage and Records handling. Generic encrypted payload coverage is not a native passkey, phone, fill or production-source receipt.

Independent review must cover the composition, library/version provenance, randomness/KDF limits, enrollment pin distribution, recovery and root compromise, SSO, all public doors, backup/restore, broker and update boundaries. No independent Latchkey report or finding disposition is available. See [threat-model.md](threat-model.md).
