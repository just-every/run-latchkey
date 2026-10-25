import assert from 'node:assert/strict';
import { vaultFixture } from './browser/fixture.mjs';
import { VaultClient } from '../src/latchkey/client.mjs';
import { createItem,itemTypes } from '../src/latchkey/items/types.mjs';
import { totp } from '../src/latchkey/totp/index.mjs';
import { createAttachment,attachmentBytes } from '../src/latchkey/items/attachments.mjs';
import { bytes,digest,encode,random } from '../src/latchkey/crypto/envelope.mjs';
const route=(...parts)=>parts.join('/');
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
  const before=await owner.exportVault(vault,exportKey),beforePlan=await owner.call(route('exit','plan'),{});assert.equal(beforePlan.commercial.state,'active');
  await owner.call(route('msp','commercial'),{status:'cancelled',reference:'synthetic-latchkey-8021',confirmed:true});
  const plan=await owner.call(route('exit','plan'),{});assert.equal(plan.commercial.state,'cancelled');assert.equal(plan.withheldForCommercialStatus,false);assert.equal(plan.vaults.find(v=>v.vault===vault).canExport,true);assert.match(plan.commercial.basis,/Owner-recorded/);assert.match(plan.shutdown.consequences,/cannot serve connected clients/);assert.match(plan.shutdown.authority,/do not travel/);
  const after=await owner.exportVault(vault,exportKey);owner.lock();
  // Opening uses only the buyer's file and key. There is no fetch or vendor account.
  const openedBefore=await VaultClient.openExport(before,exportKey),openedAfter=await VaultClient.openExport(after,exportKey);
  assert.deepEqual(openedBefore.versions,expected);assert.deepEqual(openedAfter.versions,expected);assert.equal(openedAfter.activeAuthority,false);
  assert.equal(await digest(bytes(openedAfter.versions)),await digest(bytes(expected)));
  assert.equal(new Set(openedAfter.versions.map(v=>v.value.type)).size,Object.keys(itemTypes).length+1);assert.equal(openedAfter.versions.filter(v=>v.object===login).length,2);
  const exportedAttachment=openedAfter.versions.find(v=>v.value.type==='document').value.attachments[0];assert.deepEqual(await attachmentBytes(exportedAttachment),await attachmentBytes(attachment));
  assert.deepEqual(openedAfter.versions.find(v=>v.object===login).value.fields.find(v=>v.id==='totp').value,values.login.totp);
  assert.deepEqual(await totp(openedAfter.versions.find(v=>v.object===login).value.fields.find(v=>v.id==='totp').value,2000000000000),await totp(values.login.totp,2000000000000));
  console.log('PASS ownerRunExitJourney: cancellation retains all typed values, TOTP, history, attachment digests and offline buyer decryption; shutdown consequences are explicit');
 } finally {await f.close()}
}
await ownerRunExitJourney();
