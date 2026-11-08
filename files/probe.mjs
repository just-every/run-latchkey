import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const root=process.cwd();
const {vaultFixture}=await import(root+'/tests/browser/fixture.mjs');
const {runActiveSubjectErasureJourney}=await import(root+'/tests/latchkey-subject-erasure.mjs');
const before=process.argv.includes('--before');
const scale=process.argv.includes('--scale');
const f=await vaultFixture({browserEnabled:false});
const post=(route,value,cookie='')=>f.fetcher(f.origin+route,{method:'POST',headers:{origin:f.origin,'content-type':'application/json',cookie},body:JSON.stringify(value),redirect:'manual'});
let receipt;
try{
 try{
  const result=await runActiveSubjectErasureJourney({...f,post,writes:before?60:scale?500:200});
  assert.equal(before,false,'unfixed main must reproduce the failure');
  receipt={stage:scale?'scale':'after',result:'passed',...result};
 }catch(error){
  if(!before||error.status!==400)throw error;
  assert.equal(error.status,400);assert.equal(error.code,'request_refused');
  const rows=(await f.db.prepare("SELECT d.id FROM lky_audit_details d WHERE json_extract(d.facts,'$.actor') IN (SELECT id FROM lky_accounts WHERE operator_id IN (SELECT id FROM oa_operators WHERE email=?))").bind('synthetic-latchkey-997@example.test').all()).results;
  let d1Error;
  try{await f.db.prepare('SELECT * FROM lky_audit_details WHERE '+rows.map(()=>'(id=?)').join(' OR ')).bind(...rows.map(row=>row.id)).all();}catch(e){d1Error=e.message;}
  assert.match(d1Error,/Expression tree is too large/);
  receipt={stage:'before',result:'reproduced',writes:60,auditDetails:rows.length,previewStatus:error.status,previewCode:error.code,d1Error};
 }
 console.log(JSON.stringify(receipt,null,2));
 await writeFile(process.env.HOME+'/rer-consolidation/work/sx-latchkey-erasure-1/packet/'+(before?'before':scale?'scale':'after')+'-receipt.json',JSON.stringify(receipt,null,2)+'\n');
}finally{await f.close();}
