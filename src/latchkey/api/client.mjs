import { digest,id,sign,signingText } from '../crypto/envelope.mjs';
import { ApiError,resolveApi } from './catalogue.mjs';
import { pageResult } from './pagination.mjs';

// CLI primitive: reuse the unlocked client's existing signed canonical door.
export async function invokeApi(client,method,path,input={}){
 const resolved=resolveApi(method,path,input),value=await client.call(resolved.route,resolved.input);
 return pageResult(value,resolved.pagination,JSON.stringify([resolved.route,resolved.input]));
}

// REST primitive: sign the actual wire method, full path/query and raw bytes.
export async function requestApi(client,method,path,input={}, {ifMatch}={}){
 if(!client.profile||!client.bundle||!client.token)throw new ApiError('locked',401);
 resolveApi(method,path,input);
 const url=new URL(path.startsWith('/api/latchkey/v1/')?path:'/api/latchkey/v1'+path,client.origin);
 if(url.origin!==client.origin)throw new ApiError('invalid_origin',403);
 const wirePath=url.pathname+url.search,body=method==='GET'?'':JSON.stringify(input),nonce=id(),time=String(Date.now());
 const headers={origin:client.origin,'content-type':'application/json',...(client.cookie?{cookie:client.cookie}:{}),'x-latchkey-grant':client.token,'x-latchkey-nonce':nonce,'x-latchkey-time':time,'x-latchkey-signature':await sign(client.bundle.signing.privateKey,signingText(method,wirePath,client.token,nonce,time,await digest(body))),...(ifMatch===undefined?{}:{'if-match':`"${ifMatch}"`})};
 const response=await client.fetcher(url.href,{method,headers,redirect:'error',...(body?{body}:{})});
 let value;try{value=await response.json();}catch{throw new ApiError('service_unavailable',response.status);}
 if(!response.ok)throw new ApiError(typeof value.error==='string'&&/^[a-z_]{1,64}$/.test(value.error)?value.error:'request_refused',response.status);
 return value;
}

const query=value=>{const params=new URLSearchParams();if(value?.limit!==undefined)params.set('limit',String(value.limit));if(value?.cursor)params.set('cursor',value.cursor);return params.size?'?'+params:'';};
const identifier=value=>{if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))throw new ApiError('invalid_identifier');return value;};
export class ApiClient {
 constructor(client){this.client=client;}
 request(method,path,input={},options={}){return requestApi(this.client,method,path,input,options);}
 users(page){return this.request('GET','/users'+query(page));}
 user(account){return this.request('GET','/users/'+identifier(account));}
 inviteUser(input){return this.request('POST','/users',input);}
 setUserRole(operator,role){return this.request('PUT',`/users/${identifier(operator)}/role`,{role});}
 setUserStatus(operator,status){return this.request('PUT',`/users/${identifier(operator)}/status`,{status});}
 cancelInvitation(operator){return this.request('DELETE',`/users/${identifier(operator)}/invitation`,{});}
 groups(page){return this.request('GET','/groups'+query(page));}
 createGroup(group){return this.request('POST','/groups',{group});}
 groupMembers(group){return this.request('GET','/groups/'+identifier(group)+'/members');}
 setGroup(group,accounts){return this.request('PUT','/groups/'+identifier(group)+'/members',{accounts});}
 vaults(page){return this.request('GET','/vaults'+query(page));}
 vault(vault){return this.request('GET','/vaults/'+identifier(vault));}
 createVault(encryptedInput){return this.request('POST','/vaults',encryptedInput);}
 encryptedItems(vault,page){return this.request('GET','/vaults/'+identifier(vault)+'/items'+query(page));}
 encryptedItem(vault,object){return this.request('GET',`/vaults/${identifier(vault)}/items/${identifier(object)}`);}
 putEncryptedItem(vault,object,input,options){return this.request('PUT',`/vaults/${identifier(vault)}/items/${identifier(object)}`,input,options);}
 policies(){return this.request('GET','/policies');}
 setSharingPolicy(input){return this.request('PUT','/policies/sharing',input);}
 setGeneratorPolicy(input){return this.request('PUT','/policies/generator',input);}
 projects(page){return this.request('GET','/projects'+query(page));}
 project(project){return this.request('GET','/projects/'+identifier(project));}
 createProject(input){return this.request('POST','/projects',input);}
 environments(project,page){return this.request('GET',`/projects/${identifier(project)}/environments`+query(page));}
 createEnvironment(project,input){return this.request('POST',`/projects/${identifier(project)}/environments`,input);}
 events(page){return this.request('GET','/events'+query(page));}
 reviews(page){return this.request('GET','/reviews'+query(page));}
 review(review){return this.request('GET','/reviews/'+identifier(review));}
 createReview(input){return this.request('POST','/reviews',input);}
 prepareImport(input){return this.request('POST','/imports/preparations',input);}
 activateImport(restore,input){return this.request('POST',`/imports/${identifier(restore)}/activation`,input);}
 operation(restore){return this.request('GET','/operations/'+identifier(restore));}
}

export const commands={
 'custody.enroll':['POST','/people/custody/enroll'],
 'custody.accept':['POST','/people/custody/accept'],
 'custody.pending':['POST','/people/custody/pending'],
 'custody.preview':['POST','/people/custody/preview'],
 'custody.commit':['POST','/people/custody/commit'],
 'custody.revoke':['POST','/people/custody/revoke'],

 'activity.query':['POST','/activity/query'],'activity.csv':['POST','/activity/csv'],'activity.checkpoint':['GET','/activity/checkpoint'],'activity.verify':['POST','/activity/verify'],'activity.retention':['GET','/activity/retention'],'activity.expire':['POST','/activity/expiry'],
 'admin.permissions':['GET','/admin/permissions'],'admin.set-permissions':['PUT','/admin/permissions'],
 'people.preview':['POST','/people/preview'],'people.invite':['POST','/people/invitations'],'people.member':['POST','/people/member'],'people.offboard':['POST','/people/offboard'],'people.offboarding':['POST','/people/offboarding'],
 'users.list':['GET','/users'],'users.get':['GET','/users/{operator}'],'users.invite':['POST','/users'],'users.role':['PUT','/users/{operator}/role'],'users.status':['PUT','/users/{operator}/status'],'users.cancel-invitation':['DELETE','/users/{operator}/invitation'],
 'groups.list':['GET','/groups'],'groups.create':['POST','/groups'],'groups.members':['GET','/groups/{group}/members'],'groups.set':['PUT','/groups/{group}/members'],
 'vaults.list':['GET','/vaults'],'vaults.get':['GET','/vaults/{vault}'],'vaults.create':['POST','/vaults'],'vaults.share':['POST','/vaults/{vault}/shares'],'vaults.rotate':['POST','/vaults/{vault}/rotations'],
 'items.list':['GET','/vaults/{vault}/items'],'items.get':['GET','/vaults/{vault}/items/{object}'],'items.history':['GET','/vaults/{vault}/items/{object}/versions'],'items.put':['PUT','/vaults/{vault}/items/{object}'],'items.erase':['DELETE','/vaults/{vault}/items/{object}'],
 'policies.get':['GET','/policies'],'policies.sharing':['PUT','/policies/sharing'],'policies.generator':['PUT','/policies/generator'],
 'projects.list':['GET','/projects'],'projects.get':['GET','/projects/{project}'],'projects.create':['POST','/projects'],'projects.environments':['GET','/projects/{project}/environments'],'projects.environment-create':['POST','/projects/{project}/environments'],'projects.environment':['GET','/environments/{environment}'],'projects.resource-create':['POST','/environments/{environment}/resources'],
 'events.list':['GET','/events'],'reviews.list':['GET','/reviews'],'reviews.get':['GET','/reviews/{review}'],'reviews.create':['POST','/reviews'],'reviews.decide':['POST','/reviews/{review}/decisions'],'reviews.close':['POST','/reviews/{review}/close'],'reviews.package':['GET','/reviews/{review}/package'],
 'reviews.reviewers':['GET','/reviewers'],'reviews.assign':['POST','/reviews/{review}/assignments'],'reviews.reconcile':['POST','/reviews/{review}/reconciliation'],'reviews.remind':['POST','/reviews/{review}/reminders'],'reviews.remove':['POST','/reviews/{review}/removals'],'reviews.verify-package':['POST','/reviews/{review}/package/verification'],
 'imports.prepare':['POST','/imports/preparations'],'imports.activate':['POST','/imports/{restore}/activation'],'imports.status':['GET','/imports/{restore}'],'operations.status':['GET','/operations/{restore}'],
 'webhooks.list':['GET','/webhooks'],'webhooks.subscribe':['POST','/webhooks'],'webhooks.status':['GET','/webhooks/{subscription}'],'webhooks.revoke':['DELETE','/webhooks/{subscription}'],'webhooks.rotate':['POST','/webhooks/{subscription}/rotation'],'webhooks.enqueue':['POST','/webhooks/{subscription}/deliveries'],'webhooks.dispatch':['POST','/webhooks/{subscription}/dispatch'],
 'mcp.issue':['POST','/mcp/credentials'],'mcp.revoke':['DELETE','/mcp/credentials/{credential}'],'access.list':['GET','/access-requests'],'access.preview':['GET','/access-requests/{request}'],'access.decide':['POST','/access-requests/{request}/decision'],'access.fulfill':['POST','/access-requests/{request}/fulfillment'],
};
export function apiCommand(client,input){
 if(!input||typeof input!=='object')throw new ApiError('invalid_api_command');
 if(input.method&&input.path)return requestApi(client,input.method,input.path,input.body??{},input.ifMatch===undefined?{}:{ifMatch:input.ifMatch});
 const command=commands[input.command??`${input.resource}.${input.action}`];
 if(!command)throw new ApiError('unknown_api_command');
 const [method,template]=command,path=template.replace(/\{(\w+)\}/g,(_,key)=>identifier(input[key]));
 return requestApi(client,method,path+query(input),input.body??{},input.ifMatch===undefined?{}:{ifMatch:input.ifMatch});
}
