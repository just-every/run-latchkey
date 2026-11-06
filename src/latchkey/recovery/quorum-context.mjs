import { digest } from '../crypto/envelope.mjs';
export const quorumRoute=action=>['recovery','quorum-'+action].join('/');
// Every encrypted share commits to the complete immutable ceremony transcript.
export const quorumBinding=async(statement,purpose,custodian=null)=>({tenant:statement.tenant,vault:'account',object:await digest(JSON.stringify([statement,custodian])),purpose,epoch:statement.generation,version:1});
export const enrollmentStatement=(enrollment,policy)=>({schema:1,enrollment,account:policy.account,tenant:policy.tenant,generation:policy.generation,revision:policy.revision,policy:policy.change_id,custodians:JSON.parse(policy.custodians)});
export const caseStatement=(enrolled,operation,transferKey,expiresAt)=>({...enrolled,operation,transferKey,expiresAt});
