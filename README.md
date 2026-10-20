# Latchkey

Business password and secrets management.

100% free, open source alternative to 1Password Business, Bitwarden, Keeper, LastPass Business.

Latchkey is a new seed on the Base foundation. The Lobby, owner sign-in and local runtime exist. The complete product is a build target: every product clause in [CONTRACT.md](CONTRACT.md) is **missing**. [ACCEPTANCE.md](ACCEPTANCE.md) describes the intended journeys. No vault or secrets-management features have been built yet.

## Run locally

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
rer dev just-every/run-latchkey
```

If the installer prints a PATH command, run it before the second line. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-latchkey` does both steps. Later, run `cd run-latchkey && rer dev`.

Open the private sign-in link printed by rer on this computer. Finish first-run setup at `/setup`. The installed `/` is Base's shared Lobby. `RER_SITE` names the separate static site with its homepage, `/run` and `/contract`; the contract page reads the root CONTRACT.md through Base's parser.

This checkout pins `@runeditrun/rer` **0.2.74**, Node **22.20.0** and pnpm **10.12.4**. Read [RUN-LOCALLY.md](RUN-LOCALLY.md), [OPERATIONS.md](OPERATIONS.md) and [SOURCE.md](SOURCE.md). Local mail is suppressed. Private runtime state and credentials stay outside Git. MIT licensed.
