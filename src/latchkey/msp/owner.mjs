import { id, publicKey } from '../crypto/envelope.mjs';
import { access, event, exact, need, origin, uuid } from './common.mjs';
export async function mspAuthenticated(route,input,ctx){
 if(!route.startsWith('msp/'))return null;
 need(ctx.session.operator.role==='owner','owner_required',403);
 const{stmt,first,all}=access(ctx);
 need(await first(`SELECT 1 AS allowed WHERE ${ctx.fence}`,...ctx.fenceArgs),'authority_expired',401);
 if(route==='msp/list'){
  exact(input,[]);
  return{events:await all("SELECT e.id,e.action,e.object_id AS operation,e.created_at AS occurredAt,d.provider FROM lky_events e JOIN lky_msp_delegations d ON d.id=e.device WHERE d.tenant=? AND e.actor='msp-provider' ORDER BY e.created_at,e.id LIMIT 1000",ctx.tenant),delegations:(await all('SELECT * FROM lky_msp_delegations WHERE tenant=? ORDER BY created_at,id',ctx.tenant)).map(row=>({id:row.id,provider:row.provider,consoleOrigin:row.console_origin,scopes:JSON.parse(row.scopes),expiresAt:row.expires_at,revokedAt:row.revoked_at})),commercial:await first('SELECT status,reference,recorded_at AS recordedAt FROM lky_msp_commercial WHERE tenant=?',ctx.tenant)??{status:'not_recorded'}};
 }
 if(route==='msp/grant'){
  exact(input,['provider','publicKey','consoleOrigin','scopes','expiresAt','confirmed']);need(input.confirmed===true,'owner_consent_required',403);
  uuid(input.provider);await publicKey(input.publicKey,'sign');origin(input.consoleOrigin);
  need(Array.isArray(input.scopes)&&input.scopes.includes('summary')&&new Set(input.scopes).size===input.scopes.length&&input.scopes.every(scope=>['summary','template'].includes(scope)),'invalid_delegation_scope');
  need(Number.isSafeInteger(input.expiresAt)&&input.expiresAt>ctx.now&&input.expiresAt<=ctx.now+90*86400000,'invalid_delegation_expiry');
  const account=await first('SELECT generation FROM lky_accounts WHERE id=? AND tenant=?',ctx.actor,ctx.tenant),delegation=id();
  const guard=`${ctx.fence} AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role='owner' AND version=?)`,args=[...ctx.fenceArgs,ctx.session.operator.id,ctx.session.operator.version];
  const rows=await ctx.db.batch([stmt(`INSERT INTO lky_msp_delegations SELECT ?,?,?,?,?,?,?,?,?,?,?,?,NULL WHERE ${guard}`,delegation,ctx.tenant,input.provider,input.publicKey,input.consoleOrigin,JSON.stringify([...input.scopes].sort()),ctx.actor,ctx.device,account.generation,ctx.session.operator.version,input.expiresAt,ctx.now,...args),event(ctx,'msp_delegation_consented',delegation,'EXISTS(SELECT 1 FROM lky_msp_delegations WHERE id=?)',[delegation])]);
  need(rows[0].meta.changes,'authority_changed',409);
  return{schema:'latchkey/delegation/v1',origin:ctx.env.AUTH_ORIGIN,tenant:ctx.tenant,delegation,provider:input.provider,publicKey:input.publicKey,consoleOrigin:input.consoleOrigin,scopes:[...input.scopes].sort(),expiresAt:input.expiresAt};
 }
 if(route==='msp/revoke'||route==='msp/independent'){
  exact(input,route==='msp/revoke'?['delegation','confirmed']:['confirmed']);need(input.confirmed===true,'owner_consent_required',403);
  const target=route==='msp/revoke'?uuid(input.delegation):null,operation=id();
  const rows=await ctx.db.batch([stmt(`UPDATE lky_msp_delegations SET revoked_at=? WHERE tenant=? AND revoked_at IS NULL${target?' AND id=?':''} AND ${ctx.fence}`,ctx.now,ctx.tenant,...(target?[target]:[]),...ctx.fenceArgs),event(ctx,target?'msp_delegation_revoked':'msp_independent_owner_confirmed',target??operation,ctx.fence,ctx.fenceArgs)]);
  if(target){need(rows[0].meta.changes,'delegation_unavailable',404);return{revoked:true}}
  return{independent:true,revoked:rows[0].meta.changes};
 }
 if(route==='msp/commercial'){
  exact(input,['status','reference','confirmed']);need(input.confirmed===true,'owner_consent_required',403);need(['active','cancelled','trial'].includes(input.status)&&typeof input.reference==='string'&&/^[^\x00-\x1f\x7f]{1,100}$/.test(input.reference)&&input.reference===input.reference.trim());
  const rows=await ctx.db.batch([stmt(`INSERT INTO lky_msp_commercial SELECT ?,?,?,?,? WHERE ${ctx.fence} ON CONFLICT(tenant) DO UPDATE SET owner=excluded.owner,status=excluded.status,reference=excluded.reference,recorded_at=excluded.recorded_at`,ctx.tenant,ctx.actor,input.status,input.reference,ctx.now,...ctx.fenceArgs),event(ctx,'msp_commercial_recorded',ctx.tenant,ctx.fence,ctx.fenceArgs)]);
  need(rows[0].meta.changes,'authority_changed',409);return{status:input.status,reference:input.reference,recordedAt:ctx.now};
 }
 need(false,'msp_route_not_found',404);
}
