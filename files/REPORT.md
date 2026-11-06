# sx-latchkey-c-f275 actual results

Repository: just-every/run-latchkey. Branch: cloud/sx-latchkey-c-f275.
Candidate: e483bdb4ed2ad7445bc31e60dc718cb1f94a49c6.
Source main: d8cfef5db50cab38b36354746ae3af607bfdaed0.
Save: 76d2831372e4d7d1d9aafe5c3379f76491f9d3b6.
No PR was created: this repository runs Verify on branch pushes.

CLAIM LKY-051 PARTIAL points=2,3,4 tests=tests/latchkey-recovery.mjs#quorumRecoveryJourney; tests/latchkey-recovery.mjs#quorumCliJourney; tests/latchkey-recovery.mjs#recoveryArchiveErasureJourney; tests/browser/recovery-quorum.mjs#recoveryQuorumJourney

DEFAULT LKY-051: Conservative current-owner custody under the standing owner-only scope policy: two distinct named active owners hold separately encrypted shares; two independent active owners, excluding the requester, approve custodian policy changes. The member explicitly enrolls fresh custody after each addition or replacement. Recorded legacy full-root custody cannot be relabeled as quorum custody. No non-owner recovery delegation or MFA bypass is granted. This default is not a ct DONE ruling; the clause remains PARTIAL as claimed.

GAP LKY-051: Actual multiple YubiKeys and platform authenticators, Duo and TOTP authentication, passkey key-unwrapping qualification, hardware loss and revocation, phishing-origin proof, required-MFA lost-device and printed-kit qualification, native unlock, phones, signed rollout and separate human MFA-bypass or reset decisions remain held or unproved. Apple signing, provisioning, dedicated devices and accounts under LKY-003 and LKY-004 are unavailable. Non-owner recovery-administrator delegation and independent recover permissions remain owed under LKY-009 and LKY-032. Complete account-root rotation, existing single-custodian migration and the remaining full-clause authority matrix are unproved. Previously copied roots and shares cannot be recalled. No independent cryptographic assessment or full-clause DONE claim is made.

The builder changed no CONTRACT.md clause, Status, Gap or Evidence cell. Source counts before and after are 8 DONE, 26 PARTIAL and 46 MISSING, 80 total. LKY-051 remains MISSING in the source table pending the landing side's judgment; this report claims bounded PARTIAL progress, with no DONE increase. The plan row returned is LKY-051 only. No historical plan, ruling or inbox was edited.

## Delivered behavior and actual proof

The member client encrypts the account payload under a random 256-bit AES key, splits that key into two XOR shares and signs and encrypts one share to each pinned custodian. The service stores ciphertext and public transcripts. Custodians unwrap only their own share and re-encrypt it to the requesting client's transfer key after exact human review. The requester verifies both signed releases before reconstructing the payload key locally. An approval counter over a legacy full-root envelope is not used.

Policy and recovery transcripts include tenant, member generation, enrollment, policy revision, named custodian public keys, generations and operator versions. Recovery releases also include case, transfer key and expiry. The human approval reference contains the case identifier and SHA-256 transcript digest, computed on both clients. Substituting the transfer key changes the reference and refuses the member-provided approval reference, even when the stored case transcript is replaced consistently.

Current authority and policy predicates repeat inside the atomic write fence. Distinct primary keys refuse duplicate releases, vote-count guards fence concurrent policy reviews, and generation and case-consumption fences allow one successful completion. Removal, deactivation, reactivation with a changed authority version, policy replacement and erasure invalidate pending authority. Adding custodians requires new explicit member encryption and enrollment. Existing legacy administrator custody remains separate. A non-authorizing root-history restriction survives removal of a custodian and portable archives; erasing the member removes that restriction. This avoids treating the disappearance of an old custody row as proof that its root was never disclosed.

Settings contains policy proposal, independent exact-reference approval, fingerprint-confirmed enrollment, and exact-case human share release. The locked page starts recovery and displays the member-held transfer transcript reference. Before committing recovery it waits for both private-file downloads and explicit confirmation that the files were retained. Completion hands the recovered client to the ordinary vault screen. All new controls have text labels; there are no new icon-only controls. The existing theme and layout are retained.

The shipped CLI exposes the same policy, enrollment and approval doors. Recovery start prints the operation and exact approval reference without printing transfer-private material. Credentials, pending state, recovered profile and kit are private files. The CLI journey actually recovers encrypted company content and refuses completion while either share is missing.

### Frozen proof rubric for this round

R1 — Acceptance-evidence sentence 1, real hardware and platform authenticators: UNMET-EXTERNAL. No devices, signing or provider qualification was manufactured. This prevents a full-clause DONE claim.

R2 — Acceptance-evidence sentence 2, two-person quorum, removal and withheld approver: PASS LOCAL. tests/latchkey-recovery.mjs, quorumRecoveryJourney, lines 200 onward, performs actual enrollment, independently decrypts each isolated share and proves neither opens the payload, refuses finish with no release and either single release, recovers the intended company content with both, and refuses stale policy, removed, deactivated and changed authority. Concurrent completion has one winner; concurrent duplicate release has one successful insertion. tests/browser/recovery-quorum.mjs, recoveryQuorumJourney, lines 22–40, exercises the actual Settings and recovery forms. tests/latchkey-recovery.mjs, quorumCliJourney, exercises the shipped commands and private outputs.

R3 — Acceptance-evidence sentence 3, requester and agent cannot approve their own sensitive change: PASS LOCAL. quorumRecoveryJourney exercises member and owner requester refusal, exact case-sensitive references, a required independent second owner and duplicate refusal. quorumAgentRefusals uses a real admitted scoped MCP credential, attempts both approval tools and direct signed human endpoints, and observes unknown-tool and authentication refusal without mutation. Custodian replacement and removal are independently approved through public doors.

R4 — Acceptance-evidence sentence 4, everyday reads by recovery-only custodians: PASS LOCAL. quorumRecoveryJourney checks both named custodians have no target vault in their list and cannot read it. recoveryQuorumJourney checks the same refusals after the browser's successful recovery. Custody never adds a vault grant.

R5 — Named custody duties, company scope and independent-family exclusion: PASS LOCAL. quorumRecoveryJourney refuses family-vault creation during enrollment and permits independent family creation only after reviewed removal. Existing independentRecoveryJourney and emergencyRecoveryJourney remain intact and pass. Recorded legacy custody refuses quorum relabeling; quorum history refuses subsequent legacy administrator enrollment. Separate family roots and all existing assertions are retained.

R6 — Named privacy, archive and erasure duties: PASS LOCAL. recoveryArchiveErasureJourney, lines 154–173, exports populated recovery state through actual Base portability, imports it into a fresh emitted Worker installation, and verifies all nine live recovery-authority tables are absent in the archive and empty after restore. It erases a custodian, checks associated policies, enrollment, cases and releases disappear, retains only the member's non-authorizing history restriction, then erases the member and refuses the old recovery session. quorumRecoveryJourney inspects actual request bodies, encrypted custody and releases, audit facts, events, mail and runtime logs for raw share and private-root absence.

R7 — Stale, foreign, expired, tampered and replay cases: PASS LOCAL. quorumRecoveryJourney attempts a foreign installation's case lookup and credential use, wrong member context, substituted transfer key, altered credential revision, tampered ciphertext and request, captured release used for another case, duplicate release, concurrent release and concurrent completion. Expired finish, revoked enrollment, policy replacement and deactivation are refused. Existing recovery preview and old-device tests remain passing.

R8 — Current web and CLI doors and screenshot widths: PASS LOCAL. Both real browser widths, 1440 and 390, passed on the committed candidate. Behavior assertions run at 1440; the 390 run also completes the ceremony and captures the corresponding screens. The journey is imported and called by tests/browser/vault.mjs; the integration and CLI journeys are invoked by the existing tests/latchkey-recovery.mjs Verify command. No workflow was edited. No prior assertion was removed, narrowed or put behind a new condition.

## DONE-RIDERS rows on this candidate

1. PARTIAL: hardware acceptance outcome remains unmet; bounded custody outcomes are reached by R2–R8.
2. PASS LOCAL: seeded encrypted company content is actually recovered; missing shares, invalid authority and unsafe requests refuse without granting access.
3. PENDING CI: both journey entry points are included in push Verify, but no exact-head run was advertised by the initial discovery query. No green result from another SHA is claimed.
4. PASS LOCAL: recovery and browser commands completed on committed head e483bdb4ed2ad7445bc31e60dc718cb1f94a49c6. No product or test bytes changed afterward. The production Worker build preceded the final commit and its relevant source bytes were unchanged.
5. INSPECTED: existing clause explicitly names quorum, independent approval and lack of ordinary vault viewing. No new Base-duty inheritance or complete MFA result is claimed.
6. MECHANICAL: touched-clause generator write and check pass together. Generated views were restored from origin/main as required. Their subsequent freshness check fails on ACCEPTANCE.md, the expected generated-view condition. No generated view or contract judgment is committed.
7. PASS: no acceptance text or Status row changed, and no obligation was removed.
8. PASS LOCAL: requester, non-custodian, agent, foreign, changed authority and unsafe completion refusals accompany the successful recovery path.
9. PASS BOUNDARY: official-schema mail fake is not inbox delivery or hardware proof; no native, provider-authenticator, regulatory or independent cryptographic result is inferred.
10. PARTIAL DEFAULT: owner-only conservative custody is reported explicitly; no ct approval or DONE count is inferred from the default.
11. PENDING LANDER: branch custody is pushed and verified. Main equality, complete full-history publication scan and resulting main Run site remain the Mac lander's gates.

## Mechanical and publication receipts

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node scripts/contract-docs.mjs write LKY-051 and check LKY-051 exit=0, followed by restoring both generated views; ledger=node /home/agent/rer-consolidation/work/sx-latchkey-c-f275/ledger-check.mjs exit=0 (actual absolute command in RECEIPT.json).

The migration check replays all 50 migrations into fresh SQLite, validates them with Base's readLedger implementation, confirms zero pending migrations and proves the 48 prior migration files match origin/main byte-for-byte. Typecheck, production build and rer check --profile first-party passed. Source lock is fresh. Both new migrations are additive.

The restored-view check has exit 1: ACCEPTANCE.md differs from CONTRACT.md. This is the explicitly permitted generated-view exception; the Mac lander regenerates views. It is not a product-test failure and was not repaired by committing a view.

Publication scan: commit=e483bdb4ed2ad7445bc31e60dc718cb1f94a49c6; complete=NOT RUN IN CLOUD; historyScanned=NOT RUN; findings=UNESTABLISHED. The clone has full history. The Mac lander must scan this exact tree and require COMPLETE with zero new findings. Product commit authors and committers are the fleet identity, with no co-author trailers. Contract and generated-view diffs are empty.

Source-main Verify 42281675229 and Run site 42281675227 are successful on d8cfef5db50cab38b36354746ae3af607bfdaed0 only. They are not candidate receipts. Candidate CI is recorded in candidate-ci.json: the initial exact-head run discovery returned no advertised runs. No Verify dispatch or rerun was requested, because an immediate empty listing is not proof that the push event will not create its ordinary run. The branch has the existing push entry point; the guarded lander owns exact-head CI observation.

PROBE LKY-051 quorum: public enrollment and recovery routes, real split shares, no share or either one share -> decryption and finish refused; both -> intended encrypted company content recovered.
PROBE LKY-051 authority: requester and admitted scoped agent approval attempts -> refused; two independent current owners -> exact proposed policy activated; removal, deactivation, changed authority and policy replacement -> old case refused.
PROBE LKY-051 replay: same case completed concurrently -> exactly one success; duplicate concurrent release -> one insertion; captured release for another transfer transcript -> refused.
PROBE LKY-051 custody: both recovery-only owners read the target vault -> refused; actual Base archive restore -> no live recovery authority; custodian and member erasure -> old custody and session refused.
PROBE LKY-051 browser: member enrollment, both human reviews, file retention and actual company recovery -> completed at 1440 and 390.

PRE-READY: bounded custody behavior and dangerous refusals passed locally; no assertion was weakened; revocation, erasure and replay fences were exercised; Settings placement and labeled controls were inspected in the actual screens. Exact-head CI and complete publication scanning remain landing gates, not claimed results. No account or key blocker prevents landing this bounded partial progress. Full-clause hardware and delegation gaps remain as listed above.

The public evidence packet contains actual reports, command output and receipts. Screens showing only public synthetic account references and approval metadata are included; the image with the revealed synthetic note is retained locally and omitted from transport. No credential files, decrypted bundles, environment dump, private held-out material or symlink is selected.
