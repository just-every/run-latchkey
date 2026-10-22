import {eraseRetainedItem} from '../erasure/index.mjs';
export async function expireTrash(db,now=Date.now(),env={}){
 const rows=(await db.prepare("SELECT l.*,v.tenant,v.owner,v.revision,v.epoch,a.authority_key FROM lky_lifecycle l JOIN lky_vaults v ON v.id=l.vault_id JOIN lky_accounts a ON a.id=v.owner WHERE l.state='trash' AND l.retention_active=1 AND l.expires_at<=? ORDER BY l.expires_at,l.vault_id,l.object_id LIMIT 100").bind(now).all()).results;
 const results=[];
 for(const row of rows){
  const fence="EXISTS(SELECT 1 FROM lky_lifecycle WHERE vault_id=? AND object_id=? AND state='trash' AND retention_active=1 AND nonce=? AND expires_at<=?)";
  const ctx={db,env,now,tenant:row.tenant,actor:row.owner,device:'retention-policy',fence,fenceArgs:[row.vault_id,row.object_id,row.nonce,now]};
  try{results.push(await eraseRetainedItem(row,ctx))}catch(error){if(error.code!=='erasure_conflict')throw error}
 }
 return results;
}
