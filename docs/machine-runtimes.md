# Give a machine one secret

A machine you run, such as a deploy job or a server, can read one item without ever holding your account or vault keys. You grant it that one item for at most an hour, and you can revoke it at any time. Every command reads its JSON on stdin.

## Give the machine an identity

On the machine, choose a runtime key: 32 random bytes in base64url, kept apart from the machine's profile. Then:

```json
{ "origin": "https://vault.example.com", "runtimeKey": "the 32-byte runtime key", "machineProfile": "runtime/profile.json" }
```

```sh
node scripts/latchkey.mjs runtime-keygen < request.json
```

It saves the machine's private keys encrypted under the runtime key, and prints only the machine's public identity and fingerprint.

## Grant one item

On your computer, with read and share rights on the vault, confirm the machine's fingerprint and grant it the item:

```json
{
  "profile": "latchkey/profile.json",
  "password": "your unlock password",
  "vault": "the vault ID",
  "object": "the item ID",
  "identity": { "the JSON runtime-keygen printed": "…" },
  "fingerprint": "the machine's fingerprint",
  "expiresInSeconds": 900,
  "output": "latchkey/grant.json"
}
```

```sh
node scripts/latchkey.mjs runtime-grant < request.json
```

Latchkey wraps only that item's key for the machine, never the vault key. `expiresInSeconds` is 1 to 3,600; the grant file goes to the machine.

## Read it on the machine

```json
{ "machineProfile": "runtime/profile.json", "grant": "runtime/grant.json", "runtimeKey": "the 32-byte runtime key", "output": "runtime/item.json" }
```

```sh
node scripts/latchkey.mjs runtime-read < request.json
```

The machine signs the read, receives the latest encrypted version of that one item and decrypts it in its own process, writing it to the new private file.

## Revoke it

`runtime-revoke` with your `profile`, `password` and the `machine` ID stops its next read. A grant also stops when it expires, when your account or device changes, or when the vault's keys rotate.

The machine is a trusted decryptor: keep its runtime key, profile and output away from logs, other users and AI model contexts. What it already read cannot be recalled.
