import { readInput } from '../../modules/operator-auth/input.mjs';
import { securityHeaders } from '../../modules/operator-auth/http.mjs';
import { subjectAdmission } from './admission.mjs';
import { SubjectErasureError } from './subject-common.mjs';
const json=(value,status)=>Response.json(value,{status,headers:securityHeaders()});
async function inputCopy(request) {
 const reader=request.clone().body?.getReader();if(!reader)return null;
 const parts=[];let length=0;
 for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>8192){void reader.cancel().catch(()=>{});throw Object.assign(Error(),{code:'input_too_large',status:413})}parts.push(next.value)}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
 return readInput(new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')??''},body:bytes}));
}
// The edition guards its existing native invitation/email doors before Base
// can recreate erased identity records. No Base source is patched.
export async function nativeErasureResponse(request,env,auth) {
 const url=new URL(request.url),path=url.pathname;
 if(request.method!=='POST'||!['/auth/invite','/auth/magic-link','/auth/email'].includes(path)||url.origin!==env.AUTH_ORIGIN||request.headers.has('host')&&request.headers.get('host').toLowerCase()!==url.host.toLowerCase()||request.headers.get('origin')!==env.AUTH_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')return null;
 const installation=await env.DB.prepare('SELECT id FROM lky_installation WHERE singleton=1').first();
 if(!installation||!await env.DB.prepare('SELECT 1 FROM lky_subject_fences WHERE tenant=? LIMIT 1').bind(installation.id).first())return null;
 if(path!=='/auth/magic-link') {const session=await auth.getSession(request);if(!session||path==='/auth/invite'&&!['owner','admin'].includes(session.operator.role))return null}
 try {
  const input=await inputCopy(request);if(typeof input?.email!=='string')return null;
  await subjectAdmission({db:env.DB,env,tenant:installation.id},[['email',input.email.trim().toLowerCase()]]);return null;
 }catch(error){
  if(error instanceof SubjectErasureError&&error.code==='erased_identity'&&path==='/auth/magic-link')return json({accepted:true},202);
  return json({error:error instanceof SubjectErasureError?error.code:'invalid_input'},error instanceof SubjectErasureError?error.status:400);
 }
}
