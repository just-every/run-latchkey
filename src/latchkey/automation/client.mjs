import { SharingClient } from '../sharing/client.mjs';
import { id,sign,signingText,digest } from '../crypto/envelope.mjs';
import { AutomationError } from './common.mjs';

export class AutomationClient {
 constructor(client){this.client=client;}
 requests(){return this.client.call('mcp/requests',{});}
 preview(request){return this.client.call('mcp/ownerpreview',{request});}
 decide(preview,decision,confirmed){return this.client.call('mcp/ownerapprove',{request:preview.id,revision:preview.revision,previewHash:preview.previewHash,decision,confirmed});}
 async fulfill(preview){
  if(preview.phase!=='approved')throw new AutomationError('human_approval_required',403);
  const client=this.client;
  // This is a real transport adapter for SharingClient's ordinary cryptographic
  // grant path, not a synthetic grant or a substitute for its key wrapping.
  const transport=Object.create(client);
  transport.call=(route,input)=>route==='sharing/grant'?client.call('mcp/fulfill',{request:preview.id,revision:preview.revision,shareInput:input}):client.call(route,input);
  return new SharingClient(transport).grant(preview.vault,{recipients:[{account:preview.account,fingerprint:preview.fingerprint}],objects:preview.objects.map(row=>row.object),rights:preview.rights,expiresAt:preview.expiresAt,startsAt:null,group:null,approvalRequired:false});
 }
 issueCredential(value){return this.client.call('mcp/credential/issue',value);}
 revokeCredential(credential){return this.client.call('mcp/credential/revoke',{credential});}
 webhooks(){return this.client.call('webhook/list',{});}
 subscribe(value){return this.client.call('webhook/subscribe',value);}
 webhookStatus(subscription){return this.client.call('webhook/status',{subscription});}
 rotateWebhook(subscription,revision,secret,confirmed){return this.client.call('webhook/rotate',{subscription,revision,secret,confirmed});}
 revokeWebhook(subscription,revision){return this.client.call('webhook/revoke',{subscription,revision});}
 enqueue(subscription,revision,event,confirmed){return this.client.call('webhook/enqueue',{subscription,revision,event,confirmed});}
 dispatch(subscription,revision,delivery,confirmed){return this.client.call('webhook/dispatch',{subscription,revision,delivery,confirmed});}
}

export async function mcpRequest({origin,route='mcp',input,token,privateKey,fetcher=fetch}){
 const url=new URL(origin);
 if(url.origin!==origin||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))||!['mcp','mcp/posture','mcp/requestaccess'].includes(route))throw new AutomationError('invalid_mcp_origin');
 const path='/api/latchkey/'+route,body=JSON.stringify(input),nonce=id(),time=String(Date.now());
 const response=await fetcher(origin+path,{method:'POST',redirect:'error',credentials:'omit',headers:{origin,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25',authorization:'Bearer '+token,'x-latchkey-nonce':nonce,'x-latchkey-time':time,'x-latchkey-signature':await sign(privateKey,signingText('POST',path,token,nonce,time,await digest(body)))},body});
 let value;try{value=await response.json();}catch{throw new AutomationError('mcp_unavailable',response.status);}
 if(value?.jsonrpc==='2.0' && value.error && response.status===400)return value;
 if(!response.ok && value?.error?.code===-32001)throw new AutomationError('unauthenticated',response.status);
 if(!response.ok)throw new AutomationError(typeof (value.code??value.error)==='string'&&/^[a-z_]{1,64}$/.test(value.code??value.error)?(value.code??value.error):'mcp_refused',response.status);
 return value;
}
export class McpClient {
 constructor(options){this.options=options;}
 request(method,params={}){return mcpRequest({...this.options,input:{jsonrpc:'2.0',id:id(),method,params}});}
 initialize(){return this.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'latchkey-client',version:'1.0.0'}});}
 tools(){return this.request('tools/list');}
 posture(vault){return this.request('tools/call',{name:'latchkey.posture.read',arguments:{vault}});}
 requestAccess(value){return this.request('tools/call',{name:'latchkey.access.request',arguments:{...value,idempotency_key:id()}});}
}
