import { defaultRolePolicy } from '../../modules/operator-auth/index.mjs';
import { ApiError } from '../api/catalogue.mjs';
import { access, exact, guarded, need, uuid } from '../lifecycle/common.mjs';
export const adminRights=['people.read','people.invite','people.suspend','people.offboard'];
const mapped={'operators:list':'people.read','operators:invite':'people.invite','operators:deactivate':'people.suspend','operators:reactivate':'people.suspend'};
// Base still owns session freshness, invitation integrity and final-owner fences.
// These rights confer no vault key or ability to grant an administrative role.
export function peopleRolePolicy(db){return async decision=>{
 const {actor,action,target,role}=decision;
 if(target&&['operators:deactivate','operators:reactivate'].includes(action)){
  if(await db.prepare('SELECT 1 AS managed FROM oa_external_identities WHERE operator_id=? LIMIT 1').bind(target.id).first())return false;
  if(action==='operators:reactivate'&&await db.prepare('SELECT 1 AS suspended FROM lky_people_offboarding WHERE operator=? LIMIT 1').bind(target.id).first())return false;
 }
 if(actor?.role==='owner')return defaultRolePolicy(decision);
 if((action==='sessions:list'||action==='sessions:revoke')&&target?.id===actor?.id)return defaultRolePolicy(decision);
 if(actor?.status!=='active'||!mapped[action]||(target&&target.role!=='member')||(role&&role!=='member'))return false;
 return !!await db.prepare('SELECT 1 AS allowed FROM lky_admin_permissions p JOIN lky_accounts a ON a.id=p.account WHERE a.operator_id=? AND p.tenant=a.tenant AND p.permission=?').bind(actor.id,mapped[action]).first();
}}
export async function requirePeople(ctx,permission){
 const allowed=ctx.session.operator.role==='owner'||await access(ctx).first('SELECT 1 AS allowed FROM lky_admin_permissions WHERE tenant=? AND account=? AND permission=?',ctx.tenant,ctx.actor,permission);
 if(!allowed)throw new ApiError('independent_admin_permission_required',403);
 if(!await access(ctx).first(`SELECT 1 AS allowed WHERE ${ctx.fence}`,...ctx.fenceArgs))throw new ApiError('authority_changed',409);
}
export async function adminAuthenticated(route,input,ctx){
 if(!route.startsWith('admin/'))return null;
 const {all,first,stmt,event}=access(ctx);
 if(route==='admin' + '/permissions'){exact(input,[]);return {rights:adminRights,grants:ctx.session.operator.role==='owner'?await all('SELECT * FROM lky_admin_permissions WHERE tenant=? ORDER BY account,permission',ctx.tenant):await all('SELECT * FROM lky_admin_permissions WHERE tenant=? AND account=? ORDER BY permission',ctx.tenant,ctx.actor)}}
 if(route==='admin' + '/permissions/set'){
  exact(input,['account','permissions','confirmed']);need(ctx.session.operator.role==='owner','owner_required',403);need(input.confirmed===true,'admin_consent_required',403);
  const account=uuid(input.account);need(Array.isArray(input.permissions)&&input.permissions.length<=adminRights.length&&new Set(input.permissions).size===input.permissions.length&&input.permissions.every(right=>adminRights.includes(right)),'invalid_admin_rights');
  const target=await first("SELECT a.id FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active'",account,ctx.tenant);need(target,'not_found',404);
  await guarded(ctx,[],[stmt('DELETE FROM lky_admin_permissions WHERE tenant=? AND account=?',ctx.tenant,account),...input.permissions.map(right=>stmt('INSERT INTO lky_admin_permissions VALUES(?,?,?,?,?)',ctx.tenant,account,right,ctx.actor,ctx.now)),event('independent_admin_rights_changed',account)]);
  return {account,permissions:input.permissions,vaultRightsChanged:false};
 }
 throw new ApiError('admin_route_not_found',404);
}
