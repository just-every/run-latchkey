import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, stat, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { vaultFixture } from './browser/fixture.mjs';
import { VaultClient } from '../src/latchkey/client.mjs';
import { TypedItems, createItem } from '../src/latchkey/items/index.mjs';
import { LifecycleClient } from '../src/latchkey/lifecycle/client.mjs';
import { encode, random, id } from '../src/latchkey/crypto/envelope.mjs';
import { emptyCache, openCache, sealCache } from '../clients/shared/offline/cache.mjs';

const base32=value=>{
 let bits=0,buffer=0,result='';
 for(const byte of Buffer.from(value)){buffer=buffer<<8|byte;bits+=8;while(bits>=5){bits-=5;result+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[buffer>>>bits&31]}}
 if(bits)result+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[buffer<<5-bits&31];return result;
};
// Independent Node HMAC oracle; the product uses WebCrypto and base32 decoding.
function expectedCode(secret,time,{algorithm='sha1',digits=6,period=30}={}){
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/(period*1000))));
 const hmac=createHmac(algorithm,secret).update(counter).digest(),offset=hmac.at(-1)&15;
 return String((hmac.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
async function invite(f){
 const password='synthetic-latchkey-9600',email=['synthetic-latchkey-9601','example.test'].join('@');
 const response=await f.fetcher(f.origin+'/auth/invite',{method:'POST',headers:{origin:f.origin,cookie:f.owner.cookie,'content-type':['application','json'].join('/')},body:JSON.stringify({email,displayName:'Offline continuity member',role:'member'})});
 assert.equal(response.status,202);
 const link=f.mail.at(-1).content.find(row=>row.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0];
 const client=new VaultClient(f.origin,{fetcher:f.fetcher});await client.confirmIdentity(new URL(link).searchParams.get('token'));
 const enrolled=await client.register(password);await client.unlock(enrolled.profile,password);return {client,password};
}

export async function offlineTotpJourney(){
 const f=await vaultFixture({browserEnabled:false}),directory=await mkdtemp(join(tmpdir(),'latchkey-offline-'));
 const outputs=[],logs=[],cacheKey=encode(random()),firstSecret='synthetic-latchkey-9602',latestSecret='synthetic-latchkey-9603';
 const privateKeys=[f.owner.bundle.root.recipient.privateKey,f.owner.bundle.root.authority.privateKey,f.owner.bundle.signing.privateKey];
 let closed=false,sequence=0;
 const file=name=>join(directory,name+'.json');
 const store=async(path,value)=>writeFile(path,JSON.stringify(value),{mode:0o600});
 async function command(name,input,{offline=false,time=2000000000000,expected=0}={}){
  // A swallowed network failure cannot pass: attempted fetch exits the process.
  const guard=`Date.now=()=>${time};globalThis.fetch=()=>{process.stderr.write('offline_network_attempt');process.exit(90)};`;
  const args=[...(offline?['--import','data:text/javascript,'+encodeURIComponent(guard)]:[]),'scripts/latchkey.mjs',name];
  const child=spawn(process.execPath,args,{env:{...process.env,...(!offline&&!closed?{NODE_EXTRA_CA_CERTS:f.caFile}:{})},stdio:['pipe','pipe','pipe']});let out='',err='';
  child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.stdin.end(JSON.stringify(input));
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
  logs.push(out+err);assert.equal(code,expected,err);return {out,err,value:JSON.parse(expected?err:out)};
 }
 async function code(input,options={}){
  const output=file('output-'+sequence++);outputs.push(output);
  const response=await command('cache-totp',{...input,output},options);
  assert.equal((await stat(output)).mode&0o777,0o600);
  const result=JSON.parse(await readFile(output,'utf8'));
  assert.ok(!response.out.includes(result.code)&&!response.err.includes(result.code));
  return result;
 }
 async function refused(input,error){
  const output=file('refused-'+sequence++);
  const result=await command('cache-totp',{...input,output},{offline:true,expected:1});
  if(error)assert.equal(result.value.error,error);
  await assert.rejects(access(output),{code:'ENOENT'});
 }
 try{
  const vault=(await f.owner.createVault()).vault,items=new TypedItems(f.owner),lifecycle=new LifecycleClient(f.owner);
  const make=secret=>createItem('login',{title:'Offline continuity login',values:{password:'synthetic-latchkey-9604',totp:{secret:base32(secret),issuer:'synthetic-latchkey-9605',account:'synthetic-latchkey-9606'}}});
  const {object}=await items.save(vault,make(firstSecret));await items.save(vault,make(latestSecret),object);
  const archived=(await items.save(vault,make(firstSecret))).object,trashed=(await items.save(vault,make(firstSecret))).object;
  await lifecycle.change(vault,archived,'archived',{confirmed:true});await lifecycle.change(vault,trashed,'trash',{confirmed:true});
  const profile=file('owner'),cache=file('cache');await store(profile,f.owner.profile);
  const input={profile,cache,cacheKey,vault,object};
  await command('cache-refresh',{...input,password:f.password});
  const durable=await readFile(cache,'utf8'),identity=emptyCache(f.owner.profile,vault),opened=await openCache(JSON.parse(durable),cacheKey,identity);
  assert.equal(opened.eligibility.owner,f.owner.profile.account);
  assert.equal(opened.eligibility.items.find(row=>row.object===archived).state,'archived');
  // Real second owner device: revocation cannot recall the disconnected copy,
  // but its reconnect door must invalidate before the failed authentication.
  const pendingClient=new VaultClient(f.origin,{fetcher:f.fetcher}),pending=await pendingClient.beginEnrollment(f.owner.profile,f.password);
  await f.owner.approveEnrollment(pending.device,pending.fingerprint);
  const second=await pendingClient.completeEnrollment(pending.profile,f.password);
  const revokedInput={...input,profile:file('second'),cache:file('revoked')};await store(revokedInput.profile,second);
  await command('cache-refresh',{...revokedInput,password:f.password});
  await f.owner.call(['device','revoke'].join('/'),{device:second.device});
  assert.equal((await code(revokedInput,{offline:true})).code,expectedCode(latestSecret,2000000000000));
  await command('cache-refresh',{...revokedInput,password:f.password},{expected:1});
  await refused(revokedInput,'offline_cache_invalidated');
  assert.equal(JSON.parse(await readFile(revokedInput.cache,'utf8')).envelope,undefined);
  console.log('PROBE LKY-038 revoked reconnect: real device revoke then cache-refresh -> invalidated before refused authentication; cache-totp refused');

  const person=await invite(f),personalVault=(await person.client.createVault()).vault;
  const personalObject=(await new TypedItems(person.client).save(personalVault,make(firstSecret))).object;
  const erasedInput={profile:file('person'),cache:file('erased'),cacheKey,vault:personalVault,object:personalObject};await store(erasedInput.profile,person.client.profile);
  await command('cache-refresh',{...erasedInput,password:person.password});
  // An authorized read recipient is not eligible for this owner-only TOTP door.
  await f.owner.share(vault,person.client.profile.account,await person.client.identity().fingerprint,['read']);
  await person.client.pinAccount(f.owner.profile.account,await f.owner.identity().fingerprint);await store(erasedInput.profile,person.client.profile);
  const recipientInput={...input,profile:erasedInput.profile,cache:file('recipient')};
  await command('cache-refresh',{...recipientInput,password:person.password});
  await refused(recipientInput,'offline_owner_eligibility_required');
  const operator=(await f.db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(person.client.profile.account).first()).operator_id;
  const preview=await f.owner.call(['subject','erase-preview'].join('/'),{subject:operator});
  await f.owner.call(['subject','erase'].join('/'),{subject:operator,confirmed:true,planHash:preview.planHash});
  assert.equal((await code(erasedInput,{offline:true})).code,expectedCode(firstSecret,2000000000000));
  await command('cache-refresh',{...erasedInput,password:person.password},{expected:1});await refused(erasedInput,'offline_cache_invalidated');
  person.client.lock();pendingClient.lock();await f.owner.rotate(vault);
  console.log('PROBE LKY-038 erased reconnect: actual subject erasure then cache-refresh -> cache-totp refused; disconnected exposure remains explicit');

  const erasedItem=(await items.save(vault,make(firstSecret))).object,itemInput={...input,cache:file('item-erased'),object:erasedItem};
  await command('cache-refresh',{...itemInput,password:f.password});
  await f.owner.eraseItem(vault,erasedItem,{confirmed:true});await command('cache-refresh',{...itemInput,password:f.password});
  await refused(itemInput,'offline_eligibility_unverifiable');
  console.log('PROBE LKY-038 item erasure: eraseItem then authorized cache-refresh -> no erased seed or code restored');

  // Change actual stored items, rather than editing a decrypted cache fixture:
  // removing an OTP must not resurrect the previous version's still-valid seed.
  const removed=(await items.save(vault,make(firstSecret))).object;
  await items.save(vault,createItem('login',{title:'OTP removed',values:{password:'synthetic-latchkey-9607'}}),removed);
  const removedInput={...input,object:removed,cache:file('removed-otp')};
  await command('cache-refresh',{...removedInput,password:f.password});
  await refused(removedInput,'offline_totp_field_required');
  // Configured algorithm, width and period survive the real refresh and an
  // epoch rotation, and are exercised on both sides of a code boundary.
  const configured=[];
  for(const algorithm of ['SHA256','SHA512']){
   const item=make(latestSecret),parameters={algorithm,digits:8,period:60};
   Object.assign(item.fields.find(field=>field.id==='totp').value,parameters);
   configured.push({object:(await items.save(vault,item)).object,parameters});
  }
  await f.owner.rotate(vault);
  const configuredInput={...input,cache:file('configured')};
  await command('cache-refresh',{...configuredInput,password:f.password});
  const reconnectInput={...configuredInput,cache:file('unavailable')};
  await command('cache-refresh',{...reconnectInput,password:f.password});
  console.log('PROBE LKY-038 latest item: actual owner edit removes OTP, authorized refresh -> no fallback to the older seed');

  // Stop the source service completely; disconnected reads have a fatal network
  // tripwire and use only the actual private files produced by cache-refresh.
  await f.close();closed=true;
  for(const {object,parameters} of configured)for(const time of [2000036039999,2000036040000,2000259200000]){
   const result=await code({...configuredInput,object},{offline:true,time});
   assert.equal(result.code,expectedCode(latestSecret,time,{...parameters,algorithm:parameters.algorithm.toLowerCase()}));
   assert.equal(result.validFrom,Math.floor(time/60000)*60000);
   assert.equal(result.validUntil,result.validFrom+60000);
  }
  console.log('PROBE LKY-038 configured codes: rotated vault then stopped Worker, SHA256 and SHA512 with eight digits and sixty-second periods -> independent HMAC results across rollover and multi-day clocks');
  for(const time of[2000000000000,2000036000000,2000259200000,2001468800000]){
   const result=await code(input,{offline:true,time});
   assert.equal(result.code,expectedCode(latestSecret,time));assert.notEqual(result.code,expectedCode(firstSecret,time));
   assert.ok(result.validFrom<=time&&result.validUntil>time);assert.equal(result.expiresAt,null);
   assert.equal(result.connection,'disconnected');assert.equal(result.authority,'unverified while disconnected');assert.equal(result.lastSync,opened.eligibility.lastSync);
  }
  assert.equal(await readFile(cache,'utf8'),durable);
  console.log('PROBE LKY-038 continuity: stopped Worker, cache-totp at initial, ten-hour, three-day and seventeen-day clocks -> latest-version correct codes, no network, renewal or cache writes');
  const readOutput=file('read');await command('cache-read',{...input,output:readOutput},{offline:true});
  assert.equal(JSON.parse(await readFile(readOutput,'utf8')).versions.find(row=>row.object===object&&row.version===2).value.fields.find(row=>row.id==='totp').value.secret,base32(latestSecret));
  await refused({...input,cacheKey:encode(random())});
  for(const key of['account','device','tenant','origin']){
   const foreign=structuredClone(f.enrolled.profile);foreign[key]=key==='origin'?'https://foreign.example.test':id();
   const foreignProfile=file('foreign-'+key);await store(foreignProfile,foreign);await refused({...input,profile:foreignProfile},'offline_cache_mismatch');
  }
  await refused({...input,vault:id()},'offline_cache_mismatch');
  await refused({...input,object:archived},'offline_item_not_active');await refused({...input,object:trashed},'offline_item_not_active');
  console.log('PROBE LKY-038 eligibility: wrong key, foreign account, device, tenant, origin and vault, non-owner, archived and trashed items -> refused without output');

  const malformed=[
   value=>{delete value.eligibility},
   value=>{value.eligibility.owner=id()},
   value=>{value.eligibility.items.push(structuredClone(value.eligibility.items.find(row=>row.object===object)))},
   value=>{value.versions.push(structuredClone(value.versions.find(row=>row.object===object&&row.version===2)))},
   value=>{value.eligibility.revision++},
   value=>{value.eligibility.items.find(row=>row.object===object).version--},
   value=>{value.versions.find(row=>row.object===object&&row.version===2).value.fields=value.versions.find(row=>row.object===object&&row.version===2).value.fields.filter(row=>row.id!=='totp')},
  ];
  for(const mutate of malformed){
   const value=structuredClone(opened);mutate(value);const malformedCache=file('malformed-'+sequence++);
   await store(malformedCache,await sealCache(identity,value,cacheKey));await refused({...input,cache:malformedCache});
  }
  // Authenticated envelope transplantation cannot change its identity binding.
  const transplanted=file('transplanted'),foreignProfile=file('transplanted-profile'),foreign=structuredClone(f.enrolled.profile);foreign.device=id();await store(foreignProfile,foreign);
  await store(transplanted,{...JSON.parse(durable),device:foreign.device});await refused({...input,profile:foreignProfile,cache:transplanted},'offline_cache_mismatch');
  const existing=file('existing');await store(existing,{kept:true});await command('cache-totp',{...input,output:existing},{offline:true,expected:1});assert.deepEqual(JSON.parse(await readFile(existing,'utf8')),{kept:true});
  await command('cache-totp',input,{offline:true,expected:1});
  await command('cache-totp',{...input,output:cache},{offline:true,expected:1});assert.equal(await readFile(cache,'utf8'),durable);
  await writeFile(cache+'.lock','',{mode:0o600});await refused(input,'offline_cache_busy');await rm(cache+'.lock');
  const invalidated=file('invalidated');await store(invalidated,{...identity,state:'invalidated'});await refused({...input,cache:invalidated},'offline_cache_invalidated');
  console.log('PROBE LKY-038 refusal and custody: legacy, ambiguous, unverifiable and invalidated caches, busy cache and missing, existing or conflicting output -> refused without overwrites');
  // A real reconnect attempt during an outage must leave no old decrypted
  // read or code path, even though authentication cannot complete.
  await command('cache-refresh',{...reconnectInput,password:f.password},{expected:1});
  assert.equal(JSON.parse(await readFile(reconnectInput.cache,'utf8')).state,'invalidated');
  assert.equal(JSON.parse(await readFile(reconnectInput.cache,'utf8')).envelope,undefined);
  await refused(reconnectInput,'offline_cache_invalidated');
  const refusedRead=file('unavailable-read');
  const response=await command('cache-read',{...reconnectInput,output:refusedRead},{offline:true,expected:1});
  assert.equal(response.value.error,'offline_cache_invalidated');await assert.rejects(access(refusedRead),{code:'ENOENT'});
  console.log('PROBE LKY-038 unavailable reconnect: stopped Worker then cache-refresh -> durable invalidation; both cache-read and cache-totp refuse without an output');
  for(const value of[durable,...logs,...await Promise.all(outputs.map(path=>readFile(path,'utf8')))]){
   for(const secret of[firstSecret,latestSecret,base32(firstSecret),base32(latestSecret),cacheKey,f.password,...privateKeys])assert.ok(!value.includes(secret));
  }
  console.log('PROBE LKY-038 secret custody: encrypted cache, stdout, stderr and private code files inspected -> no seeds, cache key or master password; code files mode 0600');
 }finally{if(!closed)await f.close();await rm(directory,{recursive:true,force:true})}
}
if(process.argv[1]===import.meta.filename)await offlineTotpJourney();
