# Implementation claims

Generated from CONTRACT.md. Acceptance requirements, exact assertions and remaining gaps are in that source. The status below does not claim completion for partial or missing clauses.

| Clause | Title | Kind | Status | Evidence paths | Scope |
| --- | --- | --- | --- | --- | --- |
| LKY-031 | Owner-run installation through Base | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-032 | Sign-in and server-side authority | target | partial | [tests/runtime.mjs](../tests/runtime.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-033 | Whole-product encrypted archive and inactive restore | target | partial | [tests/latchkey-records.test.mjs](../tests/latchkey-records.test.mjs); [tests/latchkey-local-records.test.mjs](../tests/latchkey-local-records.test.mjs); [tests/runtime.mjs](../tests/runtime.mjs); [tests/latchkey-restore.mjs](../tests/latchkey-restore.mjs); [tests/latchkey-erasure.mjs](../tests/latchkey-erasure.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-034 | Erasure with anonymized audit and replay fencing | target | partial | [tests/latchkey-erasure.mjs](../tests/latchkey-erasure.mjs); [tests/latchkey-subject-erasure.mjs](../tests/latchkey-subject-erasure.mjs); [tests/browser/vault.mjs](../tests/browser/vault.mjs); [tests/browser/reviews.mjs](../tests/browser/reviews.mjs); [tests/browser/automation.mjs](../tests/browser/automation.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-035 | Agents are scoped credentials with human approval | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-036 | US-first operation and explicit regional controls | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-056 | Recover the vault service without losing the keys | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-074 | Defined managed edition and published USD buying terms | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-075 | Agent fleet control, budgets and global pause | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-001 | Zero-knowledge vault and published security design | published | done | [tests/runtime.mjs](../tests/runtime.mjs); [tests/browser/organization.mjs](../tests/browser/organization.mjs); [docs/security/protocol.md](../docs/security/protocol.md); [docs/security/threat-model.md](../docs/security/threat-model.md) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-076 | Independent cryptographic review of the vault design | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-077 | Retention schedule and delivery of audit records to external recipients | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-078 | Reviewed fresh-authority hand-back and reactivation | target | partial | [tests/latchkey-custody.mjs](../tests/latchkey-custody.mjs); [tests/runtime.mjs](../tests/runtime.mjs); [tests/browser/company-custody.mjs](../tests/browser/company-custody.mjs); [tests/browser/vault.mjs](../tests/browser/vault.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-002 | Complete item types, generator and history | target | partial | [tests/latchkey-items.mjs](../tests/latchkey-items.mjs); [tests/latchkey-generator-policy.mjs](../tests/latchkey-generator-policy.mjs); [tests/runtime.mjs](../tests/runtime.mjs); [tests/browser/vault.mjs](../tests/browser/vault.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-003 | Everyday apps, autofill and passkeys | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-004 | Unlock and device security | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-017 | Open export and self-hosting parity | target | partial | [tests/latchkey-exit.mjs](../tests/latchkey-exit.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-027 | Personal and family accounts remain separate | target | partial | [tests/browser/organization.mjs](../tests/browser/organization.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-037 | Find, organize, archive and restore work | target | done | [tests/browser/organization.mjs](../tests/browser/organization.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-038 | Offline continuity, conflicts and revocation policy | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-039 | Rollout, accessibility and support without disclosure | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-050 | Hide-my-email aliases with a real forwarding provider | target | done | [tests/browser/aliases.mjs](../tests/browser/aliases.mjs); [tests/fixtures/signup-site.mjs](../tests/fixtures/signup-site.mjs); [tests/fixtures/cloudflare-routing.mjs](../tests/fixtures/cloudflare-routing.mjs); [tests/latchkey-aliases.mjs](../tests/latchkey-aliases.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-073 | Desktop quick access, native app fill and wearable codes | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-005 | Private vaults, groups and effective permissions | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-079 | Local deterrent and broker-protected fill modes | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-080 | Atomic permission migration report | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-006 | Internal, guest and one-time sharing | target | done | [tests/latchkey-sharing.mjs](../tests/latchkey-sharing.mjs); [tests/runtime.mjs](../tests/runtime.mjs); [tests/browser/sharing.mjs](../tests/browser/sharing.mjs); [tests/browser/vault.mjs](../tests/browser/vault.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-007 | Admin console, policies and travel mode | target | partial | [tests/latchkey-generator-policy.mjs](../tests/latchkey-generator-policy.mjs); [tests/browser/vault.mjs](../tests/browser/vault.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-008 | Directory, SSO unlock and provisioning | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-009 | Recover accounts without vendor access | target | partial | [tests/latchkey-recovery.mjs](../tests/latchkey-recovery.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-010 | Offboarding and credential hand-back | target | partial | [tests/runtime.mjs](../tests/runtime.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-025 | Consent-based unmanaged credential discovery | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-026 | Device posture before vault unlock | target | partial | [tests/latchkey-records.test.mjs](../tests/latchkey-records.test.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-028 | MSP and multi-company operations | target | partial | [tests/browser/msp.mjs](../tests/browser/msp.mjs); [tests/browser/msp-lifecycle.mjs](../tests/browser/msp-lifecycle.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-051 | Recovery governance and hardware authenticators | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-055 | Transparent MSP and company commercial records | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-058 | People signals and IT ticket fulfillment | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-069 | Manual people management and planned offboarding | target | partial | [tests/runtime.mjs](../tests/runtime.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-011 | Password health with private comparisons | target | partial | [tests/browser/security.mjs](../tests/browser/security.mjs); [tests/latchkey-restore.mjs](../tests/latchkey-restore.mjs); [tests/runtime.mjs](../tests/runtime.mjs); [tests/latchkey-subject-erasure.mjs](../tests/latchkey-subject-erasure.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-012 | Breach and dark-web monitoring | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-013 | Security insights and adoption reporting | target | partial | [tests/browser/reports.mjs](../tests/browser/reports.mjs); [tests/browser/security.mjs](../tests/browser/security.mjs); [tests/latchkey-restore.mjs](../tests/latchkey-restore.mjs); [tests/latchkey-erasure.mjs](../tests/latchkey-erasure.mjs); [tests/latchkey-subject-erasure.mjs](../tests/latchkey-subject-erasure.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-014 | Tamper-evident activity and SIEM delivery | target | partial | [tests/runtime.mjs](../tests/runtime.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-015 | Access reviews and compliance reports | target | done | [tests/browser/reviews.mjs](../tests/browser/reviews.mjs); [tests/latchkey-evidence.mjs](../tests/latchkey-evidence.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-030 | Security assurance and verifiable builds | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-040 | Reminders, escalation and accountable follow-up | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-054 | Reusable security rules and evidence-grounded actions | target | partial | [tests/browser/rules.mjs](../tests/browser/rules.mjs); [tests/latchkey-rules.mjs](../tests/latchkey-rules.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-059 | Evidence connectors with no vault contents | target | done | [tests/latchkey-evidence.mjs](../tests/latchkey-evidence.mjs); [tests/browser/reviews.mjs](../tests/browser/reviews.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-062 | Federal and validated-cryptography extension | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-016 | Import and switching with exact reconciliation | target | partial | [tests/latchkey-records.test.mjs](../tests/latchkey-records.test.mjs); [tests/browser/passbolt.mjs](../tests/browser/passbolt.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-041 | 1Password Business migration | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-042 | Bitwarden and machine-secret migration | target | partial | [tests/latchkey-records.test.mjs](../tests/latchkey-records.test.mjs); [tests/browser/passbolt.mjs](../tests/browser/passbolt.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-043 | Keeper Business and MSP migration | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-044 | LastPass Business migration without silent folder loss | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-045 | Passbolt migration and cryptographic handover | target | partial | [tests/latchkey-records.test.mjs](../tests/latchkey-records.test.mjs); [tests/browser/passbolt.mjs](../tests/browser/passbolt.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-046 | Proton Pass for Business migration | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-047 | Infisical secrets migration in mid-deployment | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-048 | Dashlane, KeePass, NordPass, Psono and browser migration | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-049 | Pilot, delta cutover and rollback without double authority | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-071 | Employee private-vault migration and cutover roster | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-018 | Secrets manager for machines and applications | target | done | [tests/browser/projects.mjs](../tests/browser/projects.mjs); [tests/browser/runtime-consumers.mjs](../tests/browser/runtime-consumers.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-019 | CI, infrastructure and cloud-secret integrations | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-020 | Verified rotation and short-lived credentials | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-021 | SSH keys and verified Git signing | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-022 | Leak scanning and source-owned remediation | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-023 | Privileged shared-account checkout and break-glass | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-024 | Credentials for AI agents without disclosure | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-029 | Documented API, CLI, webhooks and MCP | target | done | [tests/browser/automation.mjs](../tests/browser/automation.mjs); [tests/runtime.mjs](../tests/runtime.mjs); [tests/latchkey-restore.mjs](../tests/latchkey-restore.mjs); [src/latchkey/api/README.md](../src/latchkey/api/README.md); [src/latchkey/api/openapi.json](../src/latchkey/api/openapi.json) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-052 | Connector reliability and least-privilege credentials | target | partial | [tests/latchkey-evidence.mjs](../tests/latchkey-evidence.mjs); [tests/browser/reviews.mjs](../tests/browser/reviews.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-053 | Provider-supported key management and consumer graph | target | partial | [tests/browser/security.mjs](../tests/browser/security.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-057 | Trusted fill-broker and runtime boundaries | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-070 | Ordinary-vault secret references and 1Password rewrite | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-072 | Biometric shell authentication and editor secret replacement | target | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-060 | Separate siblings with accountable handoffs | target | partial | [tests/browser/projects.mjs](../tests/browser/projects.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-061 | Specialist boundaries without shrinking the credential job | target | partial | [tests/browser/projects.mjs](../tests/browser/projects.mjs) | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-063 | Rotation agent changes and verifies the locks | push-further | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-064 | Offboarding agent closes the entire exposure set | push-further | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-065 | Hygiene agent improves the actual vault state | push-further | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-066 | Secrets agent removes exposure from working systems | push-further | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-067 | Agent-access broker enforces the sponsoring person | push-further | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
| LKY-068 | Remediation coordinator follows proof and human decisions | push-further | missing |  | [Exact assertions and remaining scope](../CONTRACT.md#status) |
