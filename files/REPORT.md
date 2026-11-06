# LKY-032 scoped recovery continuation

Plan: preserve the prior scoped-recovery implementation at d45887877be379c6326ac1fce7c69d4e89656018, integrate current main, map the live rider to public-door proof, close any remaining native-seed authorization gaps, run the touched recovery, HTTP, restore and person-erasure journeys and typecheck, regenerate contract views only for checking, restore generated views, regenerate source lock last, commit and push the named product branch. Publish complete non-secret reports and receipts separately. No Status, Gap or Evidence cells will change.

Starting counts: 8 DONE, 26 PARTIAL, 46 MISSING; LKY-032 PARTIAL. Current main contains no quorum implementation files. Preserve the explicitly separate two-person policy; unknown policies must fail closed. No named SSO provider, native device, source estate or cryptographic assessment is inferred.

Proof map: scopedRecoveryJourney in tests/latchkey-recovery.mjs covers owner confirmation, exact member and company-account domain, fresh member consent, key pinning, client-held custody, case start, review, approval, status, finish, revocation and deactivation, changed custodian, CLI and REST success, ciphertext-only storage, expiry, tamper and replay refusal. recoveryArchiveErasureJourney covers actual Base archive restore and member, custodian and grantor erasure. tests/runtime.mjs exercises the permission and recovery HTTP doors and the broader restore and subject-erasure journeys. scopedRecoveryBrowserJourney is registered in tests/browser/vault.mjs, with assertions at 1440 and screen proof at 1440 and 390.

Unproved whole-clause outcomes: native and all named SSO proof; complete independent administration and reporting permissions; source-rights mapping under LKY-041, LKY-042, LKY-043 and LKY-071; hardware and separate MFA qualification; complete root rotation; remaining whole-clause authority matrix. These are not counted as DONE. No acceptance text or inherited duties change.

## Implementation and policy decisions

The prior five product commits are retained. This round adds member-signature and purpose validation whenever recovery authority is evaluated, so losing the scope-policy binding cannot reinterpret a scoped envelope as legacy owner custody. Case start requires the credential's exact scoped policy, scope identity and custodian. The client rejects unknown policy descriptors; the Worker independently rejects stripped, wrong-policy, wrong-scope or changed-custodian input before creating a case or sending its notice. Legacy self and named-owner recovery retain their existing inputs and complete in the recovery sanity journey.

The existing ct ruling dated 27 October governs this work. No new custody or consent default is adopted. Company-only custody, independent-family exclusion, client-held keys and full-account-envelope limits remain explicit. No wildcard grants, per-vault cryptographic isolation, provider authority, MFA bypass or quorum conversion is introduced. The main integrated by this round has no quorum implementation files; the separate LKY-051 work is neither modified nor claimed as executed evidence.

Proof is through the emitted Worker, actual D1, shipped CLI and actual browser. Fixtures replace only the mail-provider network edge with its schema; no actual inbox delivery is claimed. Storage fault injections test incompatible policy and stale bindings but do not impersonate successful public-door grants. Owner grants, enrollment, revocation, person deactivation and actual custodian recovery use public doors.

## Frozen scoped-rider rubric

Each row below refers to tests/latchkey-recovery.mjs#scopedRecoveryJourney unless another journey is named. The exact final head and command outcomes are in checks.jsonl. Local proof does not substitute for the independent exact-head Verify and publication scan.

| Row | Rider or inherited duty | Public-door evidence |
| --- | --- | --- |
| R1 | Owner-confirmed independent recover permission, explicit members and existing company-account domain; no wildcard or ordinary rights | Lines 202–218: no grant, no owner consent, wrong member, wrong domain, wildcard and stale generation refuse; owner PUT creates the exact grant. CLI scope replacement and REST grant creation are also exercised. |
| R2 | Fresh member-confirmed encrypted enrollment to exact pinned non-owner custodian; replacement requires fresh enrollment | Lines 210–221 and 355–374: wrong member and fingerprint refuse; changing custodian uses a new scope and fresh shipped-CLI enrollment. tests/browser/recovery-scoped.mjs#scopedRecoveryBrowserJourney lines 35–57 exercises actual consent and clears it when the selected custodian or fingerprint changes. |
| R3 | Both enrollment and current scoped authority at enrollment, case start, review, approval, status and finish | Lines 267–308: all stages refuse after revocation, deactivation, changed member binding, generation or account key, with unchanged member generation and unconsumed case. Narrowing also refuses an already-approved case. |
| R4 | Unknown or incompatible policy refuses without conversion or downgrade | Lines 221–237 and 309–338: client and Worker reject unknown descriptors; stripped policy, wrong scope and custodian create no cases. Missing binding and altered member-signed purpose refuse start, review, approval, status and finish. The self and legacy owner success paths in independentRecoveryJourney still complete. No live LKY-051 result is inferred. |
| R5 | Narrowed, revoked, deactivated or changed generation cannot revive pending or subsequent use | Lines 257–348: owner replacement, owner revocation, inactive custodian and member, reactivation without regrant, and a real custodian recovery all invalidate old authority. New connected custody cannot approve a previous-generation case. |
| R6 | Recovery-only permission cannot grant everyday item or attachment reads, export, policy, settings, delegation or owner-only actions | Lines 239–258: actual item, attachment, history, export, REST item, roster, grant-delegation, sharing-policy, owner-role and identity and Business settings mutation attempts refuse. Persistent identity and Business settings remain unchanged. The unimplemented billing route returns refusal; this is no claim to complete billing administration. |
| R7 | Stale, foreign, expired, tampered, replayed and concurrent operations refuse | Lines 218–237 and 350–409: foreign origin and members, expired case, altered ciphertext and signature, cross-case approval replay and repeated approval are refused. Concurrent finishes yield exactly one success, one live replacement device and one generation increment. |
| R8 | Intended company content recovers through shipped CLI, REST administration and browser while custody remains client-held | Lines 356–409 recover the actual encrypted item and attachment through CLI; a second member completes recovery with REST enrollment and approval. tests/browser/recovery-scoped.mjs#scopedRecoveryBrowserJourney lines 59–88 uses distinct member and custodian browser contexts, retains replacement files, completes recovery and decrypts the intended company note in the browser. |
| R9 | Secret-free storage, wire, notices and audit, independent-family exclusion | The scoped journey checks recovery storage and notices against actual private-key, password and content canaries. Browser lines 28–30, 81 and 106 inspect requests against canaries. Independent recovery covers family enrollment refusal, provider notice acceptance and existing secret-free audit and storage; tests/runtime.mjs retains its complete request, response and persistence canary sweep. |
| R10 | Inactive archive restore, member, custodian and grantor erasure, replay fences | tests/latchkey-recovery.mjs#recoveryArchiveErasureJourney lines 148–185 performs real Base export and import, verifies absence of both new tables and all live recovery authority, and checks custodian and grantor erasure without fallback. tests/latchkey-subject-erasure.mjs#runSubjectErasureJourneys lines 58–65 and 90–95 checks member removal and replay refusal; invoked by tests/runtime.mjs lines 592–593. tests/latchkey-restore.mjs#exerciseRecordsRestore retains inactive-domain checks. |
| R11 | Actual registered browser journey, keyboard operation and proof at 1440 and 390 | tests/browser/vault.mjs lines 19 and 25 invokes scopedRecoveryBrowserJourney at both widths under its normal Verify entry. The journey asserts business behavior at 1440, takes the changed screens at both widths, checks overflow, keyboard grant submission and the revealed-field focus tooltip. |

## Whole-clause acceptance coverage

The current CONTRACT.md expresses LKY-032 as an unnumbered paragraph, not separately numbered acceptance points. No complete broader numbered point is claimed. Each sentence or duty is recorded here to preserve its scope:

1. Authentication independent of decryption: the existing HTTP journey proves password-only and session-only refusal; the whole native and SSO matrix remains unproved.
2. Every named native and SSO provider, with no IdP decryption key: NOT ESTABLISHED; native devices and provider sandboxes are unavailable. No Google OAuth change.
3. All named roles have distinct least-privilege rights: scoped recover and existing independent people permissions are proved; the complete roles matrix remains PARTIAL.
4. Current tenant, identity and object authority at every route, attachment, search, export, job and broker: current scoped recovery phases and forbidden ordinary doors are covered; whole-product completeness remains PARTIAL.
5. Browser origin and request integrity: existing tests/runtime.mjs tamper-and-authority journey executes signed and cross-origin refusals.
6. Session expiry, rotation, revocation and setup without default password: existing emitted-Worker lifecycle and recovery journeys exercise current doors; complete native and SSO proof is not established.
7. Signed-out and foreign callers cannot enumerate installation and member data: existing HTTP journeys retain these checks; the full authority matrix remains unclaimed.
8. Custom administration groups with every independent listed permission: recover is independently scoped, people rights remain independent, but all remaining administration and reporting scopes are unproved.
9. Recovery never grants item viewing, policy management or unrestricted export: R6 and R8 execute recovery successfully and refuse the dangerous ordinary uses.
10. Owner-only transfer, deletion and owner authority: the recover holder cannot change owner roles or delegate grants; complete owner-only matrix remains unproved.
11. Exact source-rights matrix for every named source: held source estates and LKY-041, LKY-042, LKY-043 and LKY-071 prerequisites remain unchanged; no migration result is inferred.
12. Member-enrolled named non-owner recovery administrator, independent named-member and key-domain scope: R1–R4 and R8 cover the requested live rider.
13. A changed custodian needs fresh enrollment; narrowed, revoked or inactive custody refuses: R2, R3, R5 and browser revocation proof cover this rider.
14. No item, export, settings, billing or owner-only authority from recovery: R6 covers every currently implemented named door and refuses the unavailable billing route; complete future billing and owner-only matrices remain owed.
15. Allowed recovery and forbidden actions through public doors: the named sanity journeys execute both outcomes; no full-clause DONE count is inferred from this bounded rider.

## DONE-RIDERS and pre-handoff self-check

1. PARTIAL for the full clause: native, provider, source-rights and broader authority outcomes remain unproved. R1–R11 identify the scoped outcomes reached locally.
2. PASS locally for the scoped rider: real encrypted company content and attachment recover; dangerous unauthorized paths refuse with unchanged account or settings state.
3. PENDING independent Verify on the exact final head. The recovery and browser journeys are registered in existing push Verify commands; no workflow is edited.
4. PASS locally when checks.jsonl names the final head; no relevant code changes after those runs are intended.
5. INSPECTED: no clause text or inherited duty changes; original LKY-032 duties remain intact.
6. PASS mechanically: contract generator write and check; generated views restored from main and not committed. Counts remain 8 DONE, 26 PARTIAL and 46 MISSING. The lander owns Status, Gap and Evidence cells.
7. PASS: no acceptance or Status row edits and no new acceptance points.
8. PASS locally for the scope in this round: R3, R5 and R6 cover current authority and unchanged-state refusals. The broader whole-clause matrix remains PARTIAL.
9. PASS honesty boundary: no native, provider, inbox-delivery, legal, MFA, hardware or independent cryptographic result is claimed.
10. PASS: the existing 27 October ruling governs; no new default or ct scope request.
11. PENDING guarded lander: main equality, exact-head Verify, Run site and COMPLETE full-history publication scan with zero findings are not established in this cloud run. No landing is claimed.

Pre-handoff: existing assertions were not removed, weakened or hidden behind new conditions. This round extends existing registrations. The inherited browser journey asserts at 1440 and produces screen proof at 1440 and 390. Existing scope and person-erasure replay fences remain. No UI source was changed by this round; the continuation's scoped panel remains under Settings with text at least 14px and text-labeled controls. The browser checks the touched field tooltip. No new email-shaped fixture literal was added in this round; existing synthetic mailbox fixtures remain. Source lock is regenerated by the documented command after the last source and test edit. Publication scanning remains a Mac gate, not an invented cloud receipt.

A development-only test comparison initially included D1 timing metadata, whose duration changed despite identical persistent rows. It was corrected before publication of the candidate to compare the actual settings rows, retaining exact refusal-code assertions and adding Business settings state preservation. The unpublished candidate was amended; checks.jsonl retains the failed development-head result as well as the final-head runs. This was not a Verify failure or CI repair.


## Final results and custody

Product branch: cloud/sx-latchkey-c-f278. Full head: beac74566518d15852d7bd5c569b9d5fe2ddc6c1. Integrated main: b516f222b935d566d6b0499809aa7b2c7f803900. The last pre-push fetch and merge found main already integrated; remote product head equals the candidate. All seven candidate commits, including inherited continuation commits, have fleet author and committer identity and no trailers. No published history was rewritten. The first save and final candidate were pushed with the required cloud push guard; no push was rejected. There is no pull request because branch push is the Verify entry point.

Local exact-head results: typecheck exit 0; recovery sanity journey exit 0 (42 seconds); HTTP, restore and subject-erasure suite exit 0 (131 seconds); registered browser recovery at 1440 and 390 exit 0 (19 seconds); first-party check exit 0. The browser proof contains 14 regular PNG files. Screens at desktop and phone widths were also visually inspected. Both new tables are absent from real restored archives, person erasure removes dependent custody, and stale or replayed operations cannot restore authority.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node scripts/contract-docs.mjs write LKY-032 then check LKY-032 exit=0; ledger=node /tmp/latchkey-ledger.mjs exit=0. Ledger shape is Wrangler, 49 applied names exactly match repository migrations and none are pending; historical content hashes are unavailable in that ledger. The edition source lock separately checks current source bytes. Generated views and CONTRACT.md have no product diff.

Exact-head branch Verify: run 42306622374, push event, in_progress at discovery. No result from a different head is claimed and no duplicate workflow is dispatched. Current main was independently observed green: Verify 42294936082 and Run site 42294936116 at b516f222b935d566d6b0499809aa7b2c7f803900. Those are main health evidence only. Candidate main equality, Verify success, Run site and publication scanning remain guarded landing duties. Scan receipt: commit=beac74566518d15852d7bd5c569b9d5fe2ddc6c1, complete=not-established, historyScanned=not-established, findings=not-established. This cloud run does not claim a completed scan or landing.

Before and after counts: 8 DONE, 26 PARTIAL, 46 MISSING, 80 total. LKY-032 remains PARTIAL. Planner row: scoped recover delegation rider now has public-door implementation and proof, including policy downgrade prevention and exact descriptor binding. The broader row stays partial with native, SSO, source-rights, administration, hardware and root-rotation gaps. No lane file is modified.

PROBE LKY-032 scope: owner PUT, signed enrollment and CLI enrollment for explicit member and company-account domain -> allowed; no grant, wrong member, wrong domain, wildcard, altered descriptor and missing consent -> refused, no case or member-state changes.
PROBE LKY-032 live-authority: revoked or narrowed grant, inactive or reactivated member or custodian, changed member or custodian generation and changed account key -> pending and subsequent use refused.
PROBE LKY-032 policy: incompatible stored policy, missing binding, altered signed purpose and stripped or changed credential policy -> refused without legacy conversion or downgrade.
PROBE LKY-032 recovery: CLI, REST administration and distinct human browser contexts -> intended encrypted company note and attachment recovered; old connected member authority and replay refused.
PROBE LKY-032 everyday-authority: item, attachment, export, history, policy, delegation, owner-role, identity settings and Business settings attempts by recovery-only custodian -> refused; member and settings rows unchanged. Unsupported billing route refuses without creating billing authority.
PROBE LKY-032 erasure-and-restore: real Base archive import and owner-reviewed person erasure -> no scope or recovery custody restored; erased captures and pending operations refused.

CLAIM LKY-032 PARTIAL points=none tests=tests/latchkey-recovery.mjs#scopedRecoveryJourney; tests/latchkey-recovery.mjs#recoveryArchiveErasureJourney; tests/runtime.mjs#Scoped recovery HTTP journey; tests/browser/recovery-scoped.mjs#scopedRecoveryBrowserJourney; tests/latchkey-subject-erasure.mjs#runSubjectErasureJourneys
GAP LKY-032: Native and named SSO proof, complete administration and reporting scopes, source-rights migration, hardware and separate MFA qualification, full root rotation and the remaining whole-clause authority matrix remain unproved. LKY-051 quorum custody remains separate and is not claimed.

The complete selected packet is published only to the task's evidence ref, separately from product custody. receipt.json binds the actual local results and terminal product provenance to the full candidate head. The maintained Mac gate must independently rerun its checks before landing.
