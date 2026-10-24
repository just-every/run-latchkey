import { evidenceRoutes } from './routes.mjs';
import { access, canonicalJson, exact, id, need, uuid } from '../reviews/common.mjs';
import { transact } from '../reviews/state.mjs';
import { evidenceSource } from './sources.mjs';

export const deliveryOutput = row => {
 const stage = JSON.parse(row.stage);
 return { ...row, state: row.phase, sourceTimestamp: row.source_timestamp, providerReference: row.provider_reference,
  retryable: !!row.retryable, stage, signedPackage: row.signed_package ? JSON.parse(row.signed_package) : null,
  requiresReconciliation: stage.state === 'reconciliation-required' || row.phase === 'pending' && stage.state === 'in-flight',
  leaseExpired: row.phase === 'pending' && stage.state === 'in-flight' && stage.leaseUntil <= Date.now() };
};
async function owned(ctx, delivery) {
 const row = await access(ctx).first('SELECT * FROM lky_evidence_deliveries WHERE id=? AND tenant=? AND owner=?', uuid(delivery), ctx.tenant, ctx.actor);
 need(row, 'evidence_delivery_not_found', 404); return row;
}
export async function evidenceAttemptAuthenticated(route, input, ctx) {
 if (![evidenceRoutes.delivery, evidenceRoutes.startAttempt, evidenceRoutes.checkpointAttempt, evidenceRoutes.inspectAttempt].includes(route)) return null;
 if (route === evidenceRoutes.delivery) { exact(input, ['delivery']); return deliveryOutput(await owned(ctx, input.delivery)); }
 const checkpoint = route === evidenceRoutes.checkpointAttempt, inspecting = route === evidenceRoutes.inspectAttempt;
 exact(input, inspecting ? ['delivery'] : checkpoint ? ['delivery', 'attempt', 'uploadReference'] : ['delivery', 'stage']);
 const row = await owned(ctx, input.delivery), previous = JSON.parse(row.stage);
 need(inspecting || row.phase === 'pending', 'evidence_delivery_finished', 409);
 const source = await evidenceSource(ctx, row.review_id), { first, stmt, event, guard } = access(ctx);
 const target = await first('SELECT * FROM lky_evidence_destinations WHERE id=? AND tenant=? AND owner=?', row.destination_id, ctx.tenant, ctx.actor);
 need(target?.active && target.revision === row.destination_revision, 'evidence_destination_changed', 409);
 const now = Math.max(ctx.now, Date.now());
 need(now < source.sourceTimestamp + target.max_age_seconds * 1000, 'evidence_source_stale', 409);
 if (inspecting) return { ...deliveryOutput(row), destination: { destination: target.destination, endpoint: target.endpoint, target: target.target } };
 let next;
 if (checkpoint) {
  uuid(input.attempt);
  need(previous.state === 'in-flight' && previous.name === 'upload' && previous.attempt === input.attempt && ['vanta', 'drata'].includes(target.destination), 'evidence_attempt_changed', 409);
  need(typeof input.uploadReference === 'string' && input.uploadReference.trim().length > 0 && input.uploadReference.length <= 1000, 'invalid_evidence_reference');
  next = { ...previous, state: 'upload-acknowledged', uploadReference: input.uploadReference, attempts: previous.attempts.map(attempt => attempt.id === previous.attempt ? { ...attempt, outcome: 'upload-acknowledged', providerReference: input.uploadReference } : attempt) };
 } else {
  const stage = input.stage;
  need(stage && ['upload', 'submit', 'create'].includes(stage.name), 'invalid_evidence_stage');
  exact(stage, stage.name === 'upload' ? ['name', 'binding'] : ['name', 'binding', 'uploadReference']);
  need(typeof stage.binding === 'string' && stage.binding.length > 0 && stage.binding.length <= 2000, 'invalid_evidence_stage');
  if (stage.name === 'upload') need(Object.keys(previous).length === 0, 'evidence_reconciliation_required', 409);
  else need(previous.state === 'upload-acknowledged' && previous.binding === stage.binding && previous.uploadReference === stage.uploadReference
   && stage.name === ({ vanta: 'submit', drata: 'create' })[target.destination], 'evidence_reconciliation_required', 409);
  // Expiry never grants permission to repeat an ambiguous provider write.
  const attempt = id();
  next = { ...stage, attempt, state: 'in-flight', leaseUntil: now + 60000, attempts: [...(previous.attempts ?? []), { id: attempt, stage: stage.name, startedAt: now, outcome: 'in-flight' }] };
 }
 const fresh = { ...ctx, now, fenceArgs: ctx.fenceArgs.map(value => value === ctx.now ? now : value) };
 await transact(fresh, source.vault, [
  stmt('UPDATE lky_evidence_deliveries SET stage=?,updated_at=? WHERE id=?', canonicalJson(next), now, row.id),
  event(checkpoint ? 'evidence_upload_checkpointed' : 'evidence_provider_attempt_started', row.id),
 ], [guard("EXISTS(SELECT 1 FROM lky_evidence_deliveries WHERE id=? AND phase='pending' AND stage=?)", [row.id, row.stage]),
  guard('EXISTS(SELECT 1 FROM lky_evidence_destinations WHERE id=? AND tenant=? AND owner=? AND active=1 AND revision=?)', [target.id, ctx.tenant, ctx.actor, row.destination_revision]),
  guard(source.guard.sql, source.guard.args)]);
 return deliveryOutput(await owned(ctx, row.id));
}
