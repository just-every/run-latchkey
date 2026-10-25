import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {promises as files} from 'node:fs';
const {mkdtemp,writeFile,readFile,rm}=files;
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { vaultFixture } from './browser/fixture.mjs';
import { selectionApprovalText,selectionRoutes } from '../src/latchkey/portability/selection-common.mjs';
import { SelectionExportClient } from '../src/latchkey/portability/selection.mjs';
import { VaultClient } from '../src/latchkey/client.mjs';
import { createItem,itemTypes } from '../src/latchkey/items/types.mjs';
import { totp } from '../src/latchkey/totp/index.mjs';
import { createAttachment,attachmentBytes } from '../src/latchkey/items/attachments.mjs';
import { bytes,digest,encode,random,sign } from '../src/latchkey/crypto/envelope.mjs';
const route=(...parts)=>parts.join('/');
const command=(name,input,caFile)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[process.cwd()+'/scripts/latchkey.mjs',name],{env:{...process.env,NODE_EXTRA_CA_CERTS:caFile},stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',part=>out+=part);child.stderr.on('data',part=>err+=part);child.once('error',reject);child.once('close',code=>resolve({code,out,err}));child.stdin.end(JSON.stringify(input))});
function syntheticTotpSecret(){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let buffer=0,bits=0,result='';for(const byte of new TextEncoder().encode('synthetic-latchkey-8002')){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(buffer>>>bits)&31]}buffer&=(1<<bits)-1}if(bits)result+=alphabet[(buffer<<(5-bits))&31];return result}

export async function ownerRunExitJourney() {
 const f=await vaultFixture({browserEnabled:false});
 try {
  const owner=f.owner,vault=(await owner.createVault()).vault,exportKey=encode(random()),values={
   login:{username:'synthetic-latchkey-8000@example.test',password:'synthetic-latchkey-8001',totp:{secret:syntheticTotpSecret(),issuer:'synthetic-latchkey-8003',account:'synthetic-latchkey-8000@example.test'}},
   'secure-note':{note:'synthetic-latchkey-8004'},card:{number:'synthetic-latchkey-8005'},identity:{name:'synthetic-latchkey-8006'},'bank-account':{accountNumber:'synthetic-latchkey-8007'},'ssh-key':{privateKey:'synthetic-latchkey-8008'},'api-credential':{token:'synthetic-latchkey-8009'},database:{password:'synthetic-latchkey-8010'},server:{password:'synthetic-latchkey-8011'},wifi:{password:'synthetic-latchkey-8012'},'software-license':{licenseKey:'synthetic-latchkey-8013'},certificate:{privateKey:'synthetic-latchkey-8014'},document:{description:'synthetic-latchkey-8015'}
  };
  const attachment=await createAttachment('synthetic-latchkey-8016.txt',new TextEncoder().encode('synthetic-latchkey-8017'),['text','plain'].join('/'));let login;
  for(const type of Object.keys(itemTypes)){
   const saved=await owner.put(vault,createItem(type,{title:'Synthetic '+type,values:values[type],attachments:type==='document'?[attachment]:[]}));if(type==='login')login=saved.object;
  }
  await owner.put(vault,createItem('custom',{title:'Synthetic custom record',definitions:[{id:'secret',label:'Secret',type:'secret',secret:true}],values:{secret:'synthetic-latchkey-8018'}}));
  await owner.put(vault,createItem('login',{title:'Synthetic login revised',values:{...values.login,password:'synthetic-latchkey-8019'}}),login,1);
  const expected=(await owner.readVault(vault)).versions;
  await owner.call(route('msp','commercial'),{status:'active',reference:'synthetic-latchkey-8020',confirmed:true});
  const selected=new SelectionExportClient(owner),preview=await selected.preview([{vault,objects:[login]}]);
  assert.equal(preview.plan.selection[0].counts.items,1);assert.equal(preview.plan.selection[0].counts.versions,2);assert.equal(preview.plan.selection[0].omittedObjects.length,Object.keys(itemTypes).length);
  await assert.rejects(selected.export(preview,exportKey,{confirmed:false,approvedPlanHash:preview.planHash}),error=>error.code==='exact_export_approval_required');
  await assert.rejects(selected.export(preview,exportKey,{confirmed:true,approvedPlanHash:'synthetic-latchkey-8022'}),error=>error.code==='exact_export_approval_required');
  await assert.rejects(selected.preview([{vault,objects:[login]}],{format:'plaintext'}),error=>error.code==='plaintext_export_policy_required');
  const invited=await f.fetcher(f.origin+'/auth/invite',{method:'POST',headers:{origin:f.origin,cookie:owner.cookie,'content-type':['application','json'].join('/')},body:JSON.stringify({email:'synthetic-latchkey-8025@example.test',displayName:'Synthetic export reader',role:'member'})});assert.equal(invited.status,202);
  const inviteToken=new URL(f.mail.at(-1).content.find(part=>part.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
  const reader=new VaultClient(f.origin,{fetcher:f.fetcher});try{
   await reader.confirmIdentity(inviteToken);const enrolled=await reader.register('synthetic-latchkey-8026');await reader.unlock(enrolled.profile,'synthetic-latchkey-8026');
   await reader.pinAccount(owner.profile.account,await digest(JSON.stringify([owner.profile.recipientKey,owner.profile.authorityKey])));
   await owner.share(vault,reader.profile.account,await digest(JSON.stringify([reader.profile.recipientKey,reader.profile.authorityKey])),['read']);
   await assert.rejects(new SelectionExportClient(reader).preview([{vault,objects:[login]}]),error=>error.code==='permission_denied');
   await assert.rejects(new SelectionExportClient(reader).setPlaintextPolicy(vault,true,{confirmed:true}),error=>error.code==='review_owner_required');
  }finally{reader.lock()}
  const freshPreview=await selected.preview([{vault,objects:[login]}]);
  const expiredStatement={tenant:owner.profile.tenant,vault,owner:owner.profile.account,vaultRevision:freshPreview.plan.selection[0].revision,policyRevision:0,format:'encrypted',planHash:freshPreview.planHash,expiresAt:Date.now()-1};
  await assert.rejects(owner.call(selectionRoutes.authorize,{vault,statement:expiredStatement,signature:await sign(owner.bundle.root.authority.privateKey,selectionApprovalText(expiredStatement)),confirmed:true}),error=>error.code==='export_approval_changed');
  const selectionArchive=await selected.export(freshPreview,exportKey,{confirmed:true,approvedPlanHash:freshPreview.planHash});
  await assert.rejects(selected.reimport(selectionArchive,exportKey,{confirmed:true,approvedPlanHash:freshPreview.planHash}),error=>error.code==='fresh_installation_required');
  const selectionOpened=await SelectionExportClient.open(selectionArchive,exportKey);assert.deepEqual(selectionOpened.vaults[0].versions,expected.filter(row=>row.object===login));
  await assert.rejects(SelectionExportClient.open(selectionArchive,encode(random())));
  const altered=structuredClone(preview);altered.plan.selection[0].objects=[];await assert.rejects(selected.export(altered,exportKey,{confirmed:true,approvedPlanHash:preview.planHash}));
  const familyVault=(await owner.createVault({kind:'family'})).vault;await owner.put(familyVault,{secret:'synthetic-latchkey-8027'});
  const fullPreview=await selected.preview('company'),fullArchive=await selected.export(fullPreview,exportKey,{confirmed:true,approvedPlanHash:fullPreview.planHash});
  assert.ok(fullPreview.plan.omittedVaults.some(row=>row.vault===familyVault));assert.ok(!JSON.stringify(fullPreview).includes('synthetic-latchkey-8027'));
  assert.equal(fullPreview.plan.selection[0].counts.items,Object.keys(itemTypes).length+1);assert.equal(fullPreview.plan.selection[0].counts.attachments,1);assert.equal(fullPreview.plan.activeAuthority,false);
  const destination=await vaultFixture({browserEnabled:false});try{
   await assert.rejects(new SelectionExportClient(destination.owner).preview([{vault,objects:null}]));
   const imported=await new SelectionExportClient(destination.owner).reimport(fullArchive,exportKey,{confirmed:true,approvedPlanHash:fullPreview.planHash});assert.equal(imported.complete,true);assert.equal(imported.restored.length,1);
   assert.deepEqual((await destination.owner.readVault(imported.restored[0].destination)).versions,expected);
   const rights=await destination.owner.call('vaults',{});assert.equal(rights.length,1);assert.equal(rights[0].owner,destination.owner.profile.account);assert.equal(rights[0].kind,'company');
   await assert.rejects(new SelectionExportClient(destination.owner).reimport(fullArchive,exportKey,{confirmed:true,approvedPlanHash:fullPreview.planHash}),error=>error.code==='empty_export_destination_required');
  }finally{await destination.close()}
  await assert.rejects(selected.setPlaintextPolicy(vault,true,{confirmed:false}),error=>error.code==='exact_export_approval_required');
  await selected.setPlaintextPolicy(vault,true,{confirmed:true});
  const plainPreview=await selected.preview([{vault,objects:[login]}],{format:'plaintext'});
  await assert.rejects(selected.export(plainPreview,null,{confirmed:true,approvedPlanHash:plainPreview.planHash}),error=>error.code==='export_format_changed');
  const plaintext=await selected.export(plainPreview,null,{confirmed:true,approvedPlanHash:plainPreview.planHash,format:'plaintext'});
  assert.deepEqual((await SelectionExportClient.open(plaintext)).vaults[0].versions,expected.filter(row=>row.object===login));
  const plainDestination=await vaultFixture({browserEnabled:false});try{const restored=await new SelectionExportClient(plainDestination.owner).reimport(plaintext,null,{confirmed:true,approvedPlanHash:plainPreview.planHash});assert.deepEqual((await plainDestination.owner.readVault(restored.restored[0].destination)).versions,expected.filter(row=>row.object===login))}finally{await plainDestination.close()}
  const forged={tenant:owner.profile.tenant,vault,owner:owner.profile.account,revision:2,allowPlaintext:false};
  await assert.rejects(owner.call(selectionRoutes.setPolicy,{vault,statement:forged,signature:'synthetic-latchkey-8024',confirmed:true}),error=>error.code==='export_policy_changed');
  await selected.setPlaintextPolicy(vault,false,{confirmed:true});
  await assert.rejects(selected.export(plainPreview,null,{confirmed:true,approvedPlanHash:plainPreview.planHash,format:'plaintext'}),error=>error.code==='plaintext_export_policy_required');
  const policy=await owner.call(selectionRoutes.policy,{vault});assert.equal(policy.allowPlaintext,false);
  const stalePreview=await selected.preview([{vault,objects:[login]}]);await owner.put(vault,createItem('secure-note',{title:'Synthetic revision fence',values:{note:'synthetic-latchkey-8023'}}));
  await assert.rejects(selected.export(stalePreview,exportKey,{confirmed:true,approvedPlanHash:stalePreview.planHash}),error=>error.code==='export_plan_changed');
  // Restore the expected exit comparison after the intentionally changed scope.
  const exitExpected=(await owner.readVault(vault)).versions;
  const cliDirectory=await mkdtemp(join(tmpdir(),'latchkey-selected-exit-'));try{
   const profile=join(cliDirectory,'profile.json'),plan=join(cliDirectory,'plan.json'),archive=join(cliDirectory,'selected.json'),output=join(cliDirectory,'opened.json');await writeFile(profile,JSON.stringify(owner.profile),{mode:0o600});
   const proposed=await command('selection-preview',{profile,password:f.password,selection:[{vault,objects:[login]}],output:plan},f.caFile);assert.equal(proposed.code,0,proposed.err);const planHash=JSON.parse(proposed.out).planHash;
   const denied=await command('selection-export',{profile,password:f.password,plan,exportKey,output:archive,approvedPlanHash:planHash,confirmed:false},f.caFile);assert.equal(denied.code,1);assert.equal(JSON.parse(denied.err).error,'exact_export_approval_required');
   const exported=await command('selection-export',{profile,password:f.password,plan,exportKey,output:archive,approvedPlanHash:planHash,confirmed:true},f.caFile);assert.equal(exported.code,0,exported.err);assert.ok(!(await readFile(archive,'utf8')).includes(values.login.password));
   const opened=await command('selection-open',{archive,exportKey,output},f.caFile);assert.equal(opened.code,0,opened.err);assert.deepEqual(JSON.parse(await readFile(output,'utf8')).vaults[0].versions,expected.filter(row=>row.object===login));
  }finally{await rm(cliDirectory,{recursive:true,force:true})}
  const before=await owner.exportVault(vault,exportKey),beforePlan=await owner.call(route('exit','plan'),{});assert.equal(beforePlan.commercial.state,'active');
  await owner.call(route('msp','commercial'),{status:'cancelled',reference:'synthetic-latchkey-8021',confirmed:true});
  const plan=await owner.call(route('exit','plan'),{});assert.equal(plan.commercial.state,'cancelled');assert.equal(plan.withheldForCommercialStatus,false);assert.equal(plan.vaults.find(v=>v.vault===vault).canExport,true);assert.match(plan.commercial.basis,/Owner-recorded/);assert.match(plan.shutdown.consequences,/cannot serve connected clients/);assert.match(plan.shutdown.authority,/do not travel/);
  const after=await owner.exportVault(vault,exportKey);owner.lock();
  // Opening uses only the buyer's file and key. There is no fetch or vendor account.
  const openedBefore=await VaultClient.openExport(before,exportKey),openedAfter=await VaultClient.openExport(after,exportKey);
  assert.deepEqual(openedBefore.versions,exitExpected);assert.deepEqual(openedAfter.versions,exitExpected);assert.equal(openedAfter.activeAuthority,false);
  assert.equal(await digest(bytes(openedAfter.versions)),await digest(bytes(exitExpected)));
  assert.equal(new Set(openedAfter.versions.map(v=>v.value.type)).size,Object.keys(itemTypes).length+1);assert.equal(openedAfter.versions.filter(v=>v.object===login).length,2);
  const exportedAttachment=openedAfter.versions.find(v=>v.value.type==='document').value.attachments[0];assert.deepEqual(await attachmentBytes(exportedAttachment),await attachmentBytes(attachment));
  assert.deepEqual(openedAfter.versions.find(v=>v.object===login).value.fields.find(v=>v.id==='totp').value,values.login.totp);
  assert.deepEqual(await totp(openedAfter.versions.find(v=>v.object===login).value.fields.find(v=>v.id==='totp').value,2000000000000),await totp(values.login.totp,2000000000000));
  console.log('PASS ownerRunExitJourney: cancellation retains all typed values, TOTP, history, attachment digests and offline buyer decryption; shutdown consequences are explicit');
 } finally {await f.close()}
}
await ownerRunExitJourney();
