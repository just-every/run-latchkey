import { evidenceRoutes } from './routes.mjs';
import { access, canonicalJson, exact, id, need, uuid } from '../reviews/common.mjs';
import { transact } from '../reviews/state.mjs';
import { evidenceSource } from './sources.mjs';

export const deliveryOutput = row => {
 const stage = JSON.parse(row.stage);
 return { ...row, state: row.phase, sourceTimestamp: row.source_timestamp, providerReference: row.provider_reference,
  retryable: !!row.retryable, stage, inspectionBlocked:(stage.inspection?.pages??0)>=10&&stage.inspection?.presence==='unknown', signedPackage: row.signed_package ? JSON.parse(row.signed_package) : null,
  requiresReconciliation: stage.state === 'reconciliation-required' || row.phase === 'pending' && stage.state === 'in-flight',
  leaseExpired: row.phase === 'pending' && stage.state === 'in-flight' && stage.leaseUntil <= Date.now() };
};
async function owned(ctx, delivery) {
 const row = await access(ctx).first('SELECT * FROM lky_evidence_deliveries WHERE id=? AND tenant=? AND owner=?', uuid(delivery), ctx.tenant, ctx.actor);
 need(row, 'evidence_delivery_not_found', 404); return row;
}
export async function evidenceAttemptAuthenticated(route, input, ctx) {
 if (![evidenceRoutes.delivery, evidenceRoutes.startAttempt, evidenceRoutes.checkpointAttempt, evidenceRoutes.inspectAttempt, evidenceRoutes.startInspection, evidenceRoutes.finishInspection, evidenceRoutes.checkpointInspection].includes(route)) return null;
 if (route === evidenceRoutes.delivery) { exact(input, ['delivery']); return deliveryOutput(await owned(ctx, input.delivery)); }
 const paging = route === evidenceRoutes.checkpointInspection;
 const checkpoint = route === evidenceRoutes.checkpointAttempt, starting = route === evidenceRoutes.startInspection, finishing = route === evidenceRoutes.finishInspection, inspecting = route === evidenceRoutes.inspectAttempt || starting || finishing || paging;
 exact(input, paging ? ['delivery','inspection','cursor','nextCursor','page'] : finishing ? ['delivery', 'inspection', 'status', 'presence', 'pages', 'retryAfterSeconds'] : route === evidenceRoutes.inspectAttempt && Object.hasOwn(input,'inspection') ? ['delivery','inspection'] : inspecting ? ['delivery'] : checkpoint ? ['delivery', 'attempt', 'uploadReference'] : ['delivery', 'stage']);
 const row = await owned(ctx, input.delivery), previous = JSON.parse(row.stage);
 need(inspecting || row.phase === 'pending', 'evidence_delivery_finished', 409);
 const source = await evidenceSource(ctx, row.review_id), { first, stmt, event, guard } = access(ctx);
 const target = await first('SELECT * FROM lky_evidence_destinations WHERE id=? AND tenant=? AND owner=?', row.destination_id, ctx.tenant, ctx.actor);
 need(target?.active && target.revision === row.destination_revision, 'evidence_destination_changed', 409);
 const now = Math.max(ctx.now, Date.now());
 need(now < source.sourceTimestamp + target.max_age_seconds * 1000, 'evidence_source_stale', 409);
 if (starting || finishing || paging) {
  need(target.destination === 'vanta' && previous.uploadReference, 'evidence_inspection_unavailable', 409);
  const saved = previous.inspection;
  let inspection;
  if (starting) {
   need(!saved || saved.nextAllowedAt <= now, 'evidence_inspection_backoff', 429);
   const resume=saved?.presence==='unknown'||saved?.state==='in-flight';
   need(!resume||(saved.pages??0)<10,'evidence_inspection_page_limit',409);
   inspection = {id:id(),state:'in-flight',startedAt:now,nextAllowedAt:now+60000,cursor:resume?saved.cursor??null:null,seenCursors:resume?saved.seenCursors??[]:[],pages:resume?saved.pages??0:0};
  } else {
   need(saved?.id === input.inspection && saved.state === 'in-flight' && saved.nextAllowedAt > now, 'evidence_inspection_changed', 409);
   if(paging){
    need((input.cursor===null||typeof input.cursor==='string')&&(input.nextCursor===null||typeof input.nextCursor==='string'&&input.nextCursor.length>0&&input.nextCursor.length<=2000),'invalid_evidence_cursor');
    need(input.page===(saved.pages??0)+1&&input.cursor===(saved.cursor??null)&&(!input.nextCursor||!(saved.seenCursors??[]).includes(input.nextCursor))&&(saved.pages??0)<10,'evidence_cursor_changed',409);
    inspection={...saved,cursor:input.nextCursor,seenCursors:[...(saved.seenCursors??[]),...(input.nextCursor?[input.nextCursor]:[])],pages:(saved.pages??0)+1};
   }else{
   need(['found','not-found','unknown'].includes(input.presence) && (input.status === null || Number.isSafeInteger(input.status) && input.status >= 100 && input.status <= 599) && Number.isSafeInteger(input.pages) && input.pages >= 0 && input.pages <= 10 && Number.isSafeInteger(input.retryAfterSeconds) && input.retryAfterSeconds >= 0 && input.retryAfterSeconds <= 86400, 'invalid_evidence_inspection');
   need(input.pages>=(saved.pages??0)&&input.pages<=Math.min(10,(saved.pages??0)+1),'invalid_evidence_inspection');
   const failures = input.presence === 'unknown' ? Math.min(10,(saved.failures ?? 0)+1) : 0;
   inspection = {...saved,state:'client-reported',observedAt:now,status:input.status,presence:input.presence,pages:input.pages,failures,nextAllowedAt:now+Math.max(30, input.retryAfterSeconds, failures ? Math.min(3600,30*2**failures) : 30)*1000};
   }
  }
  if (starting) inspection.failures = saved?.failures ?? 0;
  const fresh = {...ctx,now,fenceArgs:ctx.fenceArgs.map(value=>value===ctx.now?now:value)};
  await transact(fresh,source.vault,[stmt('UPDATE lky_evidence_deliveries SET stage=? WHERE id=?',canonicalJson({...previous,inspection}),row.id)],
   [guard('EXISTS(SELECT 1 FROM lky_evidence_deliveries WHERE id=? AND stage=?)',[row.id,row.stage]),
    guard('EXISTS(SELECT 1 FROM lky_evidence_destinations WHERE id=? AND tenant=? AND owner=? AND active=1 AND revision=?)',[target.id,ctx.tenant,ctx.actor,row.destination_revision]),
    guard(source.guard.sql,source.guard.args)]);
  return {...deliveryOutput(await owned(ctx,row.id)),destination:{destination:target.destination,endpoint:target.endpoint,target:target.target}};
 }
 if (inspecting) {
  need(previous.inspection?.id === input.inspection && previous.inspection.state === 'in-flight' && previous.inspection.nextAllowedAt > now, 'evidence_inspection_changed', 409);
  return { ...deliveryOutput(row), destination: { destination: target.destination, endpoint: target.endpoint, target: target.target } };
 }
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
