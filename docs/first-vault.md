# Your first vault

Latchkey's command-line client keeps a vault whose items are encrypted on your computer before they leave it. The service stores only ciphertext and checks every request against your current rights.

## Before you start

The client is `scripts/latchkey.mjs` in the `run-latchkey` folder, run with that checkout's Node:

```sh
node scripts/latchkey.mjs COMMAND < request.json
```

- Every command reads **one JSON object on stdin**. Write it to a private file (for example `chmod 600 request.json`) and delete the file when you are done. Never put passwords, tokens or keys in command arguments, shell history or environment variables.
- Results print as one JSON line. The client never prints item values or private keys; anything secret it saves goes to a **new** file with mode 0600, and it refuses a path that already exists.
- Registering a client consumes the one-time token from a sign-in or invitation email that the installation sends. A copy started with `rer dev` sends no email, so register against an installation whose mail is set up, such as one you deployed with `rer deploy` ([operations](https://github.com/just-every/run-latchkey/blob/main/OPERATIONS.md)).

The examples below use `https://vault.example.com` for that installation.

## Register this computer

Ask the installation for a sign-in email:

```json
{ "origin": "https://vault.example.com", "email": "you@example.com" }
```

```sh
node scripts/latchkey.mjs identity-request < request.json
```

It prints `{"status":"accepted"}` whether or not the address has an account. Open the email, copy the value after `token=` in its link, and register:

```json
{
  "origin": "https://vault.example.com",
  "identityToken": "the token from the email",
  "password": "your unlock password",
  "profile": "latchkey/profile.json",
  "kit": "kit/latchkey-kit.json"
}
```

```sh
node scripts/latchkey.mjs register < request.json
```

`register` saves the **profile** (this device's secret factor and the keys it trusts) and the **kit** (your recovery factor) before it commits anything, then prints your account and device IDs. Your password never reaches the service: sign-in uses OPAQUE, and decrypting needs the password together with the profile's device secret. Keep the profile on this computer, move the kit to a separate drive, and keep the password apart from both.

## Create a vault and store an item

Every command from here on also needs `profile` and `password`:

```json
{ "profile": "latchkey/profile.json", "password": "your unlock password" }
```

```sh
node scripts/latchkey.mjs vault-create < request.json
```

It prints the new vault's ID, for example `{"vault":"…","epoch":1,"revision":1}`. Add an item with `put`, giving the vault and the item as any JSON value:

```json
{
  "profile": "latchkey/profile.json",
  "password": "your unlock password",
  "vault": "the vault ID",
  "value": { "title": "Chase business portal", "url": "https://chase.com", "username": "finance@example.com", "password": "the login's password" }
}
```

```sh
node scripts/latchkey.mjs put < request.json
```

Everything in `value` is encrypted on your computer: title, URL, fields, notes and inline attachment content alike. `put` prints the item's ID and version. To change the item, run `put` again with its `object` ID; Latchkey keeps the earlier version and appends the new one, and a write made against an older copy of the vault is refused. A request is limited to 1.5 MB.

## Read it back

```json
{ "profile": "latchkey/profile.json", "password": "your unlock password", "vault": "the vault ID", "output": "latchkey/vault.json" }
```

```sh
node scripts/latchkey.mjs read < request.json
```

`read` decrypts every retained version on your computer and writes them to the new private file named in `output`, then prints how many versions it wrote. The client also records what it has seen, so a service that later drops a known version or rolls the vault back is refused.

## See what happened

```sh
node scripts/latchkey.mjs audit < request.json
```

With just `profile` and `password`, `audit` prints up to 1,000 events for your account: accounts, devices, keys and items, attributed and without any secret.

Next: [share the vault and remove someone](sharing.md), or see every command in the [command reference](vault-cli.md).
