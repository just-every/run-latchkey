import { access, exact, guarded, need, uuid } from '../lifecycle/common.mjs';
import { id } from '../crypto/envelope.mjs';
export const recoverPermission='accounts.recover';
import { recoveryDomain, scopedPolicy, scopedPurpose } from './authorization-client.mjs';
export { recoveryDomain, scopedPolicy, scopedPurpose };
// A scope covers the existing company account envelope, never an isolated vault.
const scopePredicate=`SELECT 1 FROM lky_recovery_scopes s
 JOIN lky_accounts m ON m.id=s.member AND m.tenant=s.tenant
 JOIN oa_operators mo ON mo.id=m.operator_id
 JOIN lky_accounts c ON c.id=s.custodian AND c.tenant=s.tenant
 JOIN oa_operators co ON co.id=c.operator_id
 WHERE s.id=? AND s.tenant=? AND s.member=? AND s.custodian=?
 AND s.permission='accounts.recover' AND s.domain='company-account'
 AND s.member_generation=m.generation AND s.custodian_generation=c.generation
 AND s.recipient_key=m.recipient_key AND s.authority_key=m.authority_key
 AND mo.status='active' AND mo.role IN('admin','member') AND co.status='active' AND co.role IN('admin','member')
 AND mo.version=s.member_version AND co.version=s.custodian_version
 AND m.id<>c.id
 AND NOT EXISTS(SELECT 1 FROM lky_recipients r JOIN lky_vaults v ON v.id=r.vault_id WHERE r.account_id=m.id AND v.kind='family')`;
export function scopeGuard(ctx,scope,member,custodian){return access(ctx).guard(`EXISTS(${scopePredicate})`,[scope,ctx.tenant,member,custodian])}
export async function requireScope(ctx,scope,member,custodian){
 need(await access(ctx).first(scopePredicate,uuid(scope),ctx.tenant,member,custodian),'scoped_recovery_authority_required',403);
 return scopeGuard(ctx,scope,member,custodian);
}
export async function recoveryAuthority(ctx,enrolled){
 const {first,guard}=access(ctx);
 need(['self','administrator'].includes(enrolled.kind),'recovery_policy_incompatible',403);
 const enrollmentGuard=guard('EXISTS(SELECT 1 FROM lky_recovery_custody WHERE id=? AND account=? AND generation=? AND kind=? AND custodian IS ? AND custodian_generation IS ? AND wrapped=? AND revoked_at IS NULL)',[enrolled.id,enrolled.account,enrolled.generation,enrolled.kind,enrolled.custodian,enrolled.custodian_generation,enrolled.wrapped]);
 const scoped=await first('SELECT * FROM lky_scoped_recovery_enrollments WHERE enrollment=?',enrolled.id);
 if(scoped){
  need(enrolled.kind==='administrator'&&scoped.policy===scopedPolicy,'recovery_policy_incompatible',403);
  const current=await requireScope(ctx,scoped.scope,enrolled.account,enrolled.custodian);
  return {purpose:scopedPurpose(scoped.scope),guards:[enrollmentGuard,current,guard('EXISTS(SELECT 1 FROM lky_scoped_recovery_enrollments WHERE enrollment=? AND scope=? AND policy=?)',[enrolled.id,scoped.scope,scopedPolicy])],scope:scoped.scope};
 }
 if(enrolled.kind==='self')return {purpose:'self-recovery',guards:[enrollmentGuard]};
 need(await first("SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND a.generation=? AND o.role='owner' AND o.status='active'",enrolled.custodian,ctx.tenant,enrolled.custodian_generation),'recovery_administrator_unavailable',403);
 return {purpose:'administrator-recovery',guards:[enrollmentGuard,guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND a.generation=? AND o.role='owner' AND o.status='active')",[enrolled.custodian,ctx.tenant,enrolled.custodian_generation])]};
}
export async function scopedRecoveryAdministration(route,input,ctx){
 if(!['admin' + '/recovery-scopes','admin' + '/recovery-scopes/set'].includes(route))return null;
 const {all,first,stmt,event,guard}=access(ctx);
 if(route==='admin' + '/recovery-scopes'){
  exact(input,[]);
  const scopes=ctx.session.operator.role==='owner'?await all('SELECT * FROM lky_recovery_scopes WHERE tenant=? ORDER BY custodian,member',ctx.tenant):await all('SELECT * FROM lky_recovery_scopes WHERE tenant=? AND (custodian=? OR member=?) ORDER BY custodian,member',ctx.tenant,ctx.actor,ctx.actor);
  return {permission:recoverPermission,domain:recoveryDomain,policy:scopedPolicy,scopes};
 }
 exact(input,['custodian','members','confirmed']);need(ctx.session.operator.role==='owner','owner_required',403);need(input.confirmed===true,'admin_consent_required',403);
 const custodian=uuid(input.custodian);
 need(Array.isArray(input.members)&&input.members.length<=100,'invalid_recovery_scope');
 const target=await first("SELECT a.*,o.version AS operator_version FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.role IN('admin','member') AND o.status='active'",custodian,ctx.tenant);need(target,'named_nonowner_custodian_required',403);
 const rows=[];
 for(const member of input.members){
  exact(member,['account','generation','domain']);uuid(member.account);
  need(member.account!==custodian&&member.domain===recoveryDomain&&Number.isSafeInteger(member.generation)&&member.generation>0&&!rows.some(row=>row.member===member.account),'invalid_recovery_scope');
  const account=await first("SELECT a.*,o.version AS operator_version FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND a.generation=? AND o.status='active' AND o.role IN('admin','member')",member.account,ctx.tenant,member.generation);need(account,'recovery_member_unavailable',403);
  need(!await first("SELECT 1 FROM lky_recipients r JOIN lky_vaults v ON v.id=r.vault_id WHERE r.account_id=? AND v.kind='family'",account.id),'independent_family_account_required',403);
  rows.push({id:id(),member:account.id,generation:account.generation,operatorVersion:account.operator_version,recipient:account.recipient_key,authority:account.authority_key});
 }
 // A replacement has fresh scope identities; old envelopes cannot be reassigned.
 await guarded(ctx,[],[stmt('DELETE FROM lky_recovery_scopes WHERE tenant=? AND custodian=?',ctx.tenant,custodian),...rows.map(row=>stmt('INSERT INTO lky_recovery_scopes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',row.id,ctx.tenant,custodian,target.generation,target.operator_version,row.member,row.generation,row.operatorVersion,recoveryDomain,recoverPermission,row.recipient,row.authority,ctx.actor,ctx.now)),event('recovery_scopes_changed',custodian)],
 [guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.generation=? AND o.version=? AND o.status='active' AND o.role IN('admin','member'))",[custodian,target.generation,target.operator_version]),...rows.map(row=>guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.generation=? AND a.recipient_key=? AND a.authority_key=? AND o.version=? AND o.status='active' AND o.role IN('admin','member')) AND NOT EXISTS(SELECT 1 FROM lky_recipients r JOIN lky_vaults v ON v.id=r.vault_id WHERE r.account_id=? AND v.kind='family')",[row.member,row.generation,row.recipient,row.authority,row.operatorVersion,row.member]))]);
 return {custodian,permission:recoverPermission,domain:recoveryDomain,scopes:rows.map(row=>({id:row.id,member:row.member,generation:row.generation})),freshEnrollmentRequired:true,vaultRightsChanged:false};
}
