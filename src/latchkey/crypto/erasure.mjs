import { validDeletionConsent } from './lifecycle.mjs';
import { verify } from './envelope.mjs';
const fields=['schema','purpose','tenant','vault','object','owner','revision'];
export function erasureText(statement) {
 if(!statement||Object.keys(statement).sort().join()!==[...fields].sort().join()||statement.schema!==1||statement.purpose!=='item-erasure'||!Number.isSafeInteger(statement.revision)||statement.revision<1)throw Error('invalid_erasure_proof');
 for(const field of ['tenant','vault','object','owner'])if(typeof statement[field]!=='string'||!/^[0-9a-f-]{36}$/.test(statement[field]))throw Error('invalid_erasure_proof');
 return JSON.stringify(fields.map(field=>statement[field]));
}
export async function validErasureProof(proof,expected,authorityKey) {
 if(proof?.statement?.purpose==='trash-item')return validDeletionConsent(proof,expected,authorityKey);
 try {
  const s=proof.statement,text=erasureText(s);
  return typeof proof.signature==='string'&&Object.keys(proof).sort().join()==='signature,statement'
   &&Object.entries(expected).every(([key,value])=>s[key]===value)&&await verify(authorityKey,proof.signature,text);
 }catch{return false}
}
