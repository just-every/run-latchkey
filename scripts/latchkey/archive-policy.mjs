// Edition-owned Records policy. Ciphertext and historical definitions survive;
// live device, exchange and runtime authority does not travel to a restore.
export default {
 product: 'runeditrun/foundation',
 includeTables: ['oa_operators', 'oa_bootstrap', 'oa_external_identities', 'oa_invitation_cancellations', 'oa_auth_settings', 'oa_auth_audit', 'oa_domain_rules', 'oa_logout_events', 'oc_owner_claims', 'oc_idp_grants'],
 excludeTables: ['lky_review_guard', 'lky_review_reminders','lky_subject_guard', 'lky_erasure_guard', 'oa_tokens', 'lky_restore_preparations', 'lky_restore_guard', 'lky_link_challenges', 'rer_dependency_keys', 'rer_dependency_pending', 'rer_dependency_codes', 'lky_devices', 'lky_grants', 'lky_exchanges', 'lky_nonces', 'lky_limits', 'lky_registrations', 'lky_password_changes', 'lky_enrollments', 'lky_machines'],
 requiredConfiguration: ['LATCHKEY_ERASURE_SECRET', 'OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 importSafety: { lky_evidence_destinations: {active:[0]}, lky_reviews: {phase:['inactive']}, lky_recipients: { rights: ['[]'] }, lky_shares: { revoked_at: [0], approved_at: [null] }, lky_links: { revoked_at: [0] }, lky_sharing_policy: { external_enabled: [0] } },
 importRow(table, row) {
  if (table === 'lky_evidence_destinations') return {...row,active:0};
  if (table === 'lky_reviews') return {...row,phase:'inactive',package:null};
  if (table === 'lky_recipients') return { ...row, rights: '[]' };
  if (table === 'lky_shares') return { ...row, revoked_at: row.revoked_at ?? 0, approved_at: null };
  if (table === 'lky_links') return { ...row, revoked_at: row.revoked_at ?? 0 };
  if (table === 'lky_sharing_policy') return { ...row, external_enabled: 0 };
  return row;
 },
};
