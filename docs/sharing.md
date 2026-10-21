# Share a vault, remove someone

A vault's owner shares it person by person, with separate rights for each, and removes someone by changing the vault's keys. Every command reads its JSON on stdin and also needs `profile` and `password` ([Your first vault](first-vault.md)).

## Compare fingerprints first

Each account has a fingerprint over its two public keys. Print yours:

```sh
node scripts/latchkey.mjs identity < request.json
```

It prints the account, tenant, both public keys and the fingerprint. Exchange fingerprints with the other person over a channel you already trust, in person or on a call you placed. Latchkey pins the keys you confirm, so a service that later swaps someone's keys is refused.

## Share a vault

The owner shares with the other person's account ID and the fingerprint they read to you:

```json
{
  "profile": "latchkey/profile.json",
  "password": "your unlock password",
  "vault": "the vault ID",
  "account": "their account ID",
  "fingerprint": "their fingerprint",
  "rights": ["read", "create"]
}
```

```sh
node scripts/latchkey.mjs share < request.json
```

The rights are `read`, `create`, `edit`, `export`, `share` and `rotate`, and the service checks each one on its own at each of its doors. Latchkey wraps the vault key for that person on your computer and signs the wrap, so neither the service nor anyone else can hand them a different key.

Before they read the vault, the other person pins you the same way, with your account ID and fingerprint:

```json
{ "profile": "latchkey/profile.json", "password": "their unlock password", "account": "your account ID", "fingerprint": "your fingerprint" }
```

```sh
node scripts/latchkey.mjs trust < request.json
```

## Remove someone

Removing a person changes the vault's keys:

```json
{ "profile": "latchkey/profile.json", "password": "your unlock password", "vault": "the vault ID", "remove": "their account ID" }
```

```sh
node scripts/latchkey.mjs rotate < request.json
```

`rotate` makes a new vault key, re-encrypts every retained version under it and wraps it for everyone who stays, in one change that commits completely or not at all. The removed person's wrap is gone, so nothing they could read before opens with the new key. Every remaining member must already be pinned; `confirmedKeys` maps any account to the recipient key you verified for it.

What a rotation cannot do: take back what that person already read or copied, or change a password at the website it belongs to. Re-encrypting the vault changes Latchkey's keys, not the login itself.
