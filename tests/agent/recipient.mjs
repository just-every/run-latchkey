import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {VaultClient} from '../../src/latchkey/client.mjs';
import {state, cookie} from './state.mjs';
export default async function initialize({request,origin,email,owner,mail}) {
 const post=(path,body,session)=>request(origin+path,{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json',...(session?{Cookie:session}:{})},body:JSON.stringify(body)});
 const invited=await post('/auth/invite',{email,displayName:'Synthetic recipient',role:'member'},owner.cookie); assert.equal(invited.status,202);
 const messages=mail.read({limit:1});assert.equal(messages.length,1);
 const link=new URL(messages[0].text.match(/https:\/\/[^\s<>]+/)[0]);assert.equal(link.origin,origin);
 const admitted=await post('/auth/confirm',{token:link.searchParams.get('token')});assert.equal(admitted.status,303);
 const recipient=new VaultClient(origin,{cookie:cookie(admitted),fetcher:request}),password=randomBytes(24).toString('base64url');
 const enrollment=await recipient.register(password);await recipient.unlock(enrollment.profile,password);
 state.recipient=recipient;
 return new Response(null,{status:303,headers:{location:'/app','set-cookie':recipient.cookie+'; Path=/; Secure; HttpOnly; SameSite=Lax'}});
}
