import { digest, id } from '../crypto/envelope.mjs';
import { access, event, exact, need, uuid } from './common.mjs';
const day=time=>new Date(time).toISOString().slice(0,10);
const liveCapture=`c.active=1 AND v.owner=c.owner AND v.kind='company' AND v.epoch=c.epoch AND v.revision=c.revision AND EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id JOIN lky_devices d ON d.account_id=a.id WHERE a.id=c.owner AND a.tenant=c.tenant AND a.generation=c.generation AND o.version=c.operator_version AND o.status='active' AND o.role='owner' AND d.id=c.device AND d.generation=a.generation AND d.revoked_at IS NULL)`;
export async function captureList(ctx){
 return(await access(ctx).all(`SELECT c.*,CASE WHEN ${liveCapture} THEN 1 ELSE 0 END AS current FROM lky_msp_captures c JOIN lky_vaults v ON v.id=c.vault WHERE c.tenant=? ORDER BY c.vault`,ctx.tenant)).map(row=>({id:row.id,vault:row.vault,epoch:row.epoch,revision:row.revision,observedAt:row.observed_at,totalActiveItems:row.total_active_items,withExpiry:row.with_expiry,expiredCount:row.expired_count,active:!!row.current&&day(row.observed_at)===day(ctx.now)}));
}
export async function capturePosture(input,ctx){
 exact(input,['vault','epoch','revision','observedAt','totalActiveItems','withExpiry','expiredCount','confirmed']);uuid(input.vault);need(input.confirmed===true,'posture_capture_consent_required',403);
 for(const key of['epoch','revision','observedAt','totalActiveItems','withExpiry','expiredCount'])need(Number.isSafeInteger(input[key])&&input[key]>=(key==='epoch'||key==='revision'||key==='observedAt'?1:0),'invalid_posture_counts');
 need(Math.abs(input.observedAt-ctx.now)<=60000&&day(input.observedAt)===day(ctx.now),'posture_observation_expired',409);
 need(input.expiredCount<=input.withExpiry&&input.withExpiry<=input.totalActiveItems&&input.totalActiveItems<=100000,'invalid_posture_counts');
 const{first,stmt}=access(ctx),vault=await first("SELECT v.*,a.generation FROM lky_vaults v JOIN lky_accounts a ON a.id=v.owner WHERE v.id=? AND v.tenant=? AND v.owner=? AND v.kind='company'",input.vault,ctx.tenant,ctx.actor);need(vault,'owned_company_vault_required',403);
 need(vault.epoch===input.epoch&&vault.revision===input.revision,'posture_source_changed',409);
 const operation=id(),guard=`${ctx.fence} AND EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=? AND tenant=? AND epoch=? AND revision=? AND kind='company') AND (SELECT COUNT(DISTINCT x.object_id) FROM lky_versions x WHERE x.vault_id=? AND NOT EXISTS(SELECT 1 FROM lky_lifecycle l WHERE l.vault_id=x.vault_id AND l.object_id=x.object_id AND l.state<>'active'))>=?`,args=[...ctx.fenceArgs,vault.id,ctx.actor,ctx.tenant,input.epoch,input.revision,vault.id,input.totalActiveItems];
 const rows=await ctx.db.batch([stmt(`INSERT INTO lky_msp_captures SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,1 WHERE ${guard} ON CONFLICT(tenant,vault) DO UPDATE SET id=excluded.id,owner=excluded.owner,device=excluded.device,generation=excluded.generation,operator_version=excluded.operator_version,epoch=excluded.epoch,revision=excluded.revision,observed_at=excluded.observed_at,total_active_items=excluded.total_active_items,with_expiry=excluded.with_expiry,expired_count=excluded.expired_count,active=1`,operation,ctx.tenant,vault.id,ctx.actor,ctx.device,vault.generation,ctx.session.operator.version,input.epoch,input.revision,input.observedAt,input.totalActiveItems,input.withExpiry,input.expiredCount,...args),event(ctx,'msp_expiry_metadata_consented',operation,'EXISTS(SELECT 1 FROM lky_msp_captures WHERE id=?)',[operation])]);need(rows[0].meta.changes,'posture_source_changed',409);
 return(await captureList(ctx)).find(row=>row.id===operation);
}
export async function providerPosture(ctx,people){
 const{all}=access(ctx),captures=await captureList(ctx),current=captures.filter(row=>row.active),companyVaults=await all("SELECT id FROM lky_vaults WHERE tenant=? AND kind='company'",ctx.tenant);
 const risks=new Map();
 for(const capture of current){
  if(!capture.expiredCount)continue;
  const recipients=await all("SELECT a.operator_id FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id JOIN oa_operators o ON o.id=a.operator_id WHERE r.vault_id=? AND a.tenant=? AND o.status='active' AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read')",capture.vault,ctx.tenant);
  for(const row of recipients)risks.set(row.operator_id,(risks.get(row.operator_id)??0)+capture.expiredCount);
 }
 const windowStart=ctx.now-30*86400000,authenticated=await all("SELECT DISTINCT a.operator_id FROM lky_events e JOIN lky_accounts a ON a.id=e.actor JOIN oa_operators o ON o.id=a.operator_id WHERE a.tenant=? AND o.status='active' AND e.action='password_authenticated' AND e.created_at>=? AND e.created_at<=?",ctx.tenant,windowStart,ctx.now);
 return{
  health:{coverage:current.length?'current-observed-company-expiry':'unknown',reason:'Owner-client expiry counts cover only the listed current company captures and their current direct read recipients. Missing dates, uncaptured vaults, other risks and indirect access remain unknown. Counts are client-observed, not provider-verified.',capturedVaults:current.length,staleVaults:captures.length-current.length,uncapturedVaults:companyVaults.length-current.length,expiredItems:current.reduce((total,row)=>total+row.expiredCount,0),atRiskMembers:await Promise.all([...risks].map(async([operator,expiredItems])=>({reference:await digest(`${ctx.tenant}/member/${operator}`),expiredItems})))},
  adoption:{coverage:'observed-password-authentication',reason:'Current active operators with an observed successful vault password authentication in the previous 30 days. This is authentication activity, not fill/use, MFA or complete adoption.',activeMembers:people.filter(row=>row.status==='active').length,authenticatedMembers:authenticated.length,windowStart,observedAt:ctx.now},
 };
}
