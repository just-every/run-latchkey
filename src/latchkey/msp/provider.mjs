import {providerPosture} from './posture.mjs';
import { digest, id } from '../crypto/envelope.mjs';
import { access, currentPolicy, event, exact, liveSql, need, policyInput, previewHash, restrictive, uuid } from './common.mjs';

async function summary(ctx,delegation){
 const{all,first}=access(ctx),snapshot=await currentPolicy(ctx);
 // No names, email, item metadata, private/family vaults, audit or keys enter
 // this projection. Enrollment is an observation, never security or adoption.
 const people=await all(`SELECT o.id,o.status,EXISTS(SELECT 1 FROM lky_accounts a JOIN lky_devices v ON v.account_id=a.id AND v.generation=a.generation AND v.revoked_at IS NULL WHERE a.operator_id=o.id AND a.tenant=?) AS enrolled FROM oa_operators o WHERE EXISTS(SELECT 1 FROM lky_msp_delegations d WHERE d.id=? AND ${liveSql}) ORDER BY o.id LIMIT 10001`,ctx.tenant,delegation.id,ctx.now);
 need(people.length<=10000,'summary_requires_pagination',409);
 const members=await Promise.all(people.map(async row=>({reference:await digest(`${ctx.tenant}/member/${row.id}`),status:row.status,enrolled:!!row.enrolled})));
 return{tenant:ctx.tenant,delegation:delegation.id,revision:snapshot.mutation,observedAt:ctx.now,onboarding:{active:people.filter(p=>p.status==='active').length,invited:people.filter(p=>p.status==='invited').length,suspended:people.filter(p=>p.status==='inactive').length,enrolled:people.filter(p=>p.status==='active'&&p.enrolled).length},members,
 ...(JSON.parse(delegation.scopes).includes('posture')?await providerPosture(ctx,people):{health:{coverage:'unknown',reason:'No credential-health source is connected to this delegation.'},adoption:{coverage:'unknown',reason:'Device enrollment does not measure actual usage or adoption.'}}),
 commercial:await first('SELECT status,reference,recorded_at AS recordedAt FROM lky_msp_commercial WHERE tenant=?',ctx.tenant)??{status:'not_recorded'},policy:snapshot.policy,exceptions:[]};
}
async function preview(ctx,delegation,input){
 exact(input,['policy']);need(JSON.parse(delegation.scopes).includes('template'),'template_not_delegated',403);
 const after=policyInput(input.policy),before=await currentPolicy(ctx);restrictive(before.policy,after);
 const value={id:id(),tenant:ctx.tenant,delegation:delegation.id,revision:before.mutation,before:before.policy,after,expiresAt:ctx.now+300000,exceptions:[]};
 const hash=await previewHash(value),{stmt}=access(ctx);
 const rows=await ctx.db.batch([stmt('DELETE FROM lky_msp_previews WHERE expires_at<=? AND operation IS NULL',ctx.now),stmt(`INSERT INTO lky_msp_previews SELECT ?,?,?,?,?,?,?,?,NULL WHERE EXISTS(SELECT 1 FROM lky_msp_delegations d WHERE d.id=? AND ${liveSql})`,value.id,delegation.id,ctx.tenant,hash,JSON.stringify(value.before),JSON.stringify(after),before.mutation,value.expiresAt,delegation.id,ctx.now)]);
 need(rows[1].meta.changes,'delegation_unavailable',403);return{...value,hash};
}
async function apply(ctx,delegation,input){
 exact(input,['preview','hash','confirmed']);uuid(input.preview);need(input.confirmed===true,'template_confirmation_required',403);
 need(typeof input.hash==='string'&&/^[A-Za-z0-9_-]{43}$/.test(input.hash),'invalid_preview_hash');need(JSON.parse(delegation.scopes).includes('template'),'template_not_delegated',403);
 const{first,stmt}=access(ctx),row=await first('SELECT * FROM lky_msp_previews WHERE id=? AND delegation=? AND tenant=?',input.preview,delegation.id,ctx.tenant);
 need(row&&row.hash===input.hash&&row.expires_at>ctx.now,'preview_unavailable',409);
 if(row.operation){const prior=await currentPolicy(ctx);return{applied:true,operation:row.operation,policy:JSON.parse(row.after_policy),currentPolicy:prior.policy,replayed:true};}
 const after=policyInput(JSON.parse(row.after_policy)),before=JSON.parse(row.before_policy),current=await currentPolicy(ctx);restrictive(before,after);
 need(current.mutation===row.policy_mutation&&JSON.stringify(current.policy)===JSON.stringify(before),'template_plan_changed',409);
 const operation=id(),active='EXISTS(SELECT 1 FROM lky_msp_previews WHERE id=? AND operation=?)',args=[row.id,operation];
 const policyGuard=row.policy_mutation===null?'NOT EXISTS(SELECT 1 FROM lky_sharing_policy WHERE tenant=?)':'EXISTS(SELECT 1 FROM lky_sharing_policy WHERE tenant=? AND mutation=?)';
 const rows=await ctx.db.batch([
  stmt(`UPDATE lky_msp_previews SET operation=? WHERE id=? AND delegation=? AND operation IS NULL AND expires_at>? AND hash=? AND EXISTS(SELECT 1 FROM lky_msp_delegations d WHERE d.id=? AND ${liveSql} AND EXISTS(SELECT 1 FROM json_each(d.scopes) WHERE value='template')) AND ${policyGuard}`,operation,row.id,delegation.id,ctx.now,input.hash,delegation.id,ctx.now,ctx.tenant,...(row.policy_mutation===null?[]:[row.policy_mutation])),
  stmt(`INSERT INTO lky_sharing_policy SELECT ?,?,?,?,?,? WHERE ${active} ON CONFLICT(tenant) DO UPDATE SET external_enabled=excluded.external_enabled,domains=excluded.domains,default_days=excluded.default_days,max_days=excluded.max_days,mutation=excluded.mutation`,ctx.tenant,Number(after.externalEnabled),JSON.stringify(after.domains),after.defaultDays,after.maxDays,operation,...args),
  event(ctx,'msp_template_applied',operation,active,args),
 ]);
 need(rows[0].meta.changes,'template_plan_changed',409);return{applied:true,operation,policy:after};
}
export async function providerAction(ctx,delegation,action,input){
 if(action==='summary'){exact(input,[]);return summary(ctx,delegation)}
 if(action==='preview')return preview(ctx,delegation,input);
 if(action==='apply')return apply(ctx,delegation,input);
 need(false,'msp_action_not_delegated',403);
}
