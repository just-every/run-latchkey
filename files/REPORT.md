# LKY-004 browser locking

Plan:
1. Map existing enrollment and manual-lock custody; keep the full native and provider remainder explicit.
2. Add profile-bound, reviewed local preferences and inactivity and background locking. Preserve the existing unlock ceremony on navigation and restart.
3. Fence network and decryption completions across lock, abort pending requests and clear every rendered decrypted panel.
4. Extend the actual emitted Worker browser journey for confirmation, cancellation, activity, lifecycle returns, isolation, delayed operations, authority refusals and secret-free persistence.
5. Run touched browser journeys and typecheck; generate and check contract views without committing them; regenerate and check source lock last.
6. Merge fresh main, publish the product branch, discover exact-SHA Verify and publish the complete report packet separately.

Boundary: no native, phone, signing, biometric, hardware-factor, clipboard-erasure, offline-expiry or cross-client policy claim. LKY-004 cannot be claimed DONE from this browser increment; its whole-clause held remainder is unchanged.

Implementation:
- Settings exposes Browser lock using the existing Latchkey controls. The draft is reviewed before saving, cancellation does not persist it, and editing a reviewed draft removes its confirmation.
- Preferences contain only the inactivity selection, background boolean, schema and origin, tenant, account, device and enrollment-generation binding. They contain no profile, device secret, password, PAKE export, grant or key bundle.
- Trusted pointer, keyboard, input and wheel events renew a monotonic inactivity deadline while visible. Synthetic events cannot keep an unlocked profile alive.
- Background locking is owner selected. Leaving the page always locks; a persisted page return also locks. An old unlock attempt cannot finish after departure.
- Lock clears records, selected item, vault inventory, lifecycle state, drafts and panels, invalidates the UI epoch and client session, aborts requests and stops timers. Signed requests and asynchronous decryption recheck their session. Attachment verification, key wrapping and TOTP copy cannot finish through a stale session.
- The original profile file and password ceremony remains mandatory. A wrong password, foreign origin or revoked device cannot unlock. Another account or approved device starts with independent preferences.
- No offline expiry, organizational policy, clipboard clearing, native secure-storage or rollout claim was introduced.

Scoped proof register: tests/browser/vault.mjs invokes browserLockJourney in ordinary push Verify. The --browser-lock switch is only a local focused door.

| Item | Lines in tests/browser/vault.mjs | Runtime result |
| --- | --- | --- |
| Exact binding, confirmation, cancellation and changed draft | 250–267 | Keyboard applies the reviewed profile; cancellation persists nothing; an edited draft invalidates review |
| Genuine activity versus synthetic activity and inactivity | 268–281 | Input renews the deadline; injected activity does not; timeout removes title and revealed password |
| Background and return | 282–285 | Controlled document visibility locks immediately and stays locked on return |
| Restart, history and persisted lifecycle return | 286–296 | Real reload and history traversal require unlock; injected persisted events also clear state |
| Rendered state and pending operations | 220–249, 297–312 | Delayed real Worker reads, reveals and login cannot repopulate the screen; locked SDK copy and write refuse without another version |
| Async local TOTP copy | 313–332 | A real HMAC result delayed across lock leaves the sentinel clipboard unchanged |
| Origin, account and device isolation | 333–352 | New approved device and separate account have no inherited preferences; foreign origin and revoked device refuse |
| Keyboard, tooltips and responsive proof | 254–270, 353–357 | Keyboard confirms review; focused reveal has its tooltip; changed screens fit 1440 and 390 |
| Persistence, wire and audit secrecy | 358–366 | Password, device secret, item password, TOTP seed and private-root canaries are absent |
| Cache separation | browser-lock module and preference payload at 263–265 | INSPECTED: only local preferences; offline implementation unchanged |

Lifecycle proof boundary: headless Chromium stays visible during tab switches and minimizing, and Playwright's retained default arguments disable native BFCache. The journey controls visibility and persisted lifecycle events in the actual built page, alongside real reload and history traversal. It does not claim a browser-native BFCache cache-hit or physical background transition.

Full LKY-004 acceptance sentences; no complete acceptance sentence is newly claimed:

| Sentence | Result and remaining boundary |
| --- | --- |
| 1: second-phone enrollment; mismatched challenge and password or SSO-only refusal | UNMET-EXTERNAL: dedicated phone and SSO provider not held. Browser second-device enrollment proves profile isolation only. |
| 2: biometric, capable passkey and SSO unlock, timeout and clipboard clearing | PARTIAL: browser timeout and lock proved; named native factors and clipboard clearing remain unproved. |
| 3: lost-laptop remote sign-out and subsequent session and cache refusal | UNMET-EXTERNAL for lost-laptop proof; revoked browser-profile unlock refuses. No cross-client claim. |
| 4: disconnected default-cache exposure and configured finite expiry | UNPROVED this round; LKY-038 unchanged. Browser inactivity never changes cache policy. |
| 5: cached and copied-secret rotation obligations | INSPECTED boundary: UI says copied clipboard contents survive; provider rotation and complete exposure reconciliation not claimed. |
| 6: printed kit, required MFA and clean-device lost-all-devices recovery | UNMET-EXTERNAL or unproved; LKY-009 and LKY-051 unchanged. |
| 7: kit regeneration and old enrollment refusal | UNPROVED; no kit-regeneration or cryptographic recovery claim. |
| 8: alerts, suspicious-device refusal and print-job secrecy | PARTIAL revoked browser-profile refusal only; LKY-040 delivery and native print handling unproved. |

DONE-RIDERS against the candidate:

| Row | Result | Evidence or boundary |
| --- | --- | --- |
| 1 | FAIL for whole-clause DONE | Native acceptance outcomes remain unreached. Selected browser flow has public-door assertions in browserLockJourney. |
| 2 | PASS selected flow | Seeded encrypted login and TOTP; confirmed changes succeed; cancellation, wrong password, revoked profile, synthetic activity and stale completions refuse. |
| 3 | FAIL: candidate Verify red | Ordinary vault-browser Verify loads the journey without an environment flag. No conclusion borrowed from another SHA. |
| 4 | PASS locally | Final commands run on the committed candidate. Screenshot source bytes equal the candidate; browser-proof receipt records their source tree. |
| 5 | PASS; no new inheritance | No receiving clause, Base duty or acceptance text edited. Only LKY-004 browser work claimed. |
| 6 | PASS mechanical | Generator write and check pass; views restored and not committed; Status, Gap and Evidence untouched. |
| 7 | PASS | No acceptance sentence or Status row changed, removed or narrowed. |
| 8 | PASS selected authority | Fresh profile and password succeed; wrong password, foreign origin, revoked profile and locked copy or mutation refuse. |
| 9 | PASS boundary | Native clients, provider effects, clipboard clearing, remote erasure and copied secrets remain explicitly unproved. |
| 10 | PARTIAL policy boundary | Current-profile owner-only preferences are the conservative scope requested by the brief; no company or group policy inferred. |
| 11 | PENDING landing | Cloud changes only its branch; main equality, complete scan and candidate Run site belong to the guarded Mac lander. |

Pre-handoff self-check:
1. Selected behaviors have assertions; whole-clause acceptance stays PARTIAL. Exact-SHA CI is separately recorded below.
2. No existing assertion deleted, narrowed, skipped or moved behind a width condition. New journey asserts at 1440 and captures changed screens at 390. No new test registration or cap raise.
3. Existing full runtime proof covers revoked authority, real erasure, inactive archive restoration and erasure replay fences. This round adds locked async refusals and no server authority.
4. Settings placement, text at least 13px, focused reveal tooltip and text-labeled new controls inspected at both widths. No one-sided border, homepage or logo change.
5. Initial touched checks pass, but the full exact-SHA CI is red. The broader runtime replay regression reproduced and the recipient-permissions failure did not reproduce locally. No scan, main equality or candidate Run site invented. Added source has zero email-shaped strings.

Plan row to relay: LKY-004 gains the confirmed enrolled-browser locking increment and proof. Preserve native, hardware, signing, recovery, cross-client and provider holds. LKY-007, LKY-009, LKY-027, LKY-033, LKY-038 and LKY-051 unchanged.

CLAIM LKY-004 PARTIAL points=none tests=tests/browser/vault.mjs#browserLockJourney
DEFAULT LKY-004: Current-profile owner-only reviewed local inactivity and background preferences; restart and page return require the existing unlock ceremony. No company policy, decryption persistence or offline expiry inferred.
GAP LKY-004: Native clients, dedicated phones, signing and provisioning, OS storage, biometric, passkey and SSO unlock, clipboard clearing, complete remote revocation, stolen-device cache proof, printed-kit regeneration and required-MFA recovery, LKY-040 alerts, company and group propagation and remaining cross-client authority, archive and erasure proof stay held or unproved. Native BFCache cache-hit and physical background-transition receipts were not established by this headless fixture.

Terminal product and CI provenance:

Repository: just-every/run-latchkey
Branch: cloud/sx-latchkey-c-f280
Product head: c30f0e5a6b70df245d0c92bc13dee19c29bcb30f
Product push: guard returned PUSH_OK; advertised remote branch matches full SHA.
PR: none; Verify runs directly on branch pushes.
Integrated main: 1ed203cff1fd807b61290d1af39c7db586600e58; fetch and merge were up to date.
Main equals candidate: false; no cloud landing was attempted.
Main Verify: 42492601266 push success; main Run site: 42492601385 push success. These are baseline results, never candidate proof.
Candidate Verify: 42497138994, event push, status completed, conclusion failure.
Candidate Run site: not run; main-only deployment belongs to lander.
Counts before and after: 8 DONE, 26 PARTIAL, 46 MISSING, total 80. All Status rows unchanged. LKY-004 source stays MISSING; PARTIAL is the builder claim for this increment.
Test registrations: no increase; existing vault script extended; no assertion removed or narrowed.

Publication scan receipt (honest not-run state):
{"commit": "c30f0e5a6b70df245d0c92bc13dee19c29bcb30f", "complete": false, "findings": null, "historyScanned": false, "reason": "Cloud adaptation delegates publication scan to guarded Mac lander."}

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node scripts/contract-docs.mjs write LKY-004 then check LKY-004 exit=0, generated views restored; ledger=none exit=0

Local final proof: full vault browser and full runtime journeys exit 0 on Node 22.20.0 at the committed head; fresh candidate build, focused browser lock journey with screenshots, typecheck and first-party check exit 0. The exact commands and artifact hashes are in local-receipt.json and browser-proof.json.

Actual public-door probe output:
PROBE LKY-004 locked client: a delayed actual Worker result is invalidated even without transport cancellation; reveal, copy and mutation refuse without writes
PROBE LKY-004 pending unlock: leaving the page invalidates a delayed authorized login completion and clears the password
PROBE LKY-004 settings: reviewed exact profile, cancelled without persistence, changed draft requires review, keyboard confirmation persisted only preferences
PROBE LKY-004 inactivity: genuine input extended the deadline; synthetic activity did not; idle lock removed rendered title and revealed secret
PROBE LKY-004 background: browser visibility boundary locks immediately and return stays locked
PROBE LKY-004 restart: reload, history return and persisted page lifecycle require the existing profile and password ceremony; preferences survive without keys
PROBE LKY-004 pending: delayed real read and reveal responses cannot restore state after lock; copy and mutation controls are absent
PROBE LKY-004 delayed copy: a real TOTP calculation completing after lock cannot overwrite the clipboard
PROBE LKY-004 isolation: a second approved device and a separate account start unconfigured, foreign origin refuses, original preferences remain isolated, revoked profile and wrong password cannot unlock
PROBE LKY-004 secrecy: local and session storage, IndexedDB, caches, wire and audit contain no password, profile secret, root or decrypted item


Terminal disposition: BLOCKED; no READY claim.
The pushed head remains c30f0e5a6b70df245d0c92bc13dee19c29bcb30f. No repair or speculative source change was made after the failed organization assertion did not reproduce, following the brief's mandatory stop rule. This branch must not land in its present state.

Exact-SHA Verify 42497138994, push, completed failure:
- Job 128781837363, runtime: scopedRecoveryJourney at tests/latchkey-recovery.mjs:232 fails with "Failed to construct 'Request': member signal is not of type AbortSignal." Exact shard reproduced exit 1. Request options now contain an AbortSignal; the existing replay capture uses structuredClone, which does not preserve an AbortSignal as a usable signal. The request transport and replay representation need a follow-up repair; no replay assertion was weakened.
- Job 128781837333, organization-browser: directPermissionsJourney at tests/browser/organization.mjs:184 expected Reveal Password disabled, received enabled. The exact local shard passed exit 0 on the failed SHA, including that journey. NOT REPRODUCED. No fix guessed.
- Job 128781837315, vault-browser: the new browserLockJourney and the complete vault.mjs script passed in CI, as shown in ci-vault-failure.log. A later selectedExitJourney at tests/browser/exit.mjs:122 expected one release_cancelled audit outcome and received zero. Not rerun locally after the mandatory non-reproduction stop.
- Job 128783971836 is the aggregate failure, not a separate assertion.

The failing shards were invoked with Node 22.20.0, CI=true, WRANGLER_SEND_METRICS=false, PLAYWRIGHT_SKIP_BROWSER_GC=1 and their exact SHARD. Cloud browser execution uses the mandated system Chromium. The reproduction logs and JSON receipts preserve commands, exits, SHA, test and observed errors. No main comparison or failed-job rerun was performed after the stop; no flake is claimed. GitHub budget: 8 calls, including one archive invocation for each of the three failed assertion jobs.

VERIFY_REPRODUCED
{"command": "CI=true WRANGLER_SEND_METRICS=false PLAYWRIGHT_SKIP_BROWSER_GC=1 SHARD=runtime node scripts/verify-ci.mjs runtime", "exit": 1, "failure": "Failed to construct 'Request': member signal is not of type AbortSignal.", "head": "c30f0e5a6b70df245d0c92bc13dee19c29bcb30f", "job": 128781837363, "reproduced": true, "test": "scopedRecoveryJourney at tests/latchkey-recovery.mjs:232"}

NOT_REPRODUCED
{"ci_failure": "Reveal Password expected disabled; received enabled", "command": "CI=true WRANGLER_SEND_METRICS=false PLAYWRIGHT_SKIP_BROWSER_GC=1 SHARD=organization-browser node scripts/verify-ci.mjs organization-browser", "exit": 0, "head": "c30f0e5a6b70df245d0c92bc13dee19c29bcb30f", "job": 128781837333, "observed": "Full organization-browser shard passed, including directPermissionsJourney.", "reproduced": false, "test": "directPermissionsJourney at tests/browser/organization.mjs:184"}

Post-handoff bar: LKY-004 remains PARTIAL. Full-clause native holds and the lifecycle receipt boundary above remain. Exact-SHA Verify must pass after the known transport regression is repaired and the two other failures are resolved or triaged under the existing rules. No publication scan or landing is claimed.
