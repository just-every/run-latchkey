# LKY-032 scoped recovery continuation

Candidate: d45887877be379c6326ac1fce7c69d4e89656018 on cloud/sx-latchkey-c-f277, repository just-every/run-latchkey.
Integrated main: b516f222b935d566d6b0499809aa7b2c7f803900. Product push succeeded. No PR is needed: push starts Verify.
Verify 42302266849, event push, exact candidate SHA, was in progress at discovery. No green conclusion is claimed. Main at integration had successful Verify 42294936082 and Run site 42294936116. Publication scanning, main equality and candidate Run site are maintained Mac landing duties and remain unestablished here.

LKY-032 remains PARTIAL. Counts before and after: 8 DONE, 26 PARTIAL, 46 MISSING, 80 total. The plan row for LKY-032 retains its status; the scoped single-custodian rider now has the additional proof below. No other plan row or contract Status row changed. The requested prior f276 base was rebased onto main before the first published save; after publication main was fetched and merged, already up to date. Other writers' commits were retained.

The inherited implementation already supplied owner-confirmed exact member scopes, encrypted member enrollment to a pinned non-owner custodian, live authorization at all recovery stages, public CLI and REST administration, archive exclusions and subject-erasure mappings. This continuation fixes stale enrollment consent: changing the custodian, selected scope or pinned fingerprint clears consent, including changes through another form bound to the same value. It extends the existing journeys for every-stage refusal, unchanged account state, pending-case browser revocation, exact approval replay across different cases, altered ciphertext and concurrent finish. No two-person cryptography, owner quorum policy, provider integration, Google OAuth configuration, root-key rotation or additional administrator role was changed.

## Completed scoped-rider rubric

The following rows describe the requested delta, not completion of the whole contract clause. All listed journeys passed locally on bytes matching the candidate; the exact-SHA Verify event is push, run 42302266849, conclusion pending for every row.

| Row | Requested outcome | Actual public-door proof and location | Result |
| --- | --- | --- | --- |
| R1 | Owner confirms independent recover authority for exact named company members and existing key domain | tests/latchkey-recovery.mjs, scopedRecoveryJourney, lines 194–218; tests/runtime.mjs, Scoped recovery HTTP journey, lines 229–252; tests/browser/recovery-scoped.mjs, scopedRecoveryBrowserJourney, lines 30–37 | MET locally |
| R2 | Fresh member consent and encrypted enrollment to exact pinned non-owner; wrong fingerprint and no grant refuse | scopedRecoveryJourney, lines 203–220; scopedRecoveryBrowserJourney, lines 39–56; src/latchkey/recovery/scoped-ui.tsx line 13 clears consent on every binding change | MET locally |
| R3 | Exact scope and enrollment required at enrollment, start, review, approval, status and finish | scopedRecoveryJourney, refusedStages, lines 247–277 executes each stage and checks unchanged account generation and password record; native and REST review are both exercised | MET locally |
| R4 | Narrowing or revocation invalidates already approved pending cases, and regrant does not revive an old envelope | scopedRecoveryJourney, lines 237–261; Scoped recovery HTTP journey, lines 243–252; scopedRecoveryBrowserJourney, lines 83–107 | MET locally |
| R5 | Deactivated custodian cannot act; reactivation does not revive old scope | scopedRecoveryJourney, lines 262–268, includes 401 for the inactive custodian and scoped-authority refusal for the member | MET locally |
| R6 | Changed member generation or recovery key domain binding refuses pending use | scopedRecoveryJourney, lines 270–277 changes the stored generation and recipient-key binding and repeats every-stage refusal; stale generation and family-domain grant requests refuse earlier in the same journey | MET locally |
| R7 | Changed custodian requires fresh member enrollment; existing envelope is not reassigned | scopedRecoveryJourney, lines 289–316, actual shipped CLI regrants, pins and freshly enrolls to the replacement custodian, then recovers the original note and attachment | MET locally |
| R8 | Successful non-owner recovery through browser, shipped CLI and signed and REST administration | scopedRecoveryBrowserJourney, lines 57–82 opens the recovered note in the browser; scopedRecoveryJourney, lines 294–344 completes CLI and REST-backed enrollment and approval with actual client cryptography | MET locally |
| R9 | Foreign, expired, tampered and replayed operations refuse without successful unsafe recovery | scopedRecoveryJourney, lines 220–236 and 278–344; accepted approval copied to a different case and altered ciphertext are rejected; the other case remains unapproved | MET locally |
| R10 | One concurrent finish succeeds, the other refuses, with one live new device | scopedRecoveryJourney, lines 335–342, two real requests against the emitted Worker and account-state reconciliation | MET locally |
| R11 | Recovery-only scope supplies no everyday item or attachment read, export, settings, policy, grant-delegation or owner role | scopedRecoveryJourney, lines 226–236; original data remains unavailable to both custodians after recovery. Existing settings and owner-role routes are exercised. Billing has no operative product route in this checkout; its unknown route refuses, and no billing permission is introduced. Complete future billing authority remains outside this claim | MET for current doors; broader matrix remains GAP |
| R12 | Unknown or incompatible policies refuse without conversion; legacy named-owner path stays separate | scopedRecoveryJourney, lines 278–287; independentRecoveryJourney continues to recover through the legacy owner path. No live two-of-two result or cryptographic assessment is claimed | MET for refusal and legacy regression |
| R13 | Client-held custody; roots, passwords, recovery payload and item content stay absent from storage, wire and audit | scopedRecoveryJourney, final storage, mail and audit assertions; scopedRecoveryBrowserJourney records requests from both the member and custodian browsers and inspects them for the planted private values | MET locally |
| R14 | Real Base archives restore without active scopes or recovery enrollment; later erasure cannot replay them | tests/latchkey-recovery.mjs, recoveryArchiveErasureJourney, lines 148–184; tests/latchkey-restore.mjs, exerciseRecordsRestore, line 24; tests/runtime.mjs invokes the actual archive restore and later-journal replay journeys | MET locally |
| R15 | Erasing the member, custodian or granting owner removes dependent scopes, enrollment bindings and cases | recoveryArchiveErasureJourney includes custodian and granting-owner erasure; tests/latchkey-subject-erasure.mjs, runSubjectErasureJourneys, lines 58–65 and 92–99 removes a live pending case and refuses the captured enrollment and status replay | MET locally |
| R16 | Company-only custody, independent family exclusion and full-account envelope limits remain explicit | scopedRecoveryJourney refuses family-domain scopes and family membership during active enrollment; independentRecoveryJourney and emergencyRecoveryJourney keep separate owner and selected-family paths; recovery README describes the full account envelope and no per-vault isolation | MET for current scope |

## Whole-clause acceptance and inherited obligations

No full numbered acceptance point is claimed closed; the contract does not number the sentences and its original broad obligations remain intact.

| Acceptance sentence or inherited duty | Evidence and remaining boundary | Assessment |
| --- | --- | --- |
| Native and each named SSO sign-in, then role, tenant, object and admin refusals | Existing runtime authentication and isolation proof plus the scoped rubric above; native clients and named provider sandboxes are not held | PARTIAL, external proof missing |
| Every unauthorized path refuses without side effects | Scoped rider executes allowed and forbidden current doors and compares resulting account state; complete whole-product role matrix remains omitted | PARTIAL |
| Revoked session and cross-origin replay refuse; SSO on an untrusted device cannot decrypt | tests/runtime.mjs Tamper and authority and Device/account lifecycle journeys pass; actual SSO device proof remains unestablished | PARTIAL |
| Import Helpdesk and IT Ops with distinct atomic administrator rights | No source-grant migration is implemented or inferred; LKY-041, LKY-042, LKY-043 and LKY-071 source-rights prerequisites remain | UNPROVED |
| UI, CLI and API allowed actions and forbidden policy, settings, billing, values and owner operations | Current scoped recovery is proven through the rubric above; all broader atomic administration and report scopes remain omitted | PARTIAL |
| Export full source and destination permission matrix, blocking unresolved semantics | Exact source estates and complete rights mapping remain unproved | UNPROVED |
| LKY-009 recovery custody and independent-family exclusions | Existing self, named-owner, selected family emergency, CLI and archive-erasure journeys pass alongside scoped recovery; separate MFA and complete root rotation remain gaps | PARTIAL, preserved |
| LKY-051 two-person governance remains separate | No quorum code, enrollment conversion or eligibility change. Incompatible scoped-policy refusal is exercised; no live quorum result is inferred | INSPECTED separation, no completion claim |
| LKY-014 inherited audit and held-detail duties | Existing Audit HTTP journey passes in tests/runtime.mjs, including audited refusal and threshold; richer activity console and whole-clause inherited duties are not claimed | PARTIAL, unchanged |
| LKY-069 reconciliation, owner custodian and offboarding duties | Existing Manual offboarding HTTP journey passes; scopes do not authorize offboarding or invent company hand-back | PARTIAL, unchanged |

## DONE-RIDERS review

1. FAIL for whole-clause DONE: native sign-in, SSO, source migration and the remaining matrix are unproved. Scoped rider proof is R1–R16.
2. PASS for this delta: real seeded company content and attachments recover; unsafe cases are attempted and refused, with unchanged account state.
3. PENDING: push Verify 42302266849 is bound to the exact SHA. Both browser widths are invoked by the default registered vault-browser shard; local proof is not represented as green CI.
4. PASS for local byte provenance: receipts.json records matching hashes of all relevant source and journey files. No relevant bytes changed after their successful runs.
5. PASS for the delta: LKY-032 names the LKY-009 delegated recovery duty in its existing clause; no new Base duty or inheritance claim was added.
6. PASS for builder mechanics: generator write then check succeeded; main views were restored whole. Their expected stale-view check exits 1 and is left to the lander. Counts and Status cells are unchanged.
7. PASS: no acceptance text, ruling, coverage map or Status cell changed.
8. PASS for scoped recovery authority, PARTIAL for the entire authority matrix. See R3, R4, R5 and R11.
9. PASS: no native, SSO, hardware, provider, external-copy erasure or legal proof is inferred.
10. PASS: the existing 27 October delegated-recovery rider governs this work. No new custody default was adopted and no ASK is needed.
11. PENDING lander: main does not equal this cloud head; exact-SHA publication scan and post-landing Run site are not established. No DONE count is requested.

## Checks, probes and custody

All local commands and actual outputs are in receipts.json and the accompanying text files. Recovery, HTTP, restore, subject erasure, browser, typecheck and first-party checks passed. The installed migration ledger matches all 49 migration files, including the new scoped migration, with zero unmatched entries. No test registration was added by this continuation. No existing assertion was removed, narrowed, hidden behind a width or branch condition, or disabled. New adverse assertions are folded into the existing journeys. New browser assertions run at 1440; 390 executes the changed screens and retains viewport proof.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node scripts/contract-docs.mjs write LKY-032 then check LKY-032 exit=0; ledger=node /tmp/f277-ledger.mjs exit=0.
The restored main ACCEPTANCE.md view check exits 1, with the expected stale-view message. Neither generated view is committed. CONTRACT.md equals main byte for byte. The source lock check on committed HEAD succeeds.

PROBE LKY-032 scoped-recovery: browser owner grant, fresh member encryption and non-owner exact-case approval; shipped CLI and REST-backed approval -> intended company note and attachment recover, custodian everyday read refuses.
PROBE LKY-032 authority: narrow or revoke scope, deactivate custodian, change generation or bound key, then attempt each stage -> refusal with unchanged member account; browser open case shows revoked-grant refusal.
PROBE LKY-032 replay: copy valid approval to another case, alter ciphertext and race two finishes -> copied and tampered approval refuse; exactly one finish succeeds and exactly one new device remains active.
PROBE LKY-032 erasure: real Base restore and reviewed member, custodian and granting-owner erasure -> no active recovery authority restored; captured enrollment and pending-status replay refuse.

Pre-READY self-check: the scoped delta has public-door proof both ways; assertions and existing policy boundaries remain; revoked, erased and replayed authority cannot revive the tested scope; the touched Settings panel retains 14px text, complete field borders and text-labeled controls; inherited item-reveal tooltip is exercised by keyboard. Browser images show the screens at 1440 and 390. Publication scan is NOT RUN in cloud: commit d45887877be379c6326ac1fce7c69d4e89656018, complete=false, historyScanned=false, findings=unknown. No zero-findings claim is made. Main equality and Run site for the candidate remain lander duties. No new personal email address or provider-shaped credential fixture was added.

GAP LKY-032: Native and named SSO proofs, complete atomic administration and report scopes, source-grant migration and rights matrix, hardware and MFA qualification, complete account-root rotation and the remaining whole-clause authority matrix remain unproved. The requested scoped single-custodian delta has local proof; this report does not claim whole-clause DONE, live two-person quorum or independent cryptographic review.

CLAIM LKY-032 PARTIAL points=none tests=tests/latchkey-recovery.mjs#scopedRecoveryJourney; tests/browser/recovery-scoped.mjs#scopedRecoveryBrowserJourney; tests/runtime.mjs#Scoped recovery HTTP journey; tests/latchkey-subject-erasure.mjs#runSubjectErasureJourneys; tests/latchkey-restore.mjs#exerciseRecordsRestore
