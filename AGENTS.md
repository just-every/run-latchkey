# Working on Latchkey

## Launch for review

When asked to launch, run or review Latchkey, run `rer dev` from this checkout root. It installs and sets up a fresh checkout itself and prints progress; allow at least ten minutes and resume a timed-out call with the same command. Do not run install, setup, reset or deploy for a review, or ask for an email, port, password or answers file. Give the owner the RER_READY address and private RER_OPEN link in their chat. On a refusal, follow the named repair. Stop only the PIDs you started; never use rer dev --stop, rer demo --stop, pkill or killall on the shared Mac.

Without rer on PATH, use `npx -y @runeditrun/rer cli install` or `curl -fsSL https://runeditrun.com/install.sh | sh`.

## Development

Read CONTRACT.md, ACCEPTANCE.md, RUN-LOCALLY.md and SOURCE.md. This is a new seed. Every product target is missing; the foundation is not a password manager. Design and product build rounds follow later. Keep the shared Lobby. The look is Latchkey's own (design desk, 21 Oct 2026): tokens in public/rer-theme.css, the mark in public/brand/, the run site in src/site. Never add mock application data or fake features.

For a real owner installation, use `rer install`, `rer setup --owner-email you@example.com`, then `rer dev`, or enter the mailbox through setup's prompt. Open RER_OPEN on this computer; native first-run setup is `/setup`. Local mail is silently suppressed. Keep private settings, sessions and credentials out of output and Git.

Use this checkout's exact published @runeditrun/rer 0.2.85. No vendored CLI copy. The local scripts and OPERATIONS.json use bare rer verbs. Source is edition-owned; ./src/base/ and the adopted modules come through Base's export path at the revision in SOURCE.md. Preserve applied migrations and source custody. The static `/contract` renders root CONTRACT.md with Base's parser; a changed clause and its status must agree.

Use `rer check`, `pnpm run typecheck` and the foundation's own touched tests locally. CI Verify is the full wall. Keep tests small and through public doors; do not add tests for scaffold copy or UI text. No tests at build or deploy time. No private research, logs or evidence in this public repo.

The installed `/` is the shared Lobby. `rer build --site` builds the separate static run site, including `/run`, `/docs` (from `docs/`) and `/contract`. Run site deploys independently of Verify and is gated by RUN_SITE_DEPLOY. Only the owner/orchestrator supplies provider credentials.

Use `rer describe` for effects, `rer doctor` for prerequisites, `rer verify` for trusted full verification, `rer reset --yes` only for an authorized local reset, and `rer deploy` for an authorized owner-account deployment. Stop owned servers before building. `rer export --output exports/installation.rer` and `rer import --input exports/installation.rer --yes` are installation backup/restore; restore needs an empty destination and has no reviewed-import plan or Undo. No product import screen exists yet.

Before heavy work check the shared Mac's load. Keep one heavy job per session, low priority and few workers, use the shared heavy-slot helper, and stop every owned server/browser. Never read global secret files or print secret values. Never stop another checkout's processes or free another checkout's ports.

## Contract documentation

Lander-Regenerate for a touched clause on the held Base pin:
`node scripts/contract-docs.mjs write LKY-011`, followed by
`node scripts/contract-docs.mjs check LKY-011` (replace the clause ID or supply
several). CONTRACT.md supplies status, evidence and gaps; the command preserves
existing acceptance journeys and generates docs/CLAIMS.md. Regenerate the source
lock after the final documentation change.
