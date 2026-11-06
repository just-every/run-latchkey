# sx-latchkey-c-f276: scoped recovery rider

CLAIM LKY-032 PARTIAL points=none tests=tests/latchkey-recovery.mjs#scopedRecoveryJourney; tests/latchkey-recovery.mjs#recoveryArchiveErasureJourney; tests/browser/recovery-scoped.mjs#scopedRecoveryBrowserJourney; tests/runtime.mjs#People HTTP journey; tests/latchkey-subject-erasure.mjs#runSubjectErasureJourneys; tests/latchkey-restore.mjs#exerciseRecordsRestore

The selected 27 October LKY-009 and LKY-032 scoped single-custodian rider is implemented and locally proved. Whole-clause DONE is not claimed. No whole numbered acceptance point is promoted: the original acceptance includes native clients, named SSO and source-rights migration beyond this assignment.

- Repository: just-every/run-latchkey.
- Branch: cloud/sx-latchkey-c-f276.
- Candidate: 1c9e95b0183968009f9b4fe0a3656eb18cab0de8.
- Merged origin main: b516f222b935d566d6b0499809aa7b2c7f803900; main equality: false. No default branch was pushed.
- Exact-SHA Verify: 42295751721, event push, status in_progress, conclusion None. https://github.com/just-every/run-latchkey/actions/runs/42295751721
- No PR was created: Verify already has a branch push entry point.
- Counts before and after: 8 DONE, 26 PARTIAL, 46 MISSING, total 80. LKY-032 remains PARTIAL. Builder status flips: zero.
- Main's newer contract judgments were retained whole. The candidate differs from current origin main in no byte of CONTRACT.md, ACCEPTANCE.md or docs/CLAIMS.md.
- Plan row: LKY-032 selected scoped-recovery rider delivered; whole-clause row remains PARTIAL. No other plan row was changed.

## Plan and implementation

Target LKY-032 remains PARTIAL: native and provider authentication, source rights migration and the whole atomic authority matrix remain outside this bounded rider.
1. Inspect existing member-confirmed owner recovery, permission enforcement, archive exclusions and subject erasure.
2. Add owner-confirmed accounts.recover scopes for named company members and current full-account key domain; bind each fresh enrollment to exact grant and custodian generation.
3. Revalidate current grant and enrollment at every recovery door and transaction; refuse regrant revival, stale authority and incompatible policy. Preserve legacy owner recovery and independent-family fences.
4. Expose signed and REST administration, shipped CLI and Settings browser ceremonies. Register browser recovery journey; extend existing runtime, recovery and archive/erasure journeys.
5. Run touched emitted-Worker journeys, browser proof at 1440 and 390, typecheck, first-party check, generator write/check, migration checks and source lock regeneration. Restore generated views unchanged.
6. Push fleet-authored save and final candidate to named cloud branch; publish full report and actual receipts to separate evidence branch. Report exact SHA and exact-SHA CI state honestly, with held remainder.

The implementation adds additive migration 0049_latchkey_scoped_recovery.sql and two excluded authority tables. Owner-confirmed accounts.recover grants name each company member, exact existing company-account key domain, member generation and public keys, and custodian generation. Operator versions additionally prevent deactivation followed by reactivation from reviving old scopes. A replacement creates new grant identities; previous envelopes cannot be reassigned or revived by regranting. Scope arrays have no wildcard form.

Fresh member consent pins the exact non-owner custodian and signs a client-encrypted full-account envelope bound to that grant. This is the existing full company-account root, not per-vault cryptographic isolation. The service checks the current grant and matching enrollment at enrollment, start, review, approval, status and finish, including transaction guards after asynchronous notice delivery. The finish journey revokes authority after status has returned its approval and before committing the new account credentials; the finish door refuses and the account generation stays unchanged.

Legacy named-owner custody stays separate. Unknown enrollment policy tags refuse without conversion. LKY-051 two-person cryptography, named-owner quorum eligibility and independently protected enrollments were not changed. No live quorum result or independent cryptographic assessment is claimed. The current company-only and independent-family exclusions remain. Copied roots or envelopes cannot be recalled.

The Settings panel supplies owner grants, fresh member encryption and exact-case custodian review. The locked page supplies recovery start, scope and device review, explicit confirmation, download of both replacement custody files and completion. Buttons have visible text; the existing reveal and copy icons retain tooltips. The journey exercises keyboard activation, immediate tooltip focus, recovered note reveal and remasking, and both 1440 and 390 viewports without overflow. No homepage, logo, Base pin or workflow was changed.

The CLI adds recovery-scopes, recovery-scopes-set and recovery-scoped-enroll, retaining the existing start, review, approval and finish custody machinery and private file handling. Signed REST endpoints expose scope administration, scoped enrollment, review and approval. The REST success path performs encryption and decryption in the client, invokes real emitted-Worker routes and recovers populated company content; no handler result is faked.

## Frozen rider rubric and observed outcomes

All local journey rows below passed. The exact-SHA Verify event and conclusion are reported above; queued or running CI is not reported as green.

| ID | Selected rider outcome | Public proof and result |
| --- | --- | --- |
| R1 | Independent owner-confirmed recover permission, explicit company members and current key domain | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney; tests/runtime.mjs:229 # People HTTP journey. Allowed owner grant through signed, CLI and REST doors; non-owner delegation, absent confirmation, self, wildcard, stale generation and family-domain inputs refuse. |
| R2 | Fresh member-confirmed encrypted enrollment to an exact pinned non-owner | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney; tests/browser/recovery-scoped.mjs:21 # scopedRecoveryBrowserJourney. Wrong fingerprint, absent grant and wrong-member direct enrollment refuse. Valid consent produces client-encrypted custody and a separately saved credential. |
| R3 | Current matching scope and enrollment at every recovery stage | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney. Allowed enrollment, start, review, approval, status and finish. Narrowed or revoked scopes refuse pending review and completion. Revocation in beforeCommit reaches and is refused by the finish door after a successful status read. |
| R4 | Deactivation, reactivation and generation changes cannot revive authority | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney. Deactivate and reactivate the actual custodian through REST; old scope still refuses. Successful recovery increments member generation and old enrollment refuses. Current keys and generations are also checked by the shared authorization predicate. |
| R5 | A changed custodian needs fresh enrollment | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney. Another custodian cannot approve an existing case. A new owner-confirmed scope and new member-encrypted enrollment to that custodian complete recovery. |
| R6 | Stale, foreign, expired, tampered and replayed operations refuse | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney; existing runtime integrity journeys. Regrant does not revive an old envelope; foreign origin and wrong member refuse; expiry, tampered approval signature, duplicate approval and finished-case replay refuse. |
| R7 | Recovery-only authority grants no everyday or owner authority | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney. Populated item, attachment, history, encrypted export, people list, policy, settings, billing path, permission delegation and owner role attempts refuse. The billing path is a refusal, not a claim that commercial administration is implemented. |
| R8 | Legacy and incompatible policies stay separate; no quorum downgrade | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney; independentRecoveryJourney in the same file. Existing owner and self recovery still pass. An incompatible quorum-tagged enrollment refuses approval and completion and remains unapproved. No LKY-051 module was modified. |
| R9 | Archive restore cannot revive scope records; erasure cannot leave a downgrade path | tests/latchkey-recovery.mjs:148 # recoveryArchiveErasureJourney; tests/latchkey-subject-erasure.mjs:19 # runSubjectErasureJourneys; tests/latchkey-restore.mjs:20 # exerciseRecordsRestore. Real Base export and import exclude both new tables. Erasing the member, custodian or granting owner removes dependent custody and cases. Regrant to an erased person and old enrollment replay refuse. |
| R10 | Successful recovery through browser, CLI and signed REST administration with client-held custody | tests/latchkey-recovery.mjs:194 # scopedRecoveryJourney; tests/browser/recovery-scoped.mjs:21 # scopedRecoveryBrowserJourney. Shipped CLI grant, enrollment, start, approval and finish recover a typed note and exact attachment bytes. REST enrollment, review and approval recover another populated account. Browser recovers and reveals the intended typed note. Storage, wire, mail and audit inspections contain no tested private root or secret canary. |

## Whole-clause acceptance sentences and held remainder

| Acceptance sentence | Evidence or remaining gap |
| --- | --- |
| Native and each named SSO sign-in, followed by the complete role and tenant matrix | UNPROVED: native devices and named provider sandboxes are not held. This round makes no SSO change, including no Google OAuth change. |
| Refuse every unauthorized path without side effects | The bounded recovery-only matrix passes R1 to R10. The entire product matrix remains unproved; no whole-clause credit is claimed. |
| Revoked session and cross-origin replay, with untrusted SSO still unable to decrypt | Existing runtime replay and origin journeys pass. Provider-authenticated untrusted-device proof remains held. |
| Import the Helpdesk and IT Ops source groups with exact independent rights | UNPROVED: complete source-grant migration and the LKY-041, LKY-042, LKY-043 and LKY-071 source-rights prerequisites remain owed. |
| Exercise allowed verbs and forbidden policy, settings, billing, item and owner operations through current doors | The selected non-owner recovery verb and its forbidden everyday doors pass. Other atomic administration and report scopes remain omitted. |
| Export the complete source and destination rights matrix and block unresolved widening | UNPROVED: this round creates reviewed new recovery grants; it does not infer or migrate source authority. |

Inherited recovery duties retained: LKY-009 fresh verified member identity, explicit exact-case human review, client-held encrypted custody, unchanged MFA, notices and invalidation of old connected authority; LKY-027 independent-family exclusion; LKY-033 inactive restore; LKY-034 erasure and replay fencing. Existing journeys for these paths still run. Full recipient and authority root rotation, hardware and MFA qualification, native proof and the remaining whole-clause authority matrix are not inferred. Two-person quorum work remains exclusively LKY-051.

GAP LKY-032: Native and named SSO provider proofs, complete atomic administration and report permissions, source-grant migration, hardware and MFA qualification, full account-root rotation and the remaining whole-clause authority matrix remain unproved. The specified source-rights prerequisites and independent-family exclusions are unchanged.

No new policy default was needed: this implements the supplied 27 October delegation rider. No new ct ruling was requested.

## Probes

PROBE LKY-032 grant: owner signed, CLI and REST scope changes for an explicit member and company-account domain -> accounts.recover with fresh enrollment required; unauthorized delegation, absent consent and invalid domains refuse.
PROBE LKY-032 enrollment: pinned non-owner fingerprint plus explicit member confirmation -> encrypted custody and private credential; wrong member, absent grant and wrong fingerprint refuse.
PROBE LKY-032 pending authority: owner narrows or revokes, or custodian deactivates and reactivates -> pending review, status and completion refuse; a regrant cannot reuse the old enrollment.
PROBE LKY-032 finish: fetch approval, revoke in beforeCommit, then submit finish -> scoped_recovery_authority_required and unchanged account generation.
PROBE LKY-032 custody: freshly enroll a different named custodian -> CLI and REST-assisted recovery decrypt intended populated company content; old devices and enrollment replay refuse.
PROBE LKY-032 everyday doors: recovery-only custodian attempts item, attachment, history, export, policy, settings, billing, delegation and owner actions -> refused; recovery still completes under valid member consent and grant.
PROBE LKY-032 policy: incompatible policy, expiry, tampered signature and replay -> refused without conversion or a new approval.
PROBE LKY-032 lifecycle: populated real Base restore -> no scope or enrollment authority; member, custodian and granting-owner erasure -> dependent custody removed and old enrollment unavailable.
PROBE LKY-032 browser: Settings and locked recovery ceremonies at 1440 and 390 -> named company content recovered, revealed and masked; keyboard activation, focus tooltip and viewport bounds pass.

## DONE-RIDERS and pre-ready self-check

| Row | Result | Evidence or boundary |
| --- | --- | --- |
| 1 | PARTIAL for the whole clause; selected rider locally passes | R1 to R10 cover the bounded rider; native, providers and the full rights migration remain gaps. |
| 2 | PASS for selected rider | Real populated encrypted records, actual allowed recovery and unsafe refusal, unchanged generation on refused finish, exact attachment bytes. |
| 3 | Verify pending as stated above | Recovery script is in verification.json runtime commands; tests/browser/vault.mjs invokes the new journey by default at both widths. Screenshot output is optional; behavior is not behind an environment flag. |
| 4 | PASS for local proof binding | Relevant implementation and browser/runtime test bytes are unchanged since their final passing runs. Recovery was rerun after the final authority assertion. receipt.json binds current blobs and hashes; mechanical-receipt.json binds checks to this exact committed head. |
| 5 | INSPECTED | The receiving LKY-032 text explicitly carries the supplied LKY-009 delegation rider; no new inherited completion is claimed. |
| 6 | PASS mechanically, generated views intentionally restored | Generator write and check pass, then both generated files are taken whole from origin main. A direct check of those restored views can fail on candidate provenance and is expected under the cloud contract. No builder Status, Gap or Evidence edit. |
| 7 | PASS | No acceptance point, ruling, coverage map or summary count was edited by this builder. Main's newer judgments are retained whole. |
| 8 | PASS for selected authority | Owner confirmation, non-owner refusal, scope changes during pending recovery, post-status finish revocation, ordinary-door refusals and secret-free audit are exercised. |
| 9 | PASS boundary retained | No native, provider delivery, legal, hardware or independent cryptographic claim. Mail is an official-schema network-edge fixture. |
| 10 | PASS | The supplied 27 October rider authorizes this scope; no invented wildcard or per-vault isolation, no new policy default. |
| 11 | PENDING maintained lander | Candidate is branch-only. Publication scan, exact-SHA landing and post-landing Run site are not claimed in cloud. |

Pre-ready: no existing assertion was removed, narrowed, skipped or moved behind a width condition. The new touched-only selector leaves the default Verify registration intact. No permanent test registration was deleted or cap raised. Recovery, erasure and replay paths do not restore authority. New UI text is at least 14px, configuration is under Settings, fields have complete borders and new controls have visible labels; existing reveal and copy icons use tooltips. Publication scanning remains a maintained Mac landing gate. No credential or environment dump is selected for evidence.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node scripts/contract-docs.mjs write LKY-032 then check LKY-032 exit=0, followed by whole-file restore from origin main; ledger=nativeMigrationPreflight via migration-ledger.mjs exit=0, 49 applied migrations, scoped migration present, nativeApply=false.

Exact-SHA scan receipt: commit=1c9e95b0183968009f9b4fe0a3656eb18cab0de8; complete=false; historyScanned=false; findings=unestablished; status=delegated to maintained Mac lander. Main equality=false. Run site has not run for this branch head. These are not a product failure or a DONE claim.

## Receipts and custody

Local successful outputs: recovery-output.txt, browser-output.txt, runtime-output.txt, typecheck-output.txt, views-output.txt and migration-ledger-output.txt. mechanical-receipt.json carries exact-head commands and exits. receipt.json carries product provenance, current CI state, source blobs, hashes and honest landing boundaries. PLAN.txt is the original work plan. The twelve screenshots in screens show the owner, member, custodian, pending, completed and unlocked states at 1440 and 390. Only explicit regular files are published to the separate evidence ref; no custody files, sessions, credentials or environment values are included.

Initial development corrected an unawaited fingerprint and a typed-record assertion, and added the existing owner step-up ceremony to the granting-owner erasure fixture. One standalone local test was interrupted after an overlapping build and its owned processes were stopped; subsequent complete sequential recovery and runtime journeys passed. No CI test was weakened or rerun to conceal a failure. Earlier candidates were superseded while proof was completed and fresh main judgments were merged; only the final exact head above is handed off.
