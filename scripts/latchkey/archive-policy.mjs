// Edition-owned Records policy. Ciphertext and historical definitions survive;
// live device, exchange and runtime authority does not travel to a restore.
export default {
 product: 'runeditrun/foundation',
 includeTables: ['oa_operators', 'oa_bootstrap', 'oa_external_identities', 'oa_invitation_cancellations', 'oa_auth_settings', 'oa_auth_audit', 'oa_domain_rules', 'oa_logout_events', 'oc_owner_claims', 'oc_idp_grants'],
 excludeTables: ['lky_recovery_custody','lky_recovery_cases','lky_emergency_access','lky_company_custody','lky_custody_reviews','lky_export_policies','lky_people_offboarding','lky_people_exposures','lky_admin_permissions','lky_people_batches','lky_audit_chain','lky_audit_details','lky_checkouts','lky_msp_nonces','lky_msp_previews','lky_automation_guard','lky_mcp_credentials','lky_runtime_grants','lky_runtime_scopes','lky_runtime_dependencies','lky_runtime_guard','lky_lifecycle_guard','lky_vault_capabilities','lky_review_guard', 'lky_review_reminders','lky_subject_guard', 'lky_erasure_guard', 'oa_tokens', 'lky_restore_preparations', 'lky_restore_guard', 'lky_link_challenges', 'rer_dependency_keys', 'rer_dependency_pending', 'rer_dependency_codes', 'lky_devices', 'lky_grants', 'lky_exchanges', 'lky_nonces', 'lky_limits', 'lky_registrations', 'lky_password_changes', 'lky_enrollments', 'lky_machines'],
 requiredConfiguration: ['LATCHKEY_ERASURE_SECRET', 'OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 importSafety: { lky_health_suppressions:{active:[0]}, lky_rule_reviews:{phase:['inactive']}, lky_rules:{active:[0]}, lky_rule_obligations:{phase:['inactive']}, lky_msp_captures:{active:[0]}, lky_msp_delegations:{revoked_at:[0]}, lky_evidence_sources:{active:[0]}, lky_webhook_subscriptions:{active:[0],secret:['']}, lky_lifecycle:{retention_active:[0]},lky_bulk_operations:{active:[0]}, lky_evidence_destinations: {active:[0],credential:[null],credential_version:[0]}, lky_alias_domains:{active:[0]}, lky_alias_mailboxes:{active:[0]}, lky_aliases:{state:['inactive'],delivery:['unconfirmed']}, lky_reviews: {phase:['inactive'],package:[null]}, lky_recipients: { rights: ['[]'] }, lky_shares: { revoked_at: [0], approved_at: [null] }, lky_links: { revoked_at: [0] }, lky_sharing_policy: { external_enabled: [0] } },
 importRow(table, row) {
  if(table==='lky_health_suppressions')return{...row,active:0};
  if(table==='lky_rule_reviews')return{...row,phase:'inactive'};
  if(table==='lky_rules')return{...row,active:0};
  if(table==='lky_rule_obligations')return{...row,phase:'inactive'};
  if(table==='lky_msp_captures')return{...row,active:0};
  if(table==='lky_msp_delegations')return{...row,revoked_at:row.revoked_at??0};
  if(table==='lky_evidence_sources')return{...row,active:0};
  if(table==='lky_webhook_subscriptions')return{...row,active:0,secret:''};
  if(table==='lky_lifecycle')return{...row,retention_active:0};
  if(table==='lky_bulk_operations')return{...row,active:0};
  if (table === 'lky_evidence_destinations') return {...row,active:0,credential:null,credential_version:0};
  if (table === 'lky_alias_domains' || table === 'lky_alias_mailboxes') return {...row,active:0};
  if (table === 'lky_aliases') return {...row,state:'inactive',intent:null,next_mailbox:null,delivery:'unconfirmed',failure:'restored_unverified'};
  if (table === 'lky_reviews') return {...row,phase:'inactive',package:null};
  if (table === 'lky_recipients') return { ...row, rights: '[]' };
  if (table === 'lky_shares') return { ...row, revoked_at: row.revoked_at ?? 0, approved_at: null };
  if (table === 'lky_links') return { ...row, revoked_at: row.revoked_at ?? 0 };
  if (table === 'lky_sharing_policy') return { ...row, external_enabled: 0 };
  return row;
 },
};
