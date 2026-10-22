# Getting started

Latchkey runs on your own computer with two lines. You become its owner, and its data stays on that computer.

## Run Latchkey on your computer

Install `rer`, the command that runs Latchkey, then start Latchkey:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
rer dev just-every/run-latchkey
```

The installer puts `rer` in your home folder, with its own Node if you have no Node 22 or later. If its last line is a command that puts `rer` on your PATH, run that command before the second line.

Already have Node 22 or later? This one line does both steps:

```sh
npx -y @runeditrun/rer dev just-every/run-latchkey
```

`rer dev` clones Latchkey into a folder named `run-latchkey`, installs everything, makes you the owner and starts it. When it is ready it prints the address it serves and a private link that opens Latchkey signed in as you. Open that link only on this computer, and keep it to yourself: anyone who has it is signed in as the owner.

The first run takes a few minutes. Runs on macOS, Linux or Windows with WSL2, with git.

## Finish setup

Latchkey's front page is a small lobby with one button. Before the owner is set up it says the installation is waiting for its owner; afterwards it offers **Sign in**.

The first time you sign in, Latchkey opens `/setup`: review the owner account's name and email, tick the confirmation and choose **Finish setup**.

## Start it again later

In a terminal, `rer dev` stays in the foreground; press Ctrl-C to stop it. To start the same installation again:

```sh
cd run-latchkey && rer dev
```

Your data stays in that folder's local state between runs. A copy that sits unused for 12 hours stops by itself. Private settings and credentials are kept outside Git, and a local copy sends no email.

## What this release does

This release is the foundation of the product described on the homepage, and its first parts. It has:

- the lobby, owner sign-in and first-run setup in the browser;
- the vault service with its command-line client: client-encrypted vaults you create, fill, read, share and export, devices and recovery, and scoped reads for a machine you run ([Your first vault](first-vault.md));
- the vault in the browser, with typed items, their history and a generator, and projects whose secrets applications read at runtime through `latchkey run` and the SDKs ([Command reference](vault-cli.md));
- installation backup and restore ([Back up and restore](backup-and-restore.md)).

Apps and autofill, passkeys, password rotation, breach monitoring and the other capabilities on the homepage are the product being built. [The contract](/contract) lists every clause and what the code does today, and the [security design](security/protocol.md) says exactly what the encryption protects.
