// Edition-owned Records policy. Ciphertext and historical definitions survive;
// live device, exchange and runtime authority does not travel to a restore.
export default {
 product: 'runeditrun/foundation',
 includeTables: ['oa_operators', 'oa_bootstrap', 'oa_external_identities', 'oa_invitation_cancellations', 'oa_tokens', 'oa_auth_settings', 'oa_auth_audit', 'oa_domain_rules', 'oa_logout_events', 'oc_owner_claims', 'oc_idp_grants'],
 excludeTables: ['rer_dependency_keys', 'rer_dependency_pending', 'rer_dependency_codes', 'lky_devices', 'lky_grants', 'lky_exchanges', 'lky_nonces', 'lky_limits', 'lky_registrations', 'lky_password_changes', 'lky_enrollments', 'lky_machines'],
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 importSafety: { lky_recipients: { rights: ['[]'] } },
 importRow(table, row) { return table === 'lky_recipients' ? { ...row, rights: '[]' } : row; },
};
