import { access, need, ownedVault } from '../reviews/common.mjs';

// Only actions whose object is the vault itself or a durable vault-scoped
// review/share/link are eligible. Account login, recovery and device events
// cannot be attributed to one company vault and are deliberately excluded.
const eventSources = [
 ['vault', ['vault_created', 'vault_shared', 'vault_rotated', 'archive_vault_activated', 'trash_policy_confirmed']],
 ['review', ['review_scheduled', 'review_started', 'review_reconciled', 'review_decided', 'review_removal_effective', 'review_closed']],
 ['share', ['internal_share_created', 'internal_share_approved', 'internal_share_revoked']],
 ['link', ['external_link_created', 'external_link_revoked']],
];
const eventAllowlist = eventSources.flatMap(([, actions]) => actions);
// All values here are source constants, never request-derived SQL.
const allowedEventsSql = eventSources.flatMap(([source, actions]) =>
 actions.map(action => `('${source}','${action}')`)).join(',');

/**
 * Candidate metadata for a separately previewed and signed company export.
 * One SELECT obtains counts and events from the same database read snapshot;
 * its scope CTE rechecks current ownership, identity, read authority and the
 * caller's authenticated fence. No product state is changed.
 *
 * Direct membership: current recipient rows with an active same-tenant account
 * and at least one supported right. Enrollment: that subset with at least one
 * unrevoked device at the account's current generation. EXISTS avoids counting
 * multiple devices as multiple members. Neither metric measures usage or MFA.
 *
 * Event joins use the action-specific object's current vault relation, never
 * actor membership, item IDs, or a tenant-wide audit scan presented as vault
 * activity. Erasure/deletion can remove these relations, so retained event
 * counts are not a complete historical ledger or a tamper-evidence claim.
 *
 * Actual MFA evidence still needs a current authoritative enforcement policy
 * and factor/authentication source, with tenant/subject scope, timestamps and
 * revocation/freshness semantics. Device enrollment and OPAQUE authentication
 * supply none of that; adding those sources is separate product work.
 */
export async function companyPosture(ctx, vault) {
 const owned = await ownedVault(ctx, vault);
 need(owned.kind === 'company', 'company_vault_required', 403);
 need(typeof ctx.fence === 'string' && ctx.fence.length > 0 && Array.isArray(ctx.fenceArgs), 'evidence_authority_required', 403);
 need(Number.isSafeInteger(ctx.now) && ctx.now > 0, 'invalid_evidence_timestamp');
 const row = await access(ctx).first(`
  WITH scope AS (
   SELECT v.id, v.tenant FROM lky_vaults v
   JOIN lky_accounts a ON a.id=v.owner AND a.tenant=v.tenant
   JOIN oa_operators o ON o.id=a.operator_id AND o.status='active'
   JOIN lky_recipients r ON r.vault_id=v.id AND r.account_id=a.id
   WHERE v.id=? AND v.tenant=? AND v.owner=? AND v.kind='company'
    AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read')
    AND ${ctx.fence}
  ), direct_members AS (
   SELECT a.id, a.generation, r.rights,
    EXISTS(SELECT 1 FROM lky_devices d WHERE d.account_id=a.id
     AND d.generation=a.generation AND d.revoked_at IS NULL) AS enrolled
   FROM scope v JOIN lky_recipients r ON r.vault_id=v.id
   JOIN lky_accounts a ON a.id=r.account_id AND a.tenant=v.tenant
   JOIN oa_operators o ON o.id=a.operator_id AND o.status='active'
   WHERE EXISTS(SELECT 1 FROM json_each(r.rights)
    WHERE value IN ('read','create','edit','export','share','rotate','delete','restore'))
  ), allowed_events(source, action) AS (VALUES ${allowedEventsSql}),
  scoped_events AS (
   SELECT e.action, e.created_at FROM lky_events e
   JOIN allowed_events allowed ON allowed.action=e.action CROSS JOIN scope v
   WHERE e.created_at<=? AND (
    (allowed.source='vault' AND e.object_id=v.id)
    OR (allowed.source='review' AND EXISTS(SELECT 1 FROM lky_reviews c
     WHERE c.id=e.object_id AND c.vault_id=v.id AND c.tenant=v.tenant))
    OR (allowed.source='share' AND EXISTS(SELECT 1 FROM lky_shares s
     WHERE s.id=e.object_id AND s.vault_id=v.id AND s.tenant=v.tenant))
    OR (allowed.source='link' AND EXISTS(SELECT 1 FROM lky_links l
     WHERE l.id=e.object_id AND l.vault_id=v.id AND l.tenant=v.tenant))
   )
  ), event_counts AS (
   SELECT action, COUNT(*) AS count, MIN(created_at) AS first_at,
    MAX(created_at) AS last_at FROM scoped_events GROUP BY action
  )
  SELECT
   (SELECT COUNT(*) FROM direct_members) AS authorized_members,
   (SELECT COUNT(*) FROM direct_members WHERE enrolled=1) AS enrolled_members,
   (SELECT COUNT(*) FROM direct_members m WHERE EXISTS(
    SELECT 1 FROM json_each(m.rights) WHERE value IN ('share','rotate'))) AS privileged_members,
   (SELECT json_group_array(json_object('action',action,'count',count,
    'firstOccurredAt',first_at,'lastOccurredAt',last_at))
    FROM (SELECT * FROM event_counts ORDER BY action)) AS events
  FROM scope
 `, owned.id, ctx.tenant, ctx.actor, ...ctx.fenceArgs, ctx.now);
 need(row, 'company_evidence_scope_unavailable', 403);

 return {
  schema: 'latchkey/company-posture/v1',
  sourceTimestamp: ctx.now,
  timestampUnit: 'unix-milliseconds',
  scope: { kind: 'company', vaultCount: 1 },
  posture: {
   observedAt: ctx.now,
   authorizedActiveDirectMembers: row.authorized_members,
   directMembersWithShareOrRotateRights: row.privileged_members,
   measurementBasis: 'Current direct recipient rows with supported rights, same-tenant registered accounts and active operator identities; share-or-rotate counts rights, not administrator roles.',
  },
  adoption: {
   observedAt: ctx.now,
   metric: 'currently-authorized-active-direct-vault-members-with-current-device-enrollment',
   enrolledMembers: row.enrolled_members,
   authorizedActiveDirectMembers: row.authorized_members,
   eligibleMembers: null,
   nonAdoptedMembers: null,
   dailyActiveMembers: null,
   measurementBasis: 'Enrolled members have at least one unrevoked device at their account current generation. Counts represent enrollment and assigned authority, not actual use. No vault-specific eligible workforce denominator is recorded.',
  },
  mfa: {
   observedAt: ctx.now,
   status: 'unknown-not-implemented',
   enforcement: null,
   enrolledMembers: null,
   enforcedMembers: null,
   sourceTimestamp: null,
   measurementBasis: 'The current product has no MFA enforcement or factor measurement source. Cryptographic device enrollment and password authentication do not establish MFA enrollment, enforcement or use.',
  },
  securityEvents: {
   observedAt: ctx.now,
   throughTimestamp: ctx.now,
   sinceTimestamp: null,
   allowlist: [...eventAllowlist],
   events: JSON.parse(row.events),
   measurementBasis: 'Counts and first/last timestamps of retained allowlisted lky_events through the source timestamp, scoped by the event action and current company-vault, review, internal-share or external-link relation. No usage, account or device events are included.',
  },
  limitations: [
   'This is a current metadata snapshot of one company vault, with no personal-vault or tenant-wide activity.',
   'Direct membership counts exclude internal item-share recipients, external-link recipients, machines and delegated credentials; they are not a complete access inventory.',
   'Membership and device rows have no source modification timestamps; observedAt records snapshot collection, not the last change to each source.',
   'Retained security events can omit erased events and events whose vault relation no longer exists. They are not a complete or tamper-evident audit ledger.',
   'No activity rate, MFA coverage, certification or compliance conclusion can be inferred from these counts.',
  ],
 };
}
