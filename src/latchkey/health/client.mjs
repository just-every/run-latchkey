import {bytes,id,json,unwrapSigned} from '../crypto/envelope.mjs';
const suppressionBinding=(tenant,vault,record,generation)=>({tenant,vault,object:record,purpose:'health-suppression',epoch:generation,version:1});
import {OrganizationClient} from '../collections/client.mjs';
const value=(item,id)=>item.fields?.find(f=>f.id===id)?.value;
const hex=bytes=>[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
const digest=async text=>hex(await crypto.subtle.digest('SHA-1',new TextEncoder().encode(text)));
export async function passwordRange(password,{fetcher=fetch,signal,cache=new Map()}={}) {
 const hash=await digest(password),prefix=hash.slice(0,5);
 if(!cache.has(prefix))cache.set(prefix,(async()=>{const response=await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`,{headers:{'Add-Padding':'true'},credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:signal??AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('password_feed_unavailable');
 const body=await response.text();if(body.length>2000000)throw Error('invalid_password_feed');
 const suffixes=new Map(),lines=body.trim().split(/\r?\n/);if(!lines.length)throw Error('invalid_password_feed');
 for(const line of lines){const m=/^([A-F0-9]{35}):(\d+)$/.exec(line);if(!m||suffixes.has(m[1])||!Number.isSafeInteger(Number(m[2])))throw Error('invalid_password_feed');suffixes.set(m[1],Number(m[2]));}
 return suffixes;})());
 return (await cache.get(prefix)).get(hash.slice(5))??0;
}

async function websiteBreaches(fetcher) {
 const response=await fetcher('https://haveibeenpwned.com/api/v3/breaches',{credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('website_feed_unavailable');
 const text=await response.text();if(text.length>8000000)throw Error('invalid_website_feed');
 const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length>10000)throw Error('invalid_website_feed');
 for(const row of rows)if(typeof row.Name!=='string'||typeof row.Domain!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.BreachDate)||!Number.isFinite(Date.parse(row.BreachDate))||typeof row.IsVerified!=='boolean')throw Error('invalid_website_feed');
 return rows;
}
function hosts(item){return [...new Set([...(item.urls??[]).map(r=>r.url),...(item.fields??[]).filter(f=>f.type==='url').map(f=>f.value)].flatMap(v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?[u.hostname.toLowerCase().replace(/\.$/,'')]:[];}catch{return [];}}))];}
function expiryTime(item){const v=value(item,'expiry');if(item.type==='card'&&/^\d{4}-\d{2}$/.test(v??'')){const [y,m]=v.split('-').map(Number);return m>=1&&m<=12?Date.UTC(y,m,1):NaN;}return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?Date.parse(v):NaN;}
// Expiry is a read-time view of retained decisions, never a change to risk or history.
export function currentHealthReport(report,now) {
 const active=row=>Boolean(row?.active)&&(row.until===null||Number.isFinite(row.until)&&row.until>now);
 return {...report,history:report.history.map(row=>({...row,active:active(row)})),findings:report.findings.map(row=>({...row,suppression:active(row.suppression)?row.suppression:null}))};
}
export class HealthClient {
 constructor(client,{fetcher=fetch,now=()=>Date.now()}={}){this.client=client;this.fetcher=(url,init)=>fetcher(url,init);this.now=now;}
 async inspect(vault,{network=false,githubToken=''}={}) {
  const loaded=await new OrganizationClient(this.client).load(vault),history=await this.history(vault),now=this.now(),inactive=new Set(loaded.lifecycle.filter(r=>r.state!=='active').map(r=>r.object));
  // Shared vault ciphertext does not authenticate the actor named in its payload.
  // Preserve those earlier observations without making them personal authority.
  const legacyHistory=loaded.records.filter(r=>r.value.schema==='latchkey/health-suppression/v1'&&r.value.actor===this.client.profile.account).map(r=>({...r.value,record:r.object,active:false}));
  for(const entry of history)entry.active=entry.active&&loaded.records.some(row=>row.object===entry.object&&row.version===entry.version)&&!inactive.has(entry.object)&&(entry.until===null||entry.until>now);
  let github=null;
  if(githubToken){try{const response=await this.fetcher('https://api.github.com/user',{headers:{Authorization:`Bearer ${githubToken}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});if(response.ok){const data=await response.json();if(typeof data.login==='string'&&typeof data.two_factor_authentication==='boolean')github={login:data.login,mfa:data.two_factor_authentication};}}catch{}}
  const rangeCache=new Map();
  let breaches=null;try{if(network)breaches=await websiteBreaches(this.fetcher);}catch{}
  const rows=loaded.records.filter(r=>r.value.schema==='latchkey/item/v1'&&!inactive.has(r.object)),findings=[],unknown=[],passwords=new Map();
  const add=(row,code,source,extra={})=>{const existing=findings.find(f=>f.object===row.object&&f.code===code);if(existing){if(extra.breach)existing.breaches.push(extra);return;}const s=history.filter(r=>r.object===row.object&&r.version===row.version&&r.code===code).at(-1);findings.push({object:row.object,version:row.version,title:row.value.title,owner:loaded.vault.owner,code,source,observedAt:now,suppression:s&&s.active&&typeof s.reason==='string'&&s.reason.length<=500&&(s.until===null||Number.isFinite(s.until)&&s.until>now)?{...s}:null,...extra,...(extra.breach?{breaches:[extra]}:{})});};
  for(const row of rows){const item=row.value,p=value(item,'password');if(typeof p==='string'&&p){if(p.length<12||new Set(p).size<5)add(row,'weak-password','Local length and diversity check');const group=passwords.get(p)??[];group.push(row);passwords.set(p,group);if(network){try{if(await passwordRange(p,{fetcher:this.fetcher,cache:rangeCache}))add(row,'breached-password','HIBP Pwned Passwords padded range');}catch{unknown.push({object:row.object,coverage:'Password breach feed unavailable; status unknown'});}}else unknown.push({object:row.object,coverage:'Password breach feed not checked'});}
   if(item.fields?.some(f=>f.type==='url'&&typeof f.value==='string'&&f.value.startsWith('http:')))add(row,'insecure-http','Stored login URL');
   const expiry=expiryTime(item);if(['card','document'].includes(item.type)&&!Number.isFinite(expiry))unknown.push({object:row.object,coverage:'Item expiry unknown or unsupported format'});if(Number.isFinite(expiry)&&expiry<=now+30*86400000)add(row,'expiring-item','Stored expiry date',{expiry});
   if(item.type==='login'){
    const changed=value(item,'passwordChangedAt'),changeTime=typeof changed==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(changed)?Date.parse(changed):NaN;
    if(Number.isFinite(changeTime)&&changeTime<=now&&now-changeTime>365*86400000)add(row,'old-password','Owner-recorded password-change date; provider change unverified');
    if(!breaches)unknown.push({object:row.object,coverage:network?'Website breach feed unavailable; chronology unknown':'Website breach history not checked'});
    else if(!Number.isFinite(changeTime)||changeTime>now)unknown.push({object:row.object,coverage:'Password-change date unknown or in the future; chronology not inferred'});
    else for(const breach of breaches){const domain=breach.Domain.toLowerCase();if(!domain||!hosts(item).some(host=>host===domain||host.endsWith('.'+domain)))continue;
     if(!breach.IsVerified){unknown.push({object:row.object,coverage:'Website breach report unverified; chronology uncertain'});continue;}
     // Day-precision dates cannot establish ordering on the same day.
     if(Date.parse(breach.BreachDate)>changeTime&&Date.parse(breach.BreachDate)<=now)add(row,'compromised-website','HIBP verified website breach; owner-recorded password-change date',{breach:breach.Name,breachDate:breach.BreachDate,passwordChangedAt:changed,uncertainty:'Day precision; owner-recorded change is not provider verification'});
    }
   }
   if(item.type==='login'){const matched=github&&hosts(item).includes('github.com')&&String(value(item,'username')).toLowerCase()===github.login.toLowerCase();if(matched&&!github.mfa)add(row,'missing-mfa','GitHub authenticated user API; observed two-factor authentication disabled');if(!matched)unknown.push({object:row.object,coverage:'Site MFA capability and configuration unknown'});unknown.push({object:row.object,coverage:'Site passkey capability and configuration unknown'});}
   if(['ssh-key','api-credential'].includes(item.type))unknown.push({object:row.object,coverage:'Provider key practices and expiry unknown'});
  }
  for(const group of passwords.values())if(group.length>1)for(const row of group)add(row,'reused-password','Local comparison of permitted active items',{related:group.filter(r=>r.object!==row.object).map(r=>({object:r.object,title:r.value.title}))});
  // Authority is checked again after external feed work; stale results are never returned after revoke.
  await this.validate(vault,loaded.vault.revision);
  return currentHealthReport({findings,unknown,revision:loaded.vault.revision,observedAt:now,itemCount:rows.length,riskCount:findings.length,history,legacyHistory,coverage:'Only this permitted vault and active items; organization comparison not performed'},this.now());
 }
 async validate(vault,revision){const current=await this.client.call('lifecycle/list',{vault});if(current.vault.revision!==revision||!current.vault.rights.includes('read'))throw Error('health_source_changed');}
 async history(vault){
  const result=await this.client.call(['health','history'].join('/'),{vault}),profile=this.client.profile,rows=[];
  for(const row of result.rows){
   const value=json(await unwrapSigned(row.wrapped,this.client.bundle.root.recipient.privateKey,profile.authorityKey,profile.account,suppressionBinding(profile.tenant,vault,row.id,row.generation)));
   if(value.actor!==profile.account||value.object!==row.object_id||value.version!==row.item_version||value.until!==row.until_at||value.epoch!==row.epoch||value.sourceRevision!==row.source_revision)throw Error('invalid_suppression');
   rows.push({...value,record:row.id,active:row.active===1&&row.epoch===result.epoch&&row.generation===result.generation});
  }
  return rows;
 }
 async suppress(vault,finding,{reason,until=null}={}) {
  if(typeof reason!=='string'||!reason.trim()||reason.length>500||until!==null&&(!Number.isSafeInteger(until)||until<=this.now()))throw Error('invalid_suppression');
  const loaded=await new OrganizationClient(this.client).load(vault);
  if(!loaded.records.some(r=>r.object===finding.object&&r.version===finding.version&&r.value.schema==='latchkey/item/v1')||loaded.lifecycle.some(r=>r.object===finding.object&&r.state!=='active'))throw Error('finding_changed');
  const profile=this.client.profile,record=id(),payload={schema:'latchkey/health-suppression/v1',epoch:loaded.vault.epoch,sourceRevision:loaded.vault.revision,object:finding.object,version:finding.version,code:finding.code,reason:reason.trim(),until,actor:profile.account,observation:{source:finding.source,observedAt:finding.observedAt,code:finding.code,version:finding.version},recordedAt:this.now()};
  const wrapped=await this.client.wrap(bytes(payload),profile.recipientKey,suppressionBinding(profile.tenant,vault,record,profile.generation));
  return this.client.call(['health','suppress'].join('/'),{vault,revision:loaded.vault.revision,object:finding.object,version:finding.version,record,until,wrapped});
 }
}
