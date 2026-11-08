# sx-latchkey-erasure-1

Repository: just-every/run-latchkey
Product branch: cloud/sx-latchkey-erasure-1
Scope: the person-erasure D1 expression-depth defect only. No clause status, gap or evidence edits; no Base refresh, publication scan, generated contract views, or DONE claim.

## Plan

1. Read the launcher and seed instructions, contract, acceptance journeys, source provenance and existing Verify commands. Use a fresh full-history clone and the required fleet identity, commit hook and guarded product push.
2. Reproduce unfixed main with an invited member using real OPAQUE enrollment, the emitted Worker, migrated D1 and 60 ordinary public-door vault writes. Keep an actual non-secret receipt.
3. Replace per-row OR predicates in subjectPlan's redaction helper with a JSON primary-key set, supporting single and composite keys without expression-depth or bind-count growth. Preserve the existing plan snapshots, consent hash, per-row conversions and single D1 atomic batch.
4. Add one regression journey in tests/latchkey-subject-erasure.mjs and invoke it from the existing runtime journey. Default to 200 ordinary member writes. Assert preview is read-only, preview and committed counts match exactly, all selected audit facts receive authenticated anonymous dispositions, audit chain verification succeeds, other people's audit/event rows and encrypted item remain unchanged, and erased-person access is denied.
5. Run the touched runtime test using Verify's command, the typecheck, source lock regeneration/check and rer check. Refresh origin/main before candidate publication, preserving published history if any save exists. Regenerate sources.lock.json last and commit only source/test/lock changes.
6. Inspect every candidate commit identity, message and trailer, push only the named product branch through cloud-push.py, and discover/poll exact-SHA Verify through REST within the ten-call budget and five-minute cadence.
7. Publish the complete explicitly selected non-secret packet on the separate evidence ref; report terminal custody and clause status honestly. The fleet owns publication scanning and landing.

## Before

The emitted unmodified main Worker reproduces the reported failure: 60 ordinary member vault writes yield 242 identifying lky_audit_details rows and 63 legacy events. subject/erase-preview returns HTTP 400 request_refused. The same D1 primary-key selection fails with `D1_ERROR: Expression tree is too large (maximum depth 100): SQLITE_ERROR`. See before-receipt.json.

## Results

The targeted emitted-Worker probe passes with 200 ordinary member writes: 802 audit-detail rows and 203 legacy event rows are selected, preview and commit counts match, every selected detail has null facts plus an authenticated subject-erasure disposition, no selected facts remain unredacted, and the unrelated six audit-detail rows and four event rows are unchanged. The unrelated encrypted item remains readable by its owner; erased-person access is denied. The signed audit checkpoint still verifies. See after-receipt.json.

The same regression has passed inside the existing runtime command with 2,370 unrelated audit-detail rows preserved. All original runtime assertions passed, including the real backup/restore, both later-journal replay refusals, tenant isolation and the full leakage inspection. Exact-SHA Verify completed successfully.

Local build, pnpm run typecheck, rer check, rer check --profile first-party, and the edition source-lock check pass. The source lock changes only the two touched source/test hashes. The baseline is main 1ed203cff1fd807b61290d1af39c7db586600e58, and fetching origin/main found no drift. A single regression journey is added inside the existing runtime test file and command; no existing test or assertion is removed, skipped or weakened.

The standalone host probe and direct typecheck use Node 24.19.0 and pnpm 10.12.4 from the supplied cloud toolchain. The repo and Verify pin Node 22.20.0; rer handles project runtime selection for its queued commands.

Clause status changes: none. LKY-034 remains PARTIAL. External copies and other existing clause gaps remain outstanding; successful control-plane erasure is not complete erasure.

## Product custody

Commit ac210759b9aab75493aafb4c66b0416dc6440c68 was pushed successfully on the first guarded attempt to cloud/sx-latchkey-erasure-1 after an up-to-date rebase onto origin/main. All candidate authors and committers are Run Edit Run fleet <fleet@runeditrun.com>; there are no trailers. The full-history clone is clean. No PR is required by the seed instructions and none was created.

## Committed candidate scale proof

On exact candidate ac210759b9aab75493aafb4c66b0416dc6440c68, 500 ordinary public-door writes pass preview and erase with 2002 audit-detail redactions and 503 legacy event redactions. Every preview count equals the committed count, no selected detail remains unredacted, unrelated audit/event rows and another owner's item remain unchanged, erased-person access is denied and the audit checkpoint verifies. See scale-receipt.json and scale.log. This is an outside-push run on the committed candidate, independent of Verify.

## Validation inventory

The touched existing runtime command exits 0. Its new regression preserves all prior assertions and is run once through tests/runtime.mjs via runSubjectErasureJourneys. The standalone before/after/scale probes select the same exported regression and use tests/browser/fixture.mjs without launching a browser. The fixture runs the emitted Worker and real D1; only the existing SendGrid network edge is substituted. No UI was changed, so no browser screenshot proof is needed.

Before/after row counts: 60 writes -> 242 audit details and 63 events; preview fails 400 before the fix. 200 writes -> 802 audit details and 203 events; preview and commit succeed after the fix. Committed candidate: 500 writes -> 2,002 audit details and 503 events, all selected rows redacted with matching preview counts. The isolated probes preserve six unrelated detail rows and four unrelated events; the existing runtime preserves 2,370 unrelated detail rows.

Contract and clause counts are unchanged. The product commit contains three files only: the redaction selector, one regression journey in the existing test file, and the source-lock hashes. ACCEPTANCE.md, docs/CLAIMS.md and CONTRACT.md are unchanged. No provider deployment, Base refresh, publication scan or landing was performed.

## Branch CI

Verify run 42499740353 completed successfully on exact product SHA ac210759b9aab75493aafb4c66b0416dc6440c68: https://github.com/just-every/run-latchkey/actions/runs/42499740353. One watcher used REST discovery and two subsequent status reads, with each read at least five minutes apart. Three of the ten allowed GitHub calls were used. No workflow was dispatched or rerun, and no failed job logs were needed. See ci-receipt.json and github-calls.json.

## Final result

The named branch is pushed and its exact-SHA Verify is green. No blockers. No PR was required or created. No clause status changed; LKY-034 remains PARTIAL with all existing gaps. The fleet owns the independent publication scan and landing. There is no DONE claim.

Evidence will be published as a report-only tree on refs/heads/evidence/sx-latchkey-erasure-1, separately from the product branch. Only the explicitly selected regular report, receipt, probe, diff and test-output files are included. No setup logs, private configuration, credential bundle, held-out gate material or environment dump is selected.
