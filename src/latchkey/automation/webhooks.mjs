import {storeSigningKey,loadSigningKey} from './signing-custody.mjs';
import { decode, id } from '../crypto/envelope.mjs';
import { canonicalJson } from '../reviews/common.mjs';
import { access, exact, human, need, transact, uuid } from './common.mjs';

export const securityEvents = ['vault_created','vault_shared','vault_rotated','item_erased','review_closed','internal_share_created','internal_share_approved','internal_share_revoked','machine_revoked','mcp_access_requested','mcp_access_owner_approved','mcp_access_owner_denied','mcp_access_fulfilled'];
const live = `EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id JOIN lky_devices d ON d.account_id=a.id WHERE a.id=s.owner AND a.tenant=s.tenant AND a.generation=s.generation AND o.version=s.operator_version AND o.status='active' AND o.role='owner' AND d.id=s.source_device AND d.generation=a.generation AND d.revoked_at IS NULL)`;
const output = row => ({ id:row.id,endpoint:row.endpoint,events:JSON.parse(row.events),revision:row.revision,active:!!row.active,createdAt:row.created_at });
const deliveryOutput = row => ({ id:row.id,event:row.event_id,phase:row.phase,attempts:row.attempts,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at });
function endpoint(value, env) {
 const url = new URL(value);
 need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'invalid_webhook_endpoint');
 // Explicit deployment egress origins prevent DNS/redirect SSRF. This setting
 // contains origins only, never credentials or signed endpoint URLs.
 let origins = env?.LATCHKEY_WEBHOOK_ORIGINS;
 if (typeof origins === 'string') { try { origins = JSON.parse(origins); } catch { origins = null; } }
 need(Array.isArray(origins) && origins.includes(url.origin), 'webhook_origin_not_allowed', 403);
 return url.href;
}
const keyBytes = secret => { need(typeof secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(secret), 'invalid_webhook_secret'); const bytes = decode(secret,32); need(bytes.length === 32, 'invalid_webhook_secret'); return bytes; };
export async function signWebhook(secret, event, timestamp, body) {
 const material = keyBytes(secret);
 try {
  const key = await crypto.subtle.importKey('raw',material,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${event}.${timestamp}.${body}`)));
  return 'v1,' + btoa(String.fromCharCode(...bytes));
 } finally { material.fill(0); }
}

async function subscription(ctx, value) {
 const row = await access(ctx).first('SELECT * FROM lky_webhook_subscriptions WHERE id=? AND tenant=? AND owner=?',uuid(value),ctx.tenant,ctx.actor);
 need(row,'not_found',404); return row;
}
async function dispatch(ctx, row, delivery) {
 const {first,stmt,event} = access(ctx), attempt = id();
 need(row.active && await first(`SELECT 1 AS allowed FROM lky_webhook_subscriptions s WHERE s.id=? AND s.active=1 AND ${live}`,row.id),'webhook_authorization_revoked',403);
 endpoint(row.endpoint,ctx.env);
 need(delivery && delivery.subscription_id === row.id,'not_found',404);
 need(!delivery.lease_until || delivery.lease_until <= ctx.now,'webhook_dispatch_in_progress',409);
 // The lease allows explicit replay after an interrupted worker. An uncertain
 // send can repeat, always with the same event ID and identical payload bytes.
 const gate = `EXISTS(SELECT 1 FROM lky_webhook_subscriptions s WHERE s.id=? AND s.revision=? AND s.active=1 AND ${live}) AND EXISTS(SELECT 1 FROM lky_webhook_deliveries WHERE id=? AND (lease_until IS NULL OR lease_until<=?))`;
 await transact(ctx,[stmt("UPDATE lky_webhook_deliveries SET phase='dispatching',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=?",ctx.now+60000,ctx.now,delivery.id),stmt("INSERT INTO lky_webhook_attempts VALUES(?,?,?,?,NULL,NULL,'pending')",attempt,delivery.id,row.revision,ctx.now),event('security_webhook_dispatch_authorized',delivery.id)],gate,[row.id,row.revision,delivery.id,ctx.now]);
 let status = null, phase = 'backlog',stage='signing';
 try {
  const timestamp = String(Math.floor(ctx.now/1000)), signature = await signWebhook(await loadSigningKey(ctx,row),delivery.event_id,timestamp,delivery.payload);
  stage='authority';
  // Recheck immediately before egress, including deployment allowlist changes.
  need(await first(`SELECT 1 AS allowed FROM lky_webhook_subscriptions s WHERE s.id=? AND s.revision=? AND s.active=1 AND ${live}`,row.id,row.revision),'webhook_authorization_revoked',403);
  stage='transport';
  const response = await (ctx.fetcher ?? fetch)(endpoint(row.endpoint,ctx.env),{method:'POST',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','webhook-id':delivery.event_id,'webhook-timestamp':timestamp,'webhook-signature':signature},body:delivery.payload});
  stage='response';status = response.status; phase = response.ok ? 'accepted' : 'backlog';
  await response.body?.cancel();
 } catch { /* Raw network exceptions and response bodies are never retained. */ }
 await ctx.db.batch([stmt('UPDATE lky_webhook_attempts SET completed_at=?,status=?,outcome=? WHERE id=?',ctx.now,status,phase==='accepted'?'accepted':'backlog:'+stage,attempt),stmt('UPDATE lky_webhook_deliveries SET phase=?,status=?,lease_until=NULL,updated_at=? WHERE id=?',phase,status,ctx.now,delivery.id),event(phase === 'accepted'?'security_webhook_accepted':'security_webhook_backlog',delivery.id)]);
 return deliveryOutput(await first('SELECT * FROM lky_webhook_deliveries WHERE id=?',delivery.id));
}

export async function webhooksAuthenticated(route,input,ctx) {
 if (!route.startsWith('webhook/')) return null;
 await human(ctx); need(ctx.session.operator.role === 'owner','owner_required',403);
 const {first,all,stmt,event} = access(ctx);
 if (route === 'webhook/list') { exact(input,[]);return (await all('SELECT * FROM lky_webhook_subscriptions WHERE tenant=? AND owner=? ORDER BY id',ctx.tenant,ctx.actor)).map(output); }
 if (route === 'webhook/subscribe') {
  exact(input,['endpoint','events','secret','confirmed']);need(input.confirmed === true,'webhook_consent_required',403);
  const url = endpoint(input.endpoint,ctx.env);keyBytes(input.secret).fill(0);
  need(Array.isArray(input.events) && input.events.length > 0 && new Set(input.events).size === input.events.length && input.events.every(value => securityEvents.includes(value)),'invalid_event_scope');
  const account = await first('SELECT generation FROM lky_accounts WHERE id=?',ctx.actor), subscription = id();
  await transact(ctx,[stmt('INSERT INTO lky_webhook_subscriptions VALUES(?,?,?,?,?,?,?,?,?,1,1,?)',subscription,ctx.tenant,ctx.actor,url,canonicalJson([...input.events].sort()),await storeSigningKey(ctx,subscription,1,input.secret),ctx.device,account.generation,ctx.session.operator.version,ctx.now),event('security_webhook_subscribed',subscription)]);
  return output(await subscriptionRow(subscription));
 }
 async function subscriptionRow(value) { return subscription(ctx,value); }
 const row = await subscription(ctx,input.subscription);
 if (route === 'webhook/status') { exact(input,['subscription']); return {subscription:output(row),deliveries:(await all('SELECT * FROM lky_webhook_deliveries WHERE subscription_id=? ORDER BY created_at,id',row.id)).map(deliveryOutput)}; }
 need(input.revision === row.revision,'webhook_revision_changed',409);
 if (route === 'webhook/revoke' || route === 'webhook/rotate') {
  exact(input,route === 'webhook/rotate'?['subscription','revision','secret','confirmed']:['subscription','revision']);
  if (route === 'webhook/rotate') { need(input.confirmed === true,'webhook_consent_required',403);keyBytes(input.secret).fill(0);need(row.active,'webhook_authorization_revoked',403); }
  await transact(ctx,[route === 'webhook/rotate'?stmt('UPDATE lky_webhook_subscriptions SET secret=?,revision=revision+1 WHERE id=?',await storeSigningKey(ctx,row.id,row.revision+1,input.secret),row.id):stmt("UPDATE lky_webhook_subscriptions SET active=0,secret='',revision=revision+1 WHERE id=?",row.id),event(route === 'webhook/rotate'?'security_webhook_key_rotated':'security_webhook_revoked',row.id)],'EXISTS(SELECT 1 FROM lky_webhook_subscriptions WHERE id=? AND revision=?)',[row.id,row.revision]);
  return output(await subscription(ctx,row.id));
 }
 need(row.active,'webhook_authorization_revoked',403);
 if (route === 'webhook/enqueue') {
  exact(input,['subscription','revision','event','confirmed']);need(input.confirmed === true,'webhook_consent_required',403);
  const source = await first('SELECT id,action,created_at FROM lky_events WHERE id=? AND actor=?',uuid(input.event),ctx.actor);
  need(source && source.created_at >= row.created_at && JSON.parse(row.events).includes(source.action),'event_outside_scope',403);
  const payload = canonicalJson({schema:'latchkey/security-event/v1',id:source.id,type:source.action,occurredAt:source.created_at,scope:{account:ctx.actor,events:JSON.parse(row.events)}}), delivery = id();
  await transact(ctx,[stmt("INSERT INTO lky_webhook_deliveries VALUES(?,?,?,?,'queued',0,NULL,NULL,?,?) ON CONFLICT(subscription_id,event_id) DO NOTHING",delivery,row.id,source.id,payload,ctx.now,ctx.now),event('security_webhook_queued',source.id)],`EXISTS(SELECT 1 FROM lky_webhook_subscriptions s WHERE s.id=? AND s.revision=? AND s.active=1 AND ${live})`,[row.id,row.revision]);
  return deliveryOutput(await first('SELECT * FROM lky_webhook_deliveries WHERE subscription_id=? AND event_id=?',row.id,source.id));
 }
 if (route === 'webhook/dispatch') { exact(input,['subscription','revision','delivery','confirmed']);need(input.confirmed === true,'webhook_consent_required',403);return dispatch(ctx,row,await first('SELECT * FROM lky_webhook_deliveries WHERE id=? AND subscription_id=?',uuid(input.delivery),row.id)); }
 need(false,'not_found',404);
}
