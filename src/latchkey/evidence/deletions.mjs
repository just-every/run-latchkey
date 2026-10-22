import { access, exact, need, text, uuid, id } from '../reviews/common.mjs';

const pending = 'pending-provider-confirmation';
const recorded = 'provider-confirmation-recorded';
const columns = 'id,delivery_id,source_id,destination,provider_reference,request_reference,state,confirmation_reference,requested_at,confirmed_at';
const output = row => ({
 id: row.id,
 delivery: row.delivery_id,
 source: row.source_id,
 destination: row.destination,
 providerReference: row.provider_reference,
 requestReference: row.request_reference,
 state: row.state,
 confirmationReference: row.confirmation_reference,
 requestedAt: row.requested_at,
 confirmedAt: row.confirmed_at,
 requestBasis: 'owner-reported-provider-interface-request',
 confirmationBasis: row.state === recorded ? 'owner-reported-provider-confirmation' : null,
});

// These routes record reports of work performed in the provider's interface.
// They perform no external request and independently verify no deletion.
// A revoked destination remains eligible for recording deletion follow-up.
export async function evidenceDeletionAuthenticated(route, input, ctx) {
 if (!['evidence/deletions', 'evidence/deletion/request', 'evidence/deletion/confirm'].includes(route)) return null;
 need(typeof ctx.fence === 'string' && ctx.fence.length > 0 && Array.isArray(ctx.fenceArgs), 'evidence_authority_required', 403);
 const { all, first, stmt } = access(ctx);
 const own = (where, ...args) => first(`SELECT ${columns} FROM lky_evidence_deletions
  WHERE ${where} AND tenant=? AND owner=? AND ${ctx.fence}`,
 ...args, ctx.tenant, ctx.actor, ...ctx.fenceArgs);
 const currentAuthority = async () => need(await first(`SELECT 1 WHERE ${ctx.fence}`, ...ctx.fenceArgs), 'authority_changed', 409);
 // The generated deletion ID marks only this invocation's insert. Confirmation
 // similarly checks the pending state inside its UPDATE. Audit is conditional
 // on the actual change, in the same fenced batch, so replays add no events.
 const audit = (action, deletion, condition, args) => stmt(`INSERT INTO lky_events
  SELECT ?,?,?,?,?,? WHERE ${ctx.fence} AND ${condition}`,
 id(), ctx.actor, ctx.device, action, deletion, ctx.now, ...ctx.fenceArgs, ...args);

 if (route === 'evidence/deletions') {
  exact(input, []);
  await currentAuthority();
  return (await all(`SELECT ${columns} FROM lky_evidence_deletions
   WHERE tenant=? AND owner=? AND ${ctx.fence} ORDER BY requested_at DESC,id`,
  ctx.tenant, ctx.actor, ...ctx.fenceArgs)).map(output);
 }

 need(Number.isSafeInteger(ctx.now) && ctx.now > 0, 'invalid_evidence_timestamp');
 if (route === 'evidence/deletion/request') {
  exact(input, ['delivery', 'requestReference', 'confirmed']);
  need(input.confirmed === true, 'evidence_deletion_confirmation_required', 403);
  const delivery = uuid(input.delivery), requestReference = text(input.requestReference, 191);
  await currentAuthority();
  const existing = await own('delivery_id=?', delivery);
  if (existing) {
   need(existing.request_reference === requestReference, 'evidence_deletion_request_conflict', 409);
   return output(existing);
  }
  const source = await first(`SELECT d.id,d.review_id,d.destination_id,d.provider_reference,d.stage,
   target.destination FROM lky_evidence_deliveries d
   JOIN lky_evidence_destinations target ON target.id=d.destination_id
    AND target.tenant=d.tenant AND target.owner=d.owner
   WHERE d.id=? AND d.tenant=? AND d.owner=? AND ${ctx.fence}`,
  delivery, ctx.tenant, ctx.actor, ...ctx.fenceArgs);
  need(source, 'evidence_delivery_not_found', 404);
  const known = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;
  const providerReference = known(source.provider_reference) ? source.provider_reference : JSON.parse(source.stage).uploadReference;
  need(known(providerReference), 'evidence_provider_reference_required', 409);
  const deletion = id();
  await ctx.db.batch([
   stmt(`INSERT INTO lky_evidence_deletions
    (id,tenant,owner,delivery_id,source_id,destination,provider_reference,request_reference,state,confirmation_reference,requested_at,confirmed_at)
    SELECT ?,d.tenant,d.owner,d.id,d.review_id,target.destination,?,?,?,NULL,?,NULL
    FROM lky_evidence_deliveries d JOIN lky_evidence_destinations target
     ON target.id=d.destination_id AND target.tenant=d.tenant AND target.owner=d.owner
    WHERE d.id=? AND d.tenant=? AND d.owner=? AND d.destination_id=?
     AND d.provider_reference IS ? AND d.stage=? AND target.destination=?
     AND NOT EXISTS(SELECT 1 FROM lky_evidence_deletions previous
      WHERE previous.delivery_id=d.id AND previous.tenant=d.tenant AND previous.owner=d.owner)
     AND ${ctx.fence}`,
   deletion, providerReference, requestReference, pending, ctx.now,
   delivery, ctx.tenant, ctx.actor, source.destination_id, source.provider_reference, source.stage, source.destination, ...ctx.fenceArgs),
   audit('evidence_deletion_request_recorded', deletion,
    'EXISTS(SELECT 1 FROM lky_evidence_deletions WHERE id=? AND tenant=? AND owner=?)',
    [deletion, ctx.tenant, ctx.actor]),
  ]);
  const saved = await own('delivery_id=?', delivery);
  need(saved, 'evidence_deletion_source_changed', 409);
  need(saved.request_reference === requestReference, 'evidence_deletion_request_conflict', 409);
  return output(saved);
 }

 exact(input, ['deletion', 'confirmationReference', 'confirmed']);
 need(input.confirmed === true, 'evidence_deletion_confirmation_required', 403);
 const deletion = uuid(input.deletion), confirmationReference = text(input.confirmationReference, 191);
 await currentAuthority();
 const existing = await own('id=?', deletion);
 need(existing, 'evidence_deletion_not_found', 404);
 if (existing.state === recorded) {
  need(existing.confirmation_reference === confirmationReference, 'evidence_deletion_confirmation_conflict', 409);
  return output(existing);
 }
 need(existing.state === pending && existing.confirmation_reference === null && existing.confirmed_at === null, 'evidence_deletion_state_conflict', 409);
 await ctx.db.batch([
  stmt(`UPDATE lky_evidence_deletions SET state=?,confirmation_reference=?,confirmed_at=?
   WHERE id=? AND tenant=? AND owner=? AND state=?
    AND confirmation_reference IS NULL AND confirmed_at IS NULL AND ${ctx.fence}`,
  recorded, confirmationReference, ctx.now, deletion, ctx.tenant, ctx.actor, pending, ...ctx.fenceArgs),
  audit('evidence_deletion_confirmation_recorded', deletion, 'changes()=1', []),
 ]);
 const saved = await own('id=?', deletion);
 need(saved, 'authority_changed', 409);
 need(saved.state === recorded && saved.confirmation_reference === confirmationReference, 'evidence_deletion_confirmation_conflict', 409);
 return output(saved);
}
