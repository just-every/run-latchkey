import { access, exact, guarded, id, need, uuid } from '../lifecycle/common.mjs';
import { requirePeople } from './permissions.mjs';
const effect='Suspends connected authority, revokes sponsored grants and creates owned exposure obligations. No provider change or cryptographic hand-back is inferred.';
export async function offboardingAuthenticated(route,input,ctx){
 if(!['people' + '/member','people' + '/offboard','people' + '/offboarding'].includes(route))return null;
 await requirePeople(ctx,'people.read');
 if(route==='people' + '/offboard')await requirePeople(ctx,'people.offboard');
 const {first,all,stmt,event,guard}=access(ctx);
 if(route==='people' + '/offboarding'){
  exact(input,['operation']);const row=await first('SELECT * FROM lky_people_offboarding WHERE id=? AND tenant=?',uuid(input.operation),ctx.tenant);need(row,'not_found',404);
  return {...row,exposures:await all('SELECT * FROM lky_people_exposures WHERE operation=? ORDER BY vault,item',row.id),effect};
 }
 exact(input,route==='people' + '/member'?['operator']:['operator','custodian','confirmed']);
 const operator=uuid(input.operator),person=await first('SELECT o.id,o.role,o.status,o.version,a.id AS account FROM oa_operators o LEFT JOIN lky_accounts a ON a.operator_id=o.id AND a.tenant=? WHERE o.id=?',ctx.tenant,operator);need(person,'not_found',404);
 const sources=await all('SELECT DISTINCT issuer FROM oa_external_identities WHERE operator_id=? ORDER BY issuer',operator);
 if(route==='people' + '/member')return {operator,account:person.account,status:person.status,authoritativeSource:sources.length?null:['manual'],linkedIdentitySources:sources.map(row=>row.issuer),authorityStatus:sources.length?'lifecycle-authority-unverified':'manual',requiresReconciliation:sources.length>0,effect};
 need(input.confirmed===true,'offboarding_confirmation_required',403);
 need(!sources.length,'directory_reconciliation_required',409);
 need(person.account&&person.role==='member'&&operator!==ctx.session.operator.id,'offboarding_member_required',403);
 const custodian=uuid(input.custodian),custody=await first("SELECT a.id FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.role='owner' AND o.status='active'",custodian,ctx.tenant);need(custody&&custodian!==person.account,'active_owner_custodian_required',403);
 const existing=await first('SELECT id,custodian FROM lky_people_offboarding WHERE tenant=? AND account=?',ctx.tenant,person.account);if(existing){need(existing.custodian===custodian,'offboarding_custodian_changed',409);return offboardingAuthenticated('people' + '/offboarding',{operation:existing.id},ctx)}
 const operation=id(),exposures=new Map();
 const current=await all(`SELECT DISTINCT v.id AS vault,i.object_id AS item,v.owner FROM lky_vaults v JOIN lky_versions i ON i.vault_id=v.id WHERE v.tenant=? AND v.kind<>'family' AND (v.owner=? OR EXISTS(SELECT 1 FROM lky_recipients r WHERE r.vault_id=v.id AND r.account_id=?) OR EXISTS(SELECT 1 FROM lky_shares s JOIN lky_share_keys k ON k.share_id=s.id WHERE s.vault_id=v.id AND k.account_id=?))`,ctx.tenant,person.account,person.account,person.account);
 for(const row of current)exposures.set(row.vault+':'+row.item,{vault:row.vault,item:row.item,evidence:['current grant; includes unused local fill and unreachable cached copies']});
 const historical=await all(`SELECT d.facts FROM lky_audit_details d JOIN lky_audit_chain c ON c.id=d.id WHERE c.tenant=? AND json_extract(d.facts,'$.actor')=? AND json_extract(d.facts,'$.result')='succeeded' AND json_extract(d.facts,'$.time')>=?`,ctx.tenant,person.account,ctx.now-90*86400000);
 for(const row of historical){const fact=JSON.parse(row.facts);if(!fact.vault||!fact.item)continue;const vault=await first("SELECT id FROM lky_vaults WHERE id=? AND tenant=? AND kind<>'family'",fact.vault,ctx.tenant);if(!vault)continue;const key=fact.vault+':'+fact.item,entry=exposures.get(key)??{vault:fact.vault,item:fact.item,evidence:[]};entry.evidence.push('retained connected observation: '+fact.action);exposures.set(key,entry)}
 const owned=await first("SELECT COUNT(*) AS count FROM lky_vaults v JOIN lky_versions i ON i.vault_id=v.id WHERE v.tenant=? AND v.owner=? AND v.kind<>'family'",ctx.tenant,person.account);
 const statements=[
  stmt('INSERT INTO lky_people_offboarding VALUES(?,?,?,?,?,?,?,?,?)',operation,ctx.tenant,person.account,operator,custodian,ctx.now,'suspended',owned.count>0?'blocked-missing-enrolled-custody':'no-owned-company-items','Historical coverage starts with retained connected audit. Removed legacy grants and disconnected use remain unknown.'),
  stmt("UPDATE oa_operators SET status='inactive' WHERE id=?",operator),
  stmt('DELETE FROM lky_grants WHERE account_id=?',person.account),
  stmt('UPDATE lky_machines SET revoked_at=COALESCE(revoked_at,?) WHERE account_id=?',ctx.now,person.account),
  stmt('UPDATE lky_runtime_grants SET revoked_at=COALESCE(revoked_at,?) WHERE account_id=?',ctx.now,person.account),
  stmt('UPDATE lky_mcp_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE owner=?',ctx.now,person.account),
  stmt('UPDATE lky_shares SET revoked_at=COALESCE(revoked_at,?) WHERE source_account=?',ctx.now,person.account),
  stmt('UPDATE lky_links SET revoked_at=COALESCE(revoked_at,?) WHERE source_account=?',ctx.now,person.account),
  stmt("DELETE FROM lky_recipients WHERE account_id=? AND vault_id IN(SELECT id FROM lky_vaults WHERE tenant=? AND kind<>'family')",person.account,ctx.tenant),
  stmt("DELETE FROM lky_share_keys WHERE account_id=? AND share_id IN(SELECT s.id FROM lky_shares s JOIN lky_vaults v ON v.id=s.vault_id WHERE v.tenant=? AND v.kind<>'family')",person.account,ctx.tenant),
  stmt('DELETE FROM lky_admin_permissions WHERE tenant=? AND account=?',ctx.tenant,person.account),
  ...[...exposures.values()].map(row=>stmt('INSERT INTO lky_people_exposures VALUES(?,?,?,?,?,?,?)',operation,row.vault,row.item,JSON.stringify([...new Set(row.evidence)]),custodian,'critical','pending-human-approval')),
  event('manual_offboarding_suspended',operation)
 ];
 await guarded(ctx,[],statements,[guard("EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.role='owner' AND o.status='active') OR (EXISTS(SELECT 1 FROM lky_admin_permissions WHERE tenant=? AND account=? AND permission='people.read') AND EXISTS(SELECT 1 FROM lky_admin_permissions WHERE tenant=? AND account=? AND permission='people.offboard'))",[ctx.session.operator.id,ctx.tenant,ctx.actor,ctx.tenant,ctx.actor]),guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='member')",[operator,person.version]),guard('NOT EXISTS(SELECT 1 FROM oa_external_identities WHERE operator_id=?)',[operator]),guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active' AND o.role='owner')",[custodian,ctx.tenant])]);
 return offboardingAuthenticated('people' + '/offboarding',{operation},ctx);
}
