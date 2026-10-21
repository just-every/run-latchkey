# Threat model and review status

This is an implemented client-cryptography foundation, not independent security assurance. LKY-001 remains partial. No certification, penetration-test pass or independent Latchkey cryptographic review is claimed.

| Boundary or attacker | Current protection | Limit or remaining evidence |
| --- | --- | --- |
| Database, server backup or log reader | Values/metadata and client private material are AES-GCM ciphertext; PAKE export key plus independent local factor is absent | Identity, opaque membership/IDs, sizes, versions and event timing remain visible |
| Active storage/service operator | Context authentication, owner-signed key wraps, locally pinned account authorities and observed history checkpoints | Can deny, omit or equivocate; fresh clients have no external history witness |
| Valid password or SSO session on an untrusted device | PAKE does not supply the separate device/kit factor; enrollment requires a pinned, signed trusted-device transfer | Native secure-storage, complete SSO provider and MFA/recovery integration still need proof |
| Foreign member, tenant or revoked session | Live service checks, device signatures, session/account fences and object rights | Full atomic admin/group/API/CLI rights matrix belongs to LKY-032/005/029 |
| Removed vault recipient | Exact-set atomic key rotation re-encrypts retained versions and excludes its wrap | Cannot retract old plaintext, caches, earlier backups or provider sessions |
| Stolen locked profile or kit alone | No password/OPAQUE export key; encrypted private bundle | Device factor stored in a mode-0600 file, not a native hardware enclave; password plus profile compromises its authority |
| Compromised unlocked client/OS | No claim of isolation from its authorized decryptor | Root keys and plaintext can be copied; device-row revocation is insufficient; root replacement and exposure remediation remain separate work |
| Malicious client binary, dependency or update | Published pinned source and explicit trusted-client boundary | A modified client can steal the password, local factors and plaintext. Signed/reproducible release and update verification under LKY-030 are not implemented by this protocol |
| Runtime process | Explicit fingerprint and selected-item key; current rights/generation/epoch/expiry checks | Runtime is a trusted decryptor. Models must not be given the profile/runtime key/output file. This is not a model-isolation guarantee |
| Vendor support, recovery or IdP operator | No decryption factor, recovery escrow or support unwrap endpoint | No administrator-assisted recovery is implemented; no account/IdP authority is represented as a decryption key |
| Broker or scanner | No implicit vendor key holder or fallback plaintext broker route exists | Actual enrollment/isolation/revocation proof under LKY-024/057/067 remains pending. A future broker must be explicitly owner-authorized as a client, not vendor escrow |
| Restored installation/archive | Client export needs buyer key; Records removes live product authority and restores recipient rights inactive | Complete destination rewrap, approval/reactivation, erasure and whole-product reconciliation under LKY-033/034 remain unproved |

The published upstream OPAQUE library assessment is referenced in [protocol.md](protocol.md). It does not assess Latchkey's wrapper, endpoint policy, key distribution, recovery, SSO, trusted-runtime/broker boundary or client update supply chain. A reviewer must produce an actual report and dispositions for those components. Findings are not marked resolved by this document.

Open review/evidence points: independent composition review and dispositions; account-root replacement after endpoint compromise; independently witnessed anti-rollback for new devices; native custody and actual SSO/recovery/broker/client-update journeys; complete typed items/attachments and production backup/error-report surfaces. No blocked account or missing key is asserted for that review evidence.
