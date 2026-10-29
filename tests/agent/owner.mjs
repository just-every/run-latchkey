import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {VaultClient} from '../../src/latchkey/client.mjs';
import {state, cookie} from './state.mjs';
export default async function initialize({request, origin, token, displayName, reviewers}) {
 const bootstrap = await request(origin+'/auth/bootstrap', {method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token,displayName})});
 assert.equal(bootstrap.status,303);
 const owner = new VaultClient(origin,{cookie:cookie(bootstrap),fetcher:request}), password=randomBytes(24).toString('base64url');
 const enrollment=await owner.register(password); await owner.unlock(enrollment.profile,password);
 state.owner=owner; state.vault=(await owner.createVault()).vault;
 state.item=(await owner.put(state.vault,{type:'login',title:'Synthetic access review',username:'synthetic-operator',password:randomBytes(24).toString('base64url')})).object;
 await reviewers.initialize('recipient',{cookie:owner.cookie});
 return new Response(null,{status:303,headers:{location:'/app', 'set-cookie':owner.cookie+'; Path=/; Secure; HttpOnly; SameSite=Lax'}});
}
