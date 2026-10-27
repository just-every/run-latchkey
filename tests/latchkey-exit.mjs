import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { LifecycleClient } from '../src/latchkey/lifecycle/client.mjs';
import { createPortability } from '@runeditrun/rer/modules/portability';
import archivePolicy from '../scripts/latchkey/archive-policy.mjs';
import {promises as files} from 'node:fs';
const {mkdtemp,writeFile,readFile,rm,stat,readdir,symlink}=files;
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
  let otherOwnedVault;
  const reader=new VaultClient(f.origin,{fetcher:f.fetcher});try{
   await reader.confirmIdentity(inviteToken);const enrolled=await reader.register('synthetic-latchkey-8026');await reader.unlock(enrolled.profile,'synthetic-latchkey-8026');
   await reader.pinAccount(owner.profile.account,await digest(JSON.stringify([owner.profile.recipientKey,owner.profile.authorityKey])));
   await owner.share(vault,reader.profile.account,await digest(JSON.stringify([reader.profile.recipientKey,reader.profile.authorityKey])),['read']);
   await assert.rejects(new SelectionExportClient(reader).preview([{vault,objects:[login]}]),error=>error.code==='permission_denied');
   await assert.rejects(new SelectionExportClient(reader).setPlaintextPolicy(vault,true,{confirmed:true}),error=>error.code==='review_owner_required');
   otherOwnedVault=(await reader.createVault()).vault;await reader.put(otherOwnedVault,{secret:'synthetic-latchkey-8030'});
   await reader.share(otherOwnedVault,owner.profile.account,await digest(JSON.stringify([owner.profile.recipientKey,owner.profile.authorityKey])),['read']);
  }finally{reader.lock()}
  const freshPreview=await selected.preview([{vault,objects:[login]}]);
  const expiredStatement={tenant:owner.profile.tenant,vault,owner:owner.profile.account,vaultRevision:freshPreview.plan.selection[0].revision,policyRevision:0,format:'encrypted',planHash:freshPreview.planHash,counts:freshPreview.plan.selection[0].counts,expiresAt:Date.now()-1};
  const expiredApproval={vault,statement:expiredStatement,signature:await sign(owner.bundle.root.authority.privateKey,selectionApprovalText(expiredStatement)),confirmed:true};
  await assert.rejects(owner.call(selectionRoutes.authorize,expiredApproval),error=>error.code==='export_approval_changed');
  await assert.rejects(owner.call(selectionRoutes.release,{approvals:[expiredApproval]}),error=>error.code==='export_approval_changed');
  const selectionArchive=await selected.export(freshPreview,exportKey,{confirmed:true,approvedPlanHash:freshPreview.planHash});
  await assert.rejects(selected.reimport(selectionArchive,exportKey,{confirmed:true,approvedPlanHash:freshPreview.planHash}),error=>error.code==='fresh_installation_required');
  const selectionOpened=await SelectionExportClient.open(selectionArchive,exportKey);assert.deepEqual(selectionOpened.vaults[0].versions,expected.filter(row=>row.object===login));
  await assert.rejects(SelectionExportClient.open(selectionArchive,encode(random())));
  const altered=structuredClone(preview);altered.plan.selection[0].objects=[];await assert.rejects(selected.export(altered,exportKey,{confirmed:true,approvedPlanHash:preview.planHash}));
  const familyVault=(await owner.createVault({kind:'family'})).vault;await owner.put(familyVault,{secret:'synthetic-latchkey-8027'});
  const fullPreview=await selected.preview('company'),fullArchive=await selected.export(fullPreview,exportKey,{confirmed:true,approvedPlanHash:fullPreview.planHash});
  assert.deepEqual(fullPreview.plan.omittedVaults,[familyVault,otherOwnedVault].sort().map(vault=>({vault,counts:'not inspected'})));
  assert.deepEqual(fullPreview.plan.coverage,{basis:'Vaults visible to the current account only',completeCompany:false,selectedCompanyVaults:1,visibleCompanyVaults:2,otherCompanyVaults:'unknown; not inspected'});
  assert.ok(!JSON.stringify(fullPreview).includes('synthetic-latchkey-8030'));assert.ok(!JSON.stringify(fullPreview).includes('synthetic-latchkey-8027'));
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
  // A real full archive is produced while the source plaintext policy is enabled.
  const records=await createPortability({db:f.db,policy:archivePolicy}),backup=await records.exports.create();
  let backupStatus;do{backupStatus=await records.exports.advance(backup,{maxParts:100})}while(backupStatus.phase!=='complete');
  const archiveLines=(await new Response(await records.exports.download(backup)).text()).trim().split('\n').map(line=>JSON.parse(line));
  assert.ok(!archiveLines[0].tables.some(row=>row.name==='lky_export_policies'));
  assert.ok(archiveLines[0].excludedTables.includes('lky_export_policies'));
  const restoredInstallation=await vaultFixture({browserEnabled:false,enrollOwner:false});try{
   const destinationRecords=await createPortability({db:restoredInstallation.db,policy:archivePolicy});
   const job=await destinationRecords.imports.create(archiveLines[0]);
   for(const part of archiveLines.slice(1,-1))await destinationRecords.imports.uploadPart(job,part.index,part);
   assert.equal((await destinationRecords.imports.finalize(job,{contentHash:archiveLines.at(-1).contentHash,archiveHash:archiveLines.at(-1).archiveHash})).phase,'complete');
   const recovered=new VaultClient(restoredInstallation.origin,{fetcher:restoredInstallation.fetcher});try{
    const enrolled=await recovered.recover({...f.enrolled.kit,origin:restoredInstallation.origin},f.password);await recovered.unlock(enrolled.profile,f.password);
    assert.deepEqual(await recovered.call(selectionRoutes.policy,{vault}),{revision:0,allowPlaintext:false});
    await assert.rejects(new SelectionExportClient(recovered).preview([{vault,objects:null}],{format:'plaintext'}),error=>error.code==='permission_denied');
    assert.deepEqual((await recovered.call('vaults',{})).filter(row=>row.owner===recovered.profile.account).map(row=>JSON.parse(row.rights)),[[],[]]);
   }finally{recovered.lock()}
  }finally{await restoredInstallation.close()}
  const plainPreview=await selected.preview([{vault,objects:[login]}],{format:'plaintext',review:{purpose:'synthetic-latchkey-8031',target:'synthetic-latchkey-8032'}});
  assert.deepEqual(plainPreview.plan.review,{purpose:'synthetic-latchkey-8031',target:'synthetic-latchkey-8032',consequences:'The buyer controls downloaded copies. Plaintext has no encryption and cannot be remotely recalled or expired.'});
  const changedReview=structuredClone(plainPreview);changedReview.plan.review.target='synthetic-latchkey-8033';
  await assert.rejects(selected.export(changedReview,null,{confirmed:true,approvedPlanHash:plainPreview.planHash,format:'plaintext'}),error=>error.code==='export_plan_changed');
  await assert.rejects(selected.export(plainPreview,null,{confirmed:true,approvedPlanHash:plainPreview.planHash}),error=>error.code==='export_format_changed');
  const plaintext=await selected.export(plainPreview,null,{confirmed:true,approvedPlanHash:plainPreview.planHash,format:'plaintext'});
  assert.deepEqual((await SelectionExportClient.open(plaintext)).vaults[0].versions,expected.filter(row=>row.object===login));
  const plainDestination=await vaultFixture({browserEnabled:false});try{const restored=await new SelectionExportClient(plainDestination.owner).reimport(plaintext,null,{confirmed:true,approvedPlanHash:plainPreview.planHash});assert.deepEqual((await plainDestination.owner.readVault(restored.restored[0].destination)).versions,expected.filter(row=>row.object===login));
   assert.deepEqual(await plainDestination.owner.call(selectionRoutes.policy,{vault:restored.restored[0].destination}),{revision:0,allowPlaintext:false});
   await assert.rejects(new SelectionExportClient(plainDestination.owner).preview([{vault:restored.restored[0].destination,objects:null}],{format:'plaintext'}),error=>error.code==='plaintext_export_policy_required');
  }finally{await plainDestination.close()}
  const forged={tenant:owner.profile.tenant,vault,owner:owner.profile.account,revision:2,allowPlaintext:false};
  await assert.rejects(owner.call(selectionRoutes.setPolicy,{vault,statement:forged,signature:'synthetic-latchkey-8024',confirmed:true}),error=>error.code==='export_policy_changed');
  await selected.setPlaintextPolicy(vault,false,{confirmed:true});
  await assert.rejects(selected.export(plainPreview,null,{confirmed:true,approvedPlanHash:plainPreview.planHash,format:'plaintext'}),error=>error.code==='plaintext_export_policy_required');
  const policy=await owner.call(selectionRoutes.policy,{vault});assert.equal(policy.allowPlaintext,false);
  // Race an earlier vault after its approval, through the real public mutation door.
  const raceVault=(await owner.createVault()).vault;await owner.put(raceVault,{secret:'synthetic-latchkey-8034'});
  const racePreview=await selected.preview([{vault,objects:[login]},{vault:raceVault,objects:null}]);
  const originalCall=owner.call.bind(owner);let raced=false;
  owner.call=async(name,input)=>{if(name===selectionRoutes.release&&!raced){raced=true;await owner.put(vault,createItem('secure-note',{title:'Synthetic export race',values:{note:'synthetic-latchkey-8035'}}));}return originalCall(name,input)};
  try{await assert.rejects(selected.export(racePreview,exportKey,{confirmed:true,approvedPlanHash:racePreview.planHash}),error=>error.code==='export_approval_changed');assert.equal(raced,true)}finally{owner.call=originalCall}
  await selected.setPlaintextPolicy(vault,true,{confirmed:true});
  const revokePreview=await selected.preview([{vault,objects:[login]}],{format:'plaintext'});let revoked=false;
  owner.call=async(name,input)=>{if(name===selectionRoutes.release&&!revoked){revoked=true;await selected.setPlaintextPolicy(vault,false,{confirmed:true});}return originalCall(name,input)};
  try{await assert.rejects(selected.export(revokePreview,null,{confirmed:true,approvedPlanHash:revokePreview.planHash,format:'plaintext'}),error=>error.code==='export_approval_changed');assert.equal(revoked,true)}finally{owner.call=originalCall}
  const audit=await owner.call(route('audit','list'),{filters:{action:'selection_release'},after:0,limit:200});
  const released=audit.entries.filter(row=>row.result==='succeeded'),refused=audit.entries.filter(row=>row.result==='refused');
  assert.ok(released.length>=3);assert.equal(refused.length,3);assert.deepEqual(refused.map(row=>row.reason),['export_approval_changed','export_approval_changed','export_approval_changed']);
  const plainRelease=released.find(row=>row.exports.some(item=>item.planHash===plainPreview.planHash));assert.ok(plainRelease);
  assert.deepEqual(plainRelease.exports,[{vault,planHash:plainPreview.planHash,policyRevision:1,sourceRevision:plainPreview.plan.selection[0].revision,format:'plaintext',expiresAt:plainRelease.exports[0].expiresAt,counts:{items:1,versions:2,attachments:0,attachmentBytes:0}}]);
  assert.equal(plainRelease.actor,owner.profile.account);assert.ok(plainRelease.exports[0].expiresAt>plainRelease.time);assert.ok(plainRelease.exports[0].expiresAt<=plainRelease.time+300000);
  assert.match(plainRelease.exportOutcome,/delivery is not verified/);
  const auditText=JSON.stringify(audit);for(const secret of ['synthetic-latchkey-8031','synthetic-latchkey-8032',values.login.password,attachment.name,exportKey])assert.ok(!auditText.includes(secret));

  const stalePreview=await selected.preview([{vault,objects:[login]}]);await owner.put(vault,createItem('secure-note',{title:'Synthetic revision fence',values:{note:'synthetic-latchkey-8023'}}));
  await assert.rejects(selected.export(stalePreview,exportKey,{confirmed:true,approvedPlanHash:stalePreview.planHash}),error=>error.code==='export_plan_changed');
  // Restore the expected exit comparison after the intentionally changed scope.
  const exitExpected=(await owner.readVault(vault)).versions;
  const cliDirectory=await mkdtemp(join(tmpdir(),'latchkey-selected-exit-'));try{
   const profile=join(cliDirectory,'profile.json'),plan=join(cliDirectory,'plan.json'),archive=join(cliDirectory,'selected.json'),output=join(cliDirectory,'opened.json');await writeFile(profile,JSON.stringify(owner.profile),{mode:0o600});
   const proposed=await command('selection-preview',{profile,password:f.password,selection:[{vault,objects:[login]}],output:plan},f.caFile);assert.equal(proposed.code,0,proposed.err);const planHash=JSON.parse(proposed.out).planHash;
   const denied=await command('selection-export',{profile,password:f.password,plan,exportKey,output:archive,approvedPlanHash:planHash,confirmed:false},f.caFile);assert.equal(denied.code,1);assert.equal(JSON.parse(denied.err).error,'exact_export_approval_required');await assert.rejects(stat(archive),{code:'ENOENT'});
   const exported=await command('selection-export',{profile,password:f.password,plan,exportKey,output:archive,approvedPlanHash:planHash,confirmed:true},f.caFile);assert.equal(exported.code,0,exported.err);assert.ok(!(await readFile(archive,'utf8')).includes(values.login.password));
   const opened=await command('selection-open',{archive,exportKey,output},f.caFile);assert.equal(opened.code,0,opened.err);assert.equal((await stat(archive)).mode&0o777,0o600);assert.equal((await stat(output)).mode&0o777,0o600);
   const repeated=await command('selection-open',{archive,exportKey,output},f.caFile);assert.equal(repeated.code,1);
   const linked=join(cliDirectory,'linked.json');await symlink(output,linked);assert.equal((await command('selection-open',{archive,exportKey,output:linked},f.caFile)).code,1);
   assert.deepEqual((await readdir(cliDirectory)).filter(name=>name.endsWith('.partial')),[]);
   await selected.setPlaintextPolicy(vault,true,{confirmed:true});
   const plainPlan=join(cliDirectory,'plain-plan.json'),plainFile=join(cliDirectory,'plain.json');
   const reviewedPlain=await command('selection-preview',{profile,password:f.password,selection:[{vault,objects:[login]}],format:'plaintext',review:{purpose:'synthetic-latchkey-8036',target:'synthetic-latchkey-8037'},output:plainPlan},f.caFile);assert.equal(reviewedPlain.code,0,reviewedPlain.err);
   const plainWritten=await command('selection-export',{profile,password:f.password,plan:plainPlan,format:'plaintext',output:plainFile,approvedPlanHash:JSON.parse(reviewedPlain.out).planHash,confirmed:true},f.caFile);assert.equal(plainWritten.code,0,plainWritten.err);assert.match(JSON.parse(plainWritten.out).warning,/Unencrypted plaintext/);
   assert.equal((await stat(plainFile)).mode&0o777,0o600);assert.deepEqual(JSON.parse(await readFile(plainFile,'utf8')).vaults[0].versions,expected.filter(row=>row.object===login));
   await selected.setPlaintextPolicy(vault,false,{confirmed:true});
   assert.deepEqual((await readdir(cliDirectory)).filter(name=>name.endsWith('.partial')),[]);assert.deepEqual(JSON.parse(await readFile(output,'utf8')).vaults[0].versions,expected.filter(row=>row.object===login));
  }finally{await rm(cliDirectory,{recursive:true,force:true})}
  const lifecycleVault=(await owner.createVault()).vault,lifecycle=new LifecycleClient(owner);
  const archivedItem=await owner.put(lifecycleVault,createItem('secure-note',{title:'Synthetic archived export',values:{note:'synthetic-latchkey-8038'}}));
  await owner.put(lifecycleVault,createItem('secure-note',{title:'Synthetic archived revision',values:{note:'synthetic-latchkey-8039'}}),archivedItem.object,1);
  await owner.put(lifecycleVault,createItem('secure-note',{title:'Synthetic third revision',values:{note:'synthetic-latchkey-8040'},attachments:[attachment]}),archivedItem.object,2);
  await lifecycle.change(lifecycleVault,archivedItem.object,'archived',{confirmed:true});
  const trashedItem=await owner.put(lifecycleVault,createItem('login',{title:'Synthetic trash export',values:{password:'synthetic-latchkey-8041'}}));
  await lifecycle.change(lifecycleVault,trashedItem.object,'trash',{confirmed:true});
  const privateVault=(await owner.createVault({kind:'private-work'})).vault;await owner.put(privateVault,createItem('secure-note',{title:'Synthetic private-work export',values:{note:'synthetic-latchkey-8043'}}));
  const sparsePreview=await selected.preview([{vault,objects:[login]},{vault:lifecycleVault,objects:null},{vault:privateVault,objects:null},{vault:familyVault,objects:null}]);
  const signedSelection=await SelectionExportClient.open(await selected.export(sparsePreview,exportKey,{confirmed:true,approvedPlanHash:sparsePreview.planHash}),exportKey);
  // Synthetic documented source format with a disclosed missing middle version.
  const sparse=structuredClone(signedSelection),source=sparse.vaults.find(row=>row.vault===lifecycleVault);
  source.versions=source.versions.filter(row=>row.object!==archivedItem.object||row.version!==2);
  source.counts.versions--;source.historyGaps=[{object:archivedItem.object,from:2,to:2}];
  const resign=async value=>{value.plan.format='plaintext';value.plan.selection=value.vaults.map(({versions,...row})=>row);value.plan.contentHash=await digest(canonicalJson(value.vaults));value.planHash=await digest(canonicalJson(['latchkey-selected-export-v1',value.plan]));value.signature=await sign(owner.bundle.root.authority.privateKey,canonicalJson(['latchkey-selected-export-v1',value.plan]));return value};
  await resign(sparse);
  const historyDestination=await vaultFixture({browserEnabled:false});try{
   const importer=new SelectionExportClient(historyDestination.owner),undisclosed=structuredClone(sparse);undisclosed.vaults.find(row=>row.vault===lifecycleVault).historyGaps=[];await resign(undisclosed);
   await assert.rejects(importer.reimport(undisclosed,null,{confirmed:true,approvedPlanHash:undisclosed.planHash}),error=>error.code==='export_history_gap');assert.deepEqual(await historyDestination.owner.call('vaults',{}),[]);
   const corrupted=structuredClone(sparse);corrupted.vaults.find(row=>row.vault===lifecycleVault).versions.find(row=>row.object===archivedItem.object&&row.version===3).value.attachments[0].digest=encode(random());await resign(corrupted);
   await assert.rejects(importer.reimport(corrupted,null,{confirmed:true,approvedPlanHash:corrupted.planHash}),error=>error.code==='attachment_integrity_failed');assert.deepEqual(await historyDestination.owner.call('vaults',{}),[]);
   const call=historyDestination.owner.call.bind(historyDestination.owner);let injected=false;
   historyDestination.owner.call=async(name,input)=>{if(name===selectionRoutes.import){injected=true;input=structuredClone(input);input.vaults.find(row=>row.lifecycle.length>0).lifecycle[0].retentionActive=true;}return call(name,input)};
   try{await assert.rejects(importer.reimport(sparse,null,{confirmed:true,approvedPlanHash:sparse.planHash}),error=>error.code==='invalid_export_lifecycle');assert.equal(injected,true);assert.deepEqual(await call('vaults',{}),[])}finally{historyDestination.owner.call=call}
   const invited=await historyDestination.fetcher(historyDestination.origin+'/auth/invite',{method:'POST',headers:{origin:historyDestination.origin,cookie:historyDestination.owner.cookie,'content-type':['application','json'].join('/')},body:JSON.stringify({email:'synthetic-latchkey-8044@example.test',displayName:'Synthetic destination member',role:'member'})});assert.equal(invited.status,202);
   const token=new URL(historyDestination.mail.at(-1).content.find(part=>part.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
   const destinationMember=new VaultClient(historyDestination.origin,{fetcher:historyDestination.fetcher});await destinationMember.confirmIdentity(token);const memberEnrollment=await destinationMember.register('synthetic-latchkey-8045');await destinationMember.unlock(memberEnrollment.profile,'synthetic-latchkey-8045');
   await assert.rejects(new SelectionExportClient(destinationMember).reimport(sparse,null,{confirmed:true,approvedPlanHash:sparse.planHash}),error=>error.code==='destination_owner_required');assert.deepEqual(await historyDestination.owner.call('vaults',{}),[]);
   const restored=await importer.reimport(sparse,null,{confirmed:true,approvedPlanHash:sparse.planHash});assert.equal(restored.restored.length,4);
   for(const source of sparse.vaults){const target=restored.restored.find(row=>row.source===source.vault);assert.deepEqual((await historyDestination.owner.readVault(target.destination)).versions,source.versions);assert.deepEqual((await historyDestination.owner.call(route('lifecycle','list'),{vault:target.destination})).items,source.lifecycle.map(row=>({...row,retentionActive:false})));assert.deepEqual(await historyDestination.owner.call(selectionRoutes.policy,{vault:target.destination}),{revision:0,allowPlaintext:false});}
   const history=restored.restored.find(row=>row.source===lifecycleVault);
   await historyDestination.schedule(Math.max(...source.lifecycle.map(row=>row.expiresAt??0))+86400000);
   assert.deepEqual((await historyDestination.owner.readItem(history.destination,trashedItem.object,true)).versions.map(row=>row.version),[1]);
   assert.deepEqual(await destinationMember.call('vaults',{}),[]);await assert.rejects(destinationMember.readVault(history.destination),error=>error.code==='not_found');destinationMember.lock();assert.deepEqual(history.historyGaps,[{object:archivedItem.object,from:2,to:2}]);
   assert.deepEqual((await historyDestination.owner.readItem(history.destination,archivedItem.object,true)).versions.map(row=>row.version),[1,3]);
   const repeatedPreview=await importer.preview([{vault:history.destination,objects:null}]);assert.deepEqual(repeatedPreview.plan.selection[0].historyGaps,[{object:archivedItem.object,from:2,to:2}]);
   const repeatedArchive=await importer.export(repeatedPreview,exportKey,{confirmed:true,approvedPlanHash:repeatedPreview.planHash});assert.deepEqual((await SelectionExportClient.open(repeatedArchive,exportKey)).vaults[0].versions,sparse.vaults.find(row=>row.vault===lifecycleVault).versions);
   const destinationVaults=await historyDestination.owner.call('vaults',{});assert.deepEqual(destinationVaults.map(row=>row.kind).sort(),['company','company','family','private-work']);
   for(const row of destinationVaults){assert.equal(row.owner,historyDestination.owner.profile.account);assert.deepEqual(JSON.parse(row.rights),['read','create','edit','export','share','rotate','delete','restore']);}
   await assert.rejects(historyDestination.owner.put(history.destination,{secret:'synthetic-latchkey-8042'},archivedItem.object,3),error=>error.code==='item_not_active');
  }finally{await historyDestination.close()}
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
