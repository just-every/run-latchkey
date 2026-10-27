import {access,exact,guarded,has,need,uuid,vaultFor} from '../lifecycle/common.mjs';
import {verifyWrapped} from '../crypto/envelope.mjs';
import {subjectVaultWriteAllowed,subjectItemReplayKnown} from '../erasure/subject.mjs';
export const suppressionBinding=(tenant,vault,record,generation)=>({tenant,vault,object:record,purpose:'health-suppression',epoch:generation,version:1});
const routeName=verb=>['health',verb].join('/');
export async function healthAuthenticated(route,input,ctx){
 if(![routeName('history'),routeName('suppress')].includes(route))return null;
 const writing=route===routeName('suppress');
 exact(input,writing?['vault','revision','object','version','record','code','until','wrapped']:['vault']);
 const vault=await vaultFor(ctx,input.vault),{first,all,stmt,event,guard}=access(ctx);
 need(has(vault,'read'),'permission_denied',403);
 const account=await first('SELECT generation,authority_key FROM lky_accounts WHERE id=? AND tenant=?',ctx.actor,ctx.tenant);
 if(!writing){
  const rows=await all('SELECT * FROM lky_health_suppressions WHERE tenant=? AND actor=? AND vault_id=? ORDER BY sequence',ctx.tenant,ctx.actor,vault.id);
  need(await first(`SELECT 1 AS valid WHERE ${ctx.fence} AND EXISTS(SELECT 1 FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE v.id=? AND v.tenant=? AND v.revision=? AND r.account_id=? AND r.rights=?)`,...ctx.fenceArgs,vault.id,ctx.tenant,vault.revision,ctx.actor,vault.rights),'health_source_changed',409);
  return {epoch:vault.epoch,generation:account.generation,rows:rows.map(row=>({...row,wrapped:JSON.parse(row.wrapped)}))};
 }
 await subjectVaultWriteAllowed(ctx,vault.id);
 uuid(input.object);uuid(input.record);
 need(!await subjectItemReplayKnown(ctx,vault.id,input.object),'item_erased',409);
 need(input.revision===vault.revision,'health_source_changed',409);
 need(['weak-password','breached-password','insecure-http','expiring-item','old-password','compromised-website','missing-mfa','reused-password'].includes(input.code),'invalid_suppression');
 need(input.until===null||Number.isSafeInteger(input.until)&&input.until>ctx.now,'invalid_suppression');
 const latest=await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?',vault.id,input.object);
 need(Number.isSafeInteger(input.version)&&input.version>0&&latest?.version===input.version,'finding_changed',409);
 const current="(SELECT MAX(version) FROM lky_versions WHERE vault_id=? AND object_id=?)=? AND NOT EXISTS(SELECT 1 FROM lky_lifecycle WHERE vault_id=? AND object_id=? AND state<>'active')";
 const currentArgs=[vault.id,input.object,input.version,vault.id,input.object];
 need(await first('SELECT 1 WHERE '+current,...currentArgs),'finding_changed',409);
 need(JSON.stringify(input.wrapped).length<=20000,'invalid_suppression');
 need(await verifyWrapped(input.wrapped,account.authority_key,ctx.actor,suppressionBinding(ctx.tenant,vault.id,input.record,account.generation)),'invalid_suppression');
 await guarded(ctx,[vault],[stmt('INSERT INTO lky_health_suppressions SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(MAX(sequence),0)+1,1 FROM lky_health_suppressions WHERE tenant=? AND actor=? AND vault_id=?',input.record,ctx.tenant,ctx.actor,vault.id,input.object,input.version,account.generation,vault.epoch,input.code,input.until,JSON.stringify(input.wrapped),ctx.now,vault.revision,ctx.tenant,ctx.actor,vault.id),event('health_suppressed',input.record)],[guard(current,currentArgs)]);
 return {record:input.record};
}
