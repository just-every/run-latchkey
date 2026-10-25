import { access, exact, need, uuid } from '../lifecycle/common.mjs';
// Scope narrows an explicit preview. It never grants authority or adds recipients.
export async function scopeGuards(ctx,value) {
 const scope=value.scope??{group:null,project:null};exact(scope,['group','project']);
 const {first,guard}=access(ctx),checks=[];
 const requireScope=async(sql,args)=>{need(await first(`SELECT 1 WHERE ${sql}`,...args),'rule_scope_changed',409);checks.push(guard(sql,args))};
 if(scope.group!==null){
  uuid(scope.group);
  await requireScope('EXISTS(SELECT 1 FROM lky_share_groups WHERE id=? AND tenant=? AND created_by=?)',[scope.group,ctx.tenant,ctx.actor]);
  for(const recipient of value.recipients)await requireScope('EXISTS(SELECT 1 FROM lky_share_group_members WHERE group_id=? AND account_id=?)',[scope.group,recipient]);
 }
 if(scope.project!==null){
  uuid(scope.project);
  await requireScope("EXISTS(SELECT 1 FROM lky_projects p WHERE p.id=? AND p.tenant=? AND p.owner=? AND p.vault_id=? AND NOT EXISTS(SELECT 1 FROM lky_lifecycle l WHERE l.vault_id=p.vault_id AND l.object_id=p.metadata_object AND l.state<>'active'))",[scope.project,ctx.tenant,ctx.actor,value.vault]);
  for(const target of value.targets)await requireScope("EXISTS(SELECT 1 FROM lky_project_resources r JOIN lky_project_environments e ON e.id=r.environment_id WHERE e.project_id=? AND r.vault_id=? AND r.object_id=? AND NOT EXISTS(SELECT 1 FROM lky_lifecycle l WHERE l.vault_id=r.vault_id AND l.object_id=e.catalog_object AND l.state<>'active'))",[scope.project,value.vault,target.object]);
 }
 return checks;
}
