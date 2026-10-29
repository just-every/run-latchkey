import {keypair} from '../../src/latchkey/crypto/envelope.mjs';
import {AutomationClient} from '../../src/latchkey/automation/client.mjs';
import {state} from './state.mjs';
export default async function initialize({agentId}) {
 const signing=await keypair('sign');
 await new AutomationClient(state.owner).issueCredential({vault:state.vault,publicKey:signing.publicKey,scopes:['posture:read','access:request'],expiresAt:Date.now()+3600000,confirmed:true,agent:agentId});
}
