import { ApiError, resolveApi } from './catalogue.mjs';
import { pageResult } from './pagination.mjs';
export { ApiError, resolveApi } from './catalogue.mjs';
export { apiAuthenticated,rateApi } from './metadata.mjs';

async function rawBody(request){
 const chunks=[];let size=0;
 const reader=request.body?.getReader();
 if(reader)try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1500000){await reader.cancel();throw new ApiError('body_too_large',413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
/** dispatch receives the ORIGINAL wire request and metadata. It must authenticate
 * its actual method/full path/raw bytes, then run the canonical handler on input.
 * Never call a handler with metadata before authentication or rewrite signatures.
 */
export async function apiRequest(request,dispatch){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/latchkey/v1/'))return null;
 const error=(code,status)=>Response.json({error:code},{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...(status===429?{'retry-after':'60'}:{})}});
 try{
  if(url.pathname==='/api/latchkey/v1/openapi.json'&&request.method==='GET'&&!url.search){
   const spec=(await import('./openapi.json',{with:{type:'json'}})).default;
   return Response.json(spec,{headers:{'cache-control':'public,max-age=3600','x-content-type-options':'nosniff'}});
  }
  if(url.search.length>16384)throw new ApiError('query_too_large',414);
  const raw=await rawBody(request.clone());
  if(request.method==='GET'&&raw.length)throw new ApiError('get_body_forbidden');
  if(request.method!=='GET'&&request.headers.get('content-type')!=='application/json')throw new ApiError('invalid_content_type');
  let body={};
  if(raw.length)try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new ApiError('invalid_json');}
  const resolved=resolveApi(request.method,url.pathname+url.search,body);
  const ifMatch=request.headers.get('if-match');
  if(ifMatch!==null&&(!/^"[1-9][0-9]*"$/.test(ifMatch)||Number(ifMatch.slice(1,-1))!==resolved.input.revision))throw new ApiError('precondition_failed',412);
  const response=await dispatch(request,{...resolved,raw,signatureMethod:request.method,signaturePath:url.pathname+url.search});
  if(!(response instanceof Response))throw new ApiError('invalid_dispatch_response',502);
  if(response.status===429){const headers=new Headers(response.headers);headers.set('retry-after','60');return new Response(response.body,{status:429,headers});}
  if(!response.ok||!resolved.pagination)return response;
  const scope=JSON.stringify([resolved.route,resolved.input]);
  const value=pageResult(await response.json(),resolved.pagination,scope);
  return new Response(JSON.stringify(value),{status:response.status,headers:response.headers});
 }catch(cause){return error(cause instanceof ApiError?cause.code:'request_refused',cause instanceof ApiError?cause.status:400);}
}
