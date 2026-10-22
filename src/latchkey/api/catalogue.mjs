// Canonical handlers remain the sole authority for rights, encryption and CAS.
export const routes = [
 ['GET','/users','api/users/list',[],null,'id'],
 ['POST','/users','api/users/invite',['email','displayName'],null,null,{role:'member',returnTo:'/'},['role','returnTo']],
 ['GET','/users/{operator}','api/users/get',[]],
 ['PUT','/users/{operator}/role','api/users/role',['role']],
 ['PUT','/users/{operator}/status','api/users/status',['status']],
 ['DELETE','/users/{operator}/invitation','api/users/cancel-invitation',[]],
 ['GET','/directory/{account}','directory',[]],
 ['GET','/groups','api/groups',[],null,'id'],
 ['POST','/groups','sharing/group/create',['group']],
 ['GET','/groups/{group}/members','sharing/group/members',[]],
 ['PUT','/groups/{group}/members','sharing/group/set',['accounts']],
 ['GET','/vaults','vaults',[],null,'id'],
 ['POST','/vaults','vault/create',['vault','wrapped','kind','policy']],
 ['GET','/vaults/{vault}','vault/read',[]],
 ['GET','/vaults/{vault}/items','vault/read',[],'versions','versionKey'],
 ['GET','/vaults/{vault}/items/{object}','item/read',[],null,null,{history:false}],
 ['GET','/vaults/{vault}/items/{object}/versions','item/read',[],'versions','versionKey',{history:true}],
 ['PUT','/vaults/{vault}/items/{object}','item/put',['version','revision','envelope']],
 ['DELETE','/vaults/{vault}/items/{object}','item/erase',['confirmed','revision','proof']],
 ['POST','/vaults/{vault}/shares','vault/share',['revision','account','fingerprint','rights','wrapped','capability']],
 ['POST','/vaults/{vault}/rotations','vault/rotate',['revision','remove','versions','recipients']],
 ['GET','/policies','api/policies',[]],
 ['GET','/policies/sharing','sharing/policy',[]],
 ['PUT','/policies/sharing','sharing/policy/set',['externalEnabled','domains','defaultDays','maxDays']],
 ['GET','/policies/generator','generator/policy',[]],
 ['PUT','/policies/generator','generator/policy/set',['group','policy','reason']],
 ['GET','/projects','project/list',[],'projects','id'],
 ['POST','/projects','project/create',['project','vault','object']],
 ['GET','/projects/{project}','api/project',[]],
 ['GET','/projects/{project}/environments','project/environments',[],'environments','id'],
 ['POST','/projects/{project}/environments','project/environment/create',['environment','object']],
 ['GET','/environments/{environment}','project/environment/read',[]],
 ['POST','/environments/{environment}/resources','project/resource/create',['object']],
 ['GET','/events','audit',[],null,'id'],
 ['GET','/reviews','reviews/list',[],null,'id',{vault:null}],
 ['POST','/reviews','reviews/create',['vault','reviewer','scheduleAt','dueAt','period']],
 ['GET','/reviews/{review}','reviews/get',[]],
 ['POST','/reviews/{review}/decisions','reviews/decide',['key','decision','reason']],
 ['POST','/reviews/{review}/close','reviews/close',[]],
 ['GET','/reviews/{review}/package','reviews/package',[]],
 ['POST','/imports/preparations','archive/prepare',['plan','approval','sourceFingerprint','destinationFingerprint']],
 ['POST','/imports/{restore}/activation','archive/activate',['approvedPlanHash','activation','rights','wraps']],
 ['GET','/imports/{restore}','archive/status',[]],
 ['GET','/operations/{restore}','archive/status',[]],
 ['POST','/webhooks','webhook/subscribe',['endpoint','events','secret','confirmed']],
 ['GET','/webhooks','webhook/list',[],null,'id'],
 ['GET','/webhooks/{subscription}','webhook/status',[]],
 ['DELETE','/webhooks/{subscription}','webhook/revoke',['revision']],
 ['POST','/webhooks/{subscription}/rotation','webhook/rotate',['revision','secret','confirmed']],
 ['POST','/webhooks/{subscription}/deliveries','webhook/enqueue',['revision','event','confirmed']],
 ['POST','/webhooks/{subscription}/dispatch','webhook/dispatch',['revision','delivery','confirmed']],
 ['POST','/mcp/credentials','mcp/credential/issue',['vault','publicKey','scopes','expiresAt','confirmed']],
 ['DELETE','/mcp/credentials/{credential}','mcp/credential/revoke',[]],
 ['GET','/access-requests','mcp/requests',[],null,'id'],
 ['GET','/access-requests/{request}','mcp/ownerpreview',[]],
 ['POST','/access-requests/{request}/decision','mcp/ownerapprove',['revision','previewHash','decision','confirmed']],
 ['POST','/access-requests/{request}/fulfillment','mcp/fulfill',['revision','shareInput']],
];

export class ApiError extends Error { constructor(code,status=400){super(code);this.code=code;this.status=status;} }
const need=(value,code='invalid_api_input',status=400)=>{if(!value)throw new ApiError(code,status);};
export function resolveApi(method,path,body={}) {
 need(body&&typeof body==='object'&&!Array.isArray(body));
 const url=new URL(path,'https://latchkey.invalid');
 const relative=url.pathname.replace(/^\/api\/latchkey\/v1/,'');
 const parts=relative.split('/');
 for(const definition of routes){
  const [verb,pattern,route,keys,listKey,idKey,defaults,optional=[]]=definition, expected=pattern.split('/');
  if(verb!==method||expected.length!==parts.length)continue;
  const params={};let matches=true;
  for(let i=0;i<parts.length;i++){
   if(expected[i].startsWith('{')){let value;try{value=decodeURIComponent(parts[i]);}catch{matches=false;break;}if(!/^[a-f0-9-]{36}$/.test(value)){matches=false;break;}params[expected[i].slice(1,-1)]=value;}
   else if(expected[i]!==parts[i]){matches=false;break;}
  }
  if(!matches)continue;
  const pagination={limit:50,cursor:null};
  const query={};
  for(const[key,value]of url.searchParams){
   need(!Object.hasOwn(query,key),'duplicate_query_parameter');query[key]=value;
   need(idKey&&['limit','cursor'].includes(key),'unsupported_query_parameter');
   if(key==='limit'){need(/^[0-9]+$/.test(value)&&Number(value)>=1&&Number(value)<=200,'invalid_page_limit');pagination.limit=Number(value);}
   else pagination.cursor=value;
  }
  need(keys.every(key=>Object.hasOwn(body,key))&&Object.keys(body).every(key=>keys.includes(key)||optional.includes(key)),'invalid_fields');
  return {route,input:{...(defaults??{}),...params,...body},pagination:idKey?{...pagination,listKey,idKey}:null,definition};
 }
 throw new ApiError('api_route_not_found',404);
}
