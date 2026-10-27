# Homepage claims

The nine-screen page follows the owner-picked page-s2 design and the target product in CONTRACT.md (20 October 2026). Dated records, people, provider results and counts are illustrative target scenarios, not customer measurements. This table describes current code on the candidate; it does not change contract status.

| Screen / capability claim | Support | Code or target contract |
| --- | --- | --- |
| 01: company logins, passkeys and API keys are end-to-end encrypted | partly | Client-held encrypted vault: `src/latchkey/client.mjs`, `src/latchkey/crypto/envelope.mjs`, `src/latchkey/service.ts`, LKY-001. Complete native passkey/autofill delivery remains LKY-003. |
| 01: filled on every device | contract, not yet in code | LKY-003; the web vault is not evidence of native browser and phone autofill. |
| 01–03, 09: leaked credentials are changed everywhere, checked, then revoked | contract, not yet in code | LKY-020, LKY-063; no AWS rotation, consumer rollout or provider authentication adapter is delivered. |
| 01–02: key pasted in Nook is found and matched | contract, not yet in code | LKY-022. No Nook leak scanner is delivered. |
| 01–02: GitHub Actions, Kubernetes and Cloudflare Worker receive the key, including a refused update, retry and passing deploy | contract, not yet in code | LKY-019, LKY-020, LKY-063. The project's version rollback in `src/latchkey/projects/client.mjs` reports provider state unchanged. |
| 03: AWS refuses the revoked old key | contract, not yet in code | LKY-020, LKY-063. The dated result is the target scenario, not an observed AWS response. |
| 04: leaver exposure is followed through to 17 changed and tested logins | partly | `src/latchkey/people/offboarding.mjs` provides manual suspension and custodian-owned exposure obligations. `src/latchkey/people/custody.mjs` provides explicitly enrolled custody and reviewed hand-back through native signed requests, REST and CLI. LKY-078 retains its erasure, repeated-cycle, restore, adverse-browser and policy-approval gaps. Automatic directory signals and verified provider changes remain LKY-008, LKY-010, LKY-064. |
| 05: four people fill the bank login without reveal, copy or export; fills are counted | contract, not yet in code | LKY-005, LKY-057, LKY-014. `src/latchkey/sharing/` and `src/latchkey/audit/service.mjs` supply bounded sharing/audit foundations, not isolated brokered fill. |
| 06: Dana approves a one-time Grainger grant and the agent never receives the password | contract, not yet in code | LKY-024, LKY-035, LKY-057, LKY-067. `src/latchkey/automation/mcp.mjs` supplies posture/access-request tools, not a brokered vendor sign-in. |
| 07: secrets are discovered in repositories and removed by pull request | contract, not yet in code | LKY-022, LKY-066. Scanning and repository remediation are not delivered. |
| 07: applications receive secrets at runtime with `latchkey run -- node server.js` | code | `scripts/latchkey/run-command.mjs`, `src/latchkey/runtime/`, `src/latchkey/projects/`, `packages/sdk-*`; LKY-018. Runtime injection does not establish scanning or PR creation. |
| 08: 1Password vaults, groups, two-factor codes and references migrate losslessly before source closure | partly | Restricted import foundations in `src/latchkey/migration/core.mjs`, `bitwarden.mjs`, `passbolt*.mjs`; LKY-016. 1PUX, group-right reconciliation, reference rewrite and source cutover remain target LKY-041, LKY-049, LKY-070, LKY-071. Existing imports report cutover incomplete. |
| 01, 09: 100% free and open source; owner can run Latchkey | code | Root `LICENSE` is MIT; `/run` is built from `src/site/run.json` and the source repository is public. No claim of a free managed service or finished incumbent parity is inferred; complete owner operation remains LKY-017/031. |

No independent cryptographic review, security certification, penetration-test pass or live provider result is claimed. LKY-030 and LKY-076 remain the security-assurance targets. The 25 October manual offboarding and restricted migration rulings remain in force; homepage target examples grant no product authority.

LKY-013 now has a bounded company-vault-owner report under Settings, with current client health, explicit unknown coverage, current recipient and device counts, saved range criteria, scoped connected human usage, and CSV and PDF exports. This does not establish the homepage’s illustrative company measurements, complete adoption feeds or historical trend target.
