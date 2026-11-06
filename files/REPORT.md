# sx-latchkey-c-f279 — scoped recovery continuation

Repository: just-every/run-latchkey. Product branch: cloud/sx-latchkey-c-f279.
Candidate: 4e58b63a8513e5588f49b2851fd0913e7bcf03e7.
Starting candidate: beac74566518d15852d7bd5c569b9d5fe2ddc6c1.
Observed main: b516f222b935d566d6b0499809aa7b2c7f803900.
Claim: LKY-032 remains PARTIAL. Counts before and after: 8 DONE, 26 PARTIAL,
46 MISSING, 80 total. No Status, Gap, Evidence or acceptance text changed.
No generated view, workflow, Base pin, homepage or branding change is included.

## Outcome and concrete repair

The inherited implementation already provides owner-confirmed named non-owner
recovery grants, fresh client-encrypted member enrollment and successful browser,
CLI and REST recovery. This continuation found an additional public-door defect:
a modified credential account, tenant or generation created a recovery case and
sent its member notice before the client noticed the wrong identity. The new
assertion reproduced the defect against the original emitted Worker:
`changed credential identity must not create a recovery case`, actual 2,
expected 1, in `scopedRecoveryJourney`.

Scoped start requests now carry the credential's exact account, tenant and
generation. The server compares them with the freshly authenticated member
before creating a case or sending a notice. The browser explains a mismatch and
lets the member select the correct credential. Legacy self-recovery and named
owner request shapes are preserved. No key-domain isolation or quorum policy
conversion was introduced.

The existing recovery sanity journey also now replays its actual signed
enrollment, changes its signed custodian, changes its request origin and expires
its request timestamp. All refuse without new custody or mail. The shipped CLI
attempts real item reads, export, history and attachments using recovery-only
custody: it receives an authority refusal and creates no output file. It also
attempts owner promotion, people-right delegation and recovery-grant delegation,
checking unchanged roles and rights. All existing assertions remain.

Two commits belong to this continuation: a74f2a5 is the published safety save;
4e58b63 is the browser proof and final candidate. Seven inherited product commits
from the requested base remain in the branch. Main was fetched and merged
without changes after publication; no published commit was rebased or rewritten.
The final source lock was regenerated and checked after the generated views were
restored. All candidate authors and committers are the fleet identity; no
co-author trailer is present.

## Full LKY-032 acceptance accounting

The acceptance paragraph is unnumbered. The sentence numbers below are a report
index, not added acceptance points. No complete numbered acceptance sentence is
newly claimed; `points=none` avoids crediting a scoped subset as whole-clause
completion.

| Sentence or inherited duty | Evidence and limit | Result |
| --- | --- | --- |
| A1: Native and every named SSO sign-in, then unauthorized guest, auditor, billing, foreign and signed-out doors | Existing HTTP authority journeys plus scoped recovery cover current emitted Worker doors. Native clients and named live provider sandboxes are not held. No Google OAuth change. | PARTIAL; external proof held |
| A2: Refuse every unauthorized path without side effects | `tests/latchkey-recovery.mjs`, scopedRecoveryJourney, lines 205–276, 284–377 and 388–411: enrollment, current grants, settings, reads, export, attachments, delegation and owner role refusal. New mismatch checks at 244–250 retain both case count and mail count. Broader whole-product matrix remains unproved. | MET for selected recovery rider only |
| A3: Revoked sessions, cross-origin mutations and SSO on untrusted devices | `tests/runtime.mjs`, Tamper and authority journey, lines 315–331, and Device and account lifecycle journey. Actual scoped enrollment replay, changed origin and expired request are checked at recovery lines 220–236. SSO decryption separation remains held. | PARTIAL |
| A4: Import Helpdesk and IT Ops with exact atomic scopes | Owner-selected recover scope exists and is independent of people permissions. Full source-estate rights import and remaining atomic permissions were explicitly excluded from this rider. | UNPROVED; no completion claimed |
| A5: UI, CLI and API allowed actions and policy, settings, billing, values and owner-only denials | Scoped recovery browser journey, CLI and REST success at recovery lines 381–455, settings and policy denials at 261–283, CLI no-file and unchanged-role checks at 388–411. The existing billing request is unavailable; that refusal is not a live billing workflow result. Wider administration remains unproved. | MET for selected recovery verbs; whole sentence PARTIAL |
| A6: Export source and destination rights matrices, refusing unresolved semantics | Source-rights work under LKY-041, LKY-042, LKY-043 and LKY-071 is not supplied by recovery scopes. No live source rights or cutover is inferred. | UNPROVED |
| LKY-009 rider: Member-enrolled named non-owner recovery with independent exact member and key-domain scope | Frozen rider rubric below and actual browser, CLI and signed REST journeys. | Locally MET for the selected connected single-custodian path |
| LKY-009 family separation and MFA boundary | Recovery journey refuses family access while company custody is enrolled; existing emergency and kit journeys pass separately. Independent family-root cross-client proof, separate human MFA reset and full root rotation remain outside this result. | Bounded refusal MET; remaining duties PARTIAL |
| LKY-014 inherited audit duties | Existing Audit HTTP journey executes secret-free current audit commitments and owner refusal. Recovery wire and stored custody inspections pass. No external SIEM delivery, anchoring or complete recovery pre-admission audit coverage is inferred. | PARTIAL, unchanged |
| LKY-069 inherited reconciliation and custodian duty | Existing manual offboarding and company custody HTTP journeys execute the current reconciliation and missing-custody refusals. Directory parity, all native paths and complete planned offboarding remain unchanged obligations. | PARTIAL, unchanged |
| LKY-051 separate two-person recovery duty | This continuation changes neither quorum cryptography nor eligibility. Incompatible policies refuse at recovery lines 318–354 and changed descriptors at 252–258. No live quorum or independent cryptographic assessment is claimed. | Separation MET; quorum completion not claimed |

## Frozen rubric for this rider

These rows are the selected rider and its stated proof obligations, not new
acceptance text. Each MET below means local public-door execution; exact-SHA
Verify remains a separate gate.

| Row | Outcome | Named proof with source lines | Local result |
| --- | --- | --- | --- |
| R1 | Only an owner grants recover permission to explicit named non-owner custodians and company members, current generation and existing company-account domain; no wildcard | scopedRecoveryJourney, recovery lines 195–217; Scoped recovery HTTP journey, runtime lines 229–244 | MET |
| R2 | Fresh explicit member consent pins the exact custodian and encrypts custody on the client | scopedRecoveryJourney, recovery lines 212–238; scopedRecoveryBrowserJourney, browser lines 37–55, exact consent reset before downloads | MET |
| R3 | Enrollment and current grant both required at enrollment, start, review, approval, status and finish | scopedRecoveryJourney, recovery lines 284–377, exercises refusedStages and incompatiblePolicy through public service requests | MET |
| R4 | Narrowed, revoked, deactivated, changed member, key or generation refuses pending and subsequent use | scopedRecoveryJourney, recovery lines 285–377; browser lines 93–117, active case refused after owner revocation with generation unchanged | MET |
| R5 | Changed custodian requires fresh enrollment; old or foreign custodian cannot approve | scopedRecoveryJourney, recovery lines 378–428, fresh CLI member enrollment and distinct pinned replacement | MET |
| R6 | Unknown and incompatible policy refuses without downgrade, including missing policy binding or modified signed purpose | scopedRecoveryJourney, recovery lines 318–354; existing named-owner and self-recovery journeys still pass | MET |
| R7 | Recovery alone grants no everyday read, attachment, history or export right, settings, policy, people delegation or owner promotion | scopedRecoveryJourney, recovery lines 261–283 and 388–411. CLI output files remain absent; roles, settings and grants remain unchanged. No billing execution claim from unavailable door. | MET for shipped doors |
| R8 | Browser, shipped CLI and signed REST recover intended real encrypted company content | scopedRecoveryBrowserJourney, browser lines 69–92; scopedRecoveryJourney, recovery lines 412–455, checks note values, attachment bytes and fresh profile | MET |
| R9 | Stale, foreign, expired, tampered and replayed operations refuse, concurrent finish has only one winner | scopedRecoveryJourney, recovery lines 220–258, 369–377, 419–455; one fresh device and one generation increment after concurrent finish | MET |
| R10 | Actual Base archive import carries no live recover scopes, enrollment or cases | recoveryArchiveErasureJourney, recovery lines 146–190; exerciseRecordsRestore in `tests/latchkey-restore.mjs`; actual runtime Base export and import | MET |
| R11 | Member, custodian or grantor erasure removes dependent scopes, wraps and cases, and replay cannot revive authority | recoveryArchiveErasureJourney, recovery lines 161–187; runSubjectErasureJourneys in `tests/latchkey-subject-erasure.mjs`, lines 58–98; runtime later-journal replay fence | MET |
| R12 | Client-held keys, secret-free server storage, wire and audit | scopedRecoveryJourney, recovery lines 456–457; browser request inspections at lines 29–30, 89 and 118; runtime complete storage and wire inspection | MET |
| R13 | Modified credential account, tenant or generation refuses before any case or notice, with a usable browser correction path | scopedRecoveryJourney, recovery lines 244–250; browser lines 58–69. Original emitted Worker failed this new case-count assertion. | MET |
| R14 | Registered browser journey and responsive proof | `tests/browser/vault.mjs`, lines 19 and 25 invoke scopedRecoveryBrowserJourney; the journey asserts behaviour at 1440 and captures screens at 1440 and 390. Scoped configuration stays under Settings, scoped text is 14px and controls are labeled. Reveal tooltip is exercised by keyboard. | MET locally |

## DONE-RIDERS and pre-ready self-check

| Rider | Result on candidate | Reason and evidence |
| --- | --- | --- |
| 1 | PARTIAL for whole clause | Selected recovery rubric locally passes, but full native, SSO, source import and broader role outcomes are not proved. No DONE claim. |
| 2 | PASS for selected rider | Real company note and attachment data is recovered; unsafe requests are executed and checked for no custody, case, output-file, authority or generation change. |
| 3 | PENDING | Browser and recovery journeys are registered in existing push Verify shards. Candidate run state is recorded below; no older run is substituted. |
| 4 | PASS locally | Browser and runtime run on the final SHA. Recovery test, service and client bytes are identical to the passed safety-save tree; the diff from a74f2a5 contains only browser test, message and lock changes. |
| 5 | PASS by unchanged scope | No new inheritance is claimed; existing clause references and obligations remain intact. |
| 6 | PASS mechanically | Generator write and check pass. Generated views are restored from main and excluded from commits; Status cells and counts are unchanged. |
| 7 | PASS | No acceptance edit, identifier rewrite or requirement removal. |
| 8 | PASS for selected rider | CLI and signed HTTP execute non-owner success and all available forbidden operations with no authority change. Wider permissions remain unproved. |
| 9 | PASS boundary honesty | No native, real provider, MFA bypass, live quorum, source cutover, recall or cryptographic certification is inferred. |
| 10 | PASS | No new policy default is adopted. Uses the live 27 October LKY-009 and LKY-032 rider and current conservative company-account boundary. |
| 11 | PENDING, lander-owned | Product remains branch-only. Main equality, COMPLETE full-history publication scan and exact-main Run site are not established in cloud. |

Pre-ready checks: (1) selected outcomes have public-door sanity assertions; whole
clause and exact-SHA CI completion are not claimed. (2) No existing assertion was
removed, narrowed, skipped or moved behind a new condition; registration counts
are unchanged. (3) Revocation, erasure and replay paths execute and refuse unsafe
use. (4) Changed screen's message is plain text within the existing Settings
panel; screenshots at both widths show usable labeled controls, 14px scoped text
and full fieldset borders; the existing reveal icon tooltip is asserted by
keyboard. (5) Source lock and generator checks pass. The Mac owns publication
scanning and post-landing site verification. No new email-shaped fixture string
was introduced. Existing synthetic fixtures remain unchanged.

## Local checks, probes and limits

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock, then check exit=0; views=node scripts/contract-docs.mjs write LKY-032, then check LKY-032 exit=0; ledger=none exit=0 (no migration edited by this continuation; no separate ledger command is documented in AGENTS.md; the inherited additive 0049 migration is applied in setup and every emitted-Worker fixture).

PROBE LKY-032 owner scope: signed and REST grant with named current company member -> independent accounts.recover scope; non-owner, wildcard, wrong domain and generation refused.
PROBE LKY-032 member enrollment: current member with exact scope and pinned custodian -> encrypted enrollment; wrong member and pin refused.
PROBE LKY-032 identity binding: modified account, tenant and generation in credential -> recovery_context_changed; case count and notices unchanged.
PROBE LKY-032 custody: browser, CLI and REST case with distinct human approval -> intended encrypted company note and attachment recovered through new profile.
PROBE LKY-032 live authority: narrow, revoke, deactivate or change generation while pending -> enrollment, start, review, approval, status and finish refuse; no recovery generation changes.
PROBE LKY-032 ordinary authority: recovery-only CLI read, history, attachment and export -> refused, private output absent; delegation and owner promotion -> refused, rights and roles unchanged.
PROBE LKY-032 replay: captured signed enrollment and altered custodian -> replay or signature refusal; foreign origin and expired timestamp refuse; duplicate finish has one winner only.
PROBE LKY-032 restore and erasure: real Base import -> zero executable recovery rows; member, custodian and grantor erasure -> dependent custody removed; captured and later-journal replay remains fenced.
PROBE LKY-032 incompatible policies: unknown policy, removed binding and altered signed purpose -> refused without conversion to legacy recovery; no live two-person result claimed.

See CHECKS.json and MECHANICAL.json for actual commands, exits and output hashes;
selected complete non-secret logs and the 14 browser captures accompany them.
One attempted ad hoc imported test harness stalled and was stopped by its own
recorded PIDs. The supported complete recovery script then reproduced the
regression and passed after the repair. No workflow failure was repaired in
this continuation; no VERIFY_REPRODUCED claim is needed.

Baseline Verify 42306622374 completed successfully on the starting SHA
beac74566518d15852d7bd5c569b9d5fe2ddc6c1. This is context only, not candidate
proof. Candidate CI and push custody are recorded in CI.json and PUSH.txt.
No PR is required because Verify runs on branch pushes. No default branch was
pushed or fast-forwarded.

Publication scan result: commit=4e58b63a8513e5588f49b2851fd0913e7bcf03e7;
complete=NOT RUN IN CLOUD; historyScanned=NOT ESTABLISHED; findings=NOT REPORTED.
The guarded Mac lander must scan the exact candidate and require COMPLETE with
zero findings before landing. Run site is also a lander receipt, not reported
green by this builder.

## Remaining work and plan return

GAP LKY-032: Native and all named SSO provider proof remain held; source-rights migration, complete atomic administration and reporting scopes, hardware and separate MFA qualification, full account-root rotation and the remaining whole-clause authority matrix remain unproved. LKY-051 quorum work and independent-family-root obligations remain separate. No whole-clause DONE or count change is claimed.

Plan row LKY-032: selected connected scoped single-custodian rider and its public
web, CLI and signed REST proof completed locally; add the credential identity
pre-write refusal proof. Keep the row PARTIAL and all held families and
source-rights prerequisites. No new clause was started, no global plan was rebuilt
and no lane file was read or written in cloud. Product readiness is independent
of report publication; the packet contains no active recovery profiles, sessions,
private keys, environment dump or provider material.

Candidate Verify: run 42310166458, event push, head 4e58b63a8513e5588f49b2851fd0913e7bcf03e7, status in_progress, conclusion not yet available at the single discovery call. It has not been polled again. No dispatch or rerun was used. Product push succeeded on its first attempt; no transport rejection or blocker occurred.
