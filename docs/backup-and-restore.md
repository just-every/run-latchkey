# Back up and restore

Back up two things separately: the whole installation, with `rer`, and your vault's contents, with an export only you can open.

## Back up the installation

From the `run-latchkey` folder, stop Latchkey so nothing writes during the backup, then export:

```sh
rer dev --stop
rer export --output exports/latchkey.rer
```

The archive is private and carries an integrity receipt. Encrypted vault items and their history travel in it. Device trust, live grants, machine grants, sign-in sessions and other in-progress authority do not: restoring an archive never re-activates them.

A large installation takes several minutes; the export prints its progress as it goes.

## Restore into an empty installation

Restoring needs an empty destination. On the same checkout that means resetting first, which deletes the local installation, so keep the archive safe before you run it:

```sh
rer reset --yes
rer import --input exports/latchkey.rer --yes
rer setup --owner-email you@example.com
rer dev
```

Import restores the saved data; `setup` then sets up the owner and the private local settings the archive leaves out. If an import stops part way, run the same command again: it removes the unfinished import and starts over.

Restored vault members come back with no rights: an old grant does not work again by itself after a restore.

## Export a vault only you can open

An installation backup protects against losing the installation. To keep a copy of a vault's contents that does not depend on Latchkey at all, export it under your own key. You need the `export` right on the vault.

```json
{ "profile": "latchkey/profile.json", "password": "your unlock password", "vault": "the vault ID", "exportKey": "a 32-byte base64url key you keep", "output": "latchkey/export.json" }
```

```sh
node scripts/latchkey.mjs export < request.json
```

The client decrypts the vault and seals every version under your export key, on your computer. To open it later, with no service running:

```json
{ "archive": "latchkey/export.json", "exportKey": "the same export key", "output": "latchkey/plain.json" }
```

```sh
node scripts/latchkey.mjs archive-open < request.json
```

`archive-open` writes the plaintext only to the new private file you name. Neither the export nor the archive carries any active authority.

## Keep the pieces apart

Your password, your profile, your kit and your export key each protect something different. Keep them in separate places, and keep a client export of any vault you cannot afford to lose.
