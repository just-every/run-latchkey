import { digest, verify } from '../crypto/envelope.mjs';
import { access, exact, liveSql, MspError, need, uuid } from './common.mjs';
import { providerAction } from './provider.mjs';
const baseHeaders={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'",vary:'Origin'};
export async function mspResponse(request,env){
 const now=Date.now(),ctx={db:env.DB,now},url=new URL(request.url),requestedOrigin=request.headers.get('origin'),{first,stmt}=access(ctx);let allowedOrigin=null;
 const response=(value,status=200)=>Response.json(value,{status,headers:{...baseHeaders,...(allowedOrigin?{'access-control-allow-origin':allowedOrigin}:{})}});
 try{
  need(url.origin===env.AUTH_ORIGIN&&!url.search,'invalid_origin',403);
  if(request.method==='OPTIONS'){
   need(request.headers.get('access-control-request-method')==='POST','method_not_allowed',405);
   const headers=(request.headers.get('access-control-request-headers')??'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
   need(headers.every(h=>['content-type','x-latchkey-provider-signature'].includes(h)),'invalid_headers',403);
   need(await first(`SELECT 1 AS allowed FROM lky_msp_delegations d WHERE d.console_origin=? AND ${liveSql} LIMIT 1`,requestedOrigin??'',now),'delegation_unavailable',403);
   return new Response(null,{status:204,headers:{...baseHeaders,'access-control-allow-origin':requestedOrigin,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type,x-latchkey-provider-signature','access-control-max-age':'300'}});
  }
  need(request.method==='POST','method_not_allowed',405);need(request.headers.get('content-type')==='application/json','invalid_content_type');
  const reader=request.body?.getReader();need(reader,'invalid_body');const chunks=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new MspError('body_too_large',413)}chunks.push(part.value)}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length}
  let body,rawText;try{rawText=new TextDecoder('utf-8',{fatal:true}).decode(raw);body=JSON.parse(rawText)}catch{throw new MspError('invalid_json')}
  exact(body,['delegation','provider','nonce','time','action','input']);uuid(body.delegation);uuid(body.provider);uuid(body.nonce);
  const delegation=await first(`SELECT d.* FROM lky_msp_delegations d WHERE d.id=? AND d.provider=? AND ${liveSql}`,body.delegation,body.provider,now);
  need(delegation&&requestedOrigin===delegation.console_origin,'delegation_unavailable',403);allowedOrigin=delegation.console_origin;
  need(Number.isSafeInteger(body.time)&&Math.abs(now-body.time)<=60000,'request_expired',401);
  need(await verify(delegation.public_key,request.headers.get('x-latchkey-provider-signature'),JSON.stringify(['latchkey/msp/v1',env.AUTH_ORIGIN,rawText])),'invalid_signature',403);
  const hash=await digest(delegation.id),limit=await first('INSERT INTO lky_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count','msp:'+hash,Math.floor(now/60000));need(limit.count<=120,'rate_limited',429);
  await stmt('DELETE FROM lky_msp_nonces WHERE expires_at<=?',now).run();
  need(await first('INSERT INTO lky_msp_nonces VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING nonce',delegation.id,body.nonce,now+120000),'request_replayed',409);
  return response(await providerAction({...ctx,tenant:delegation.tenant,actor:'msp-provider',device:delegation.id},delegation,body.action,body.input));
 }catch(error){return response({error:error instanceof MspError?error.code:'msp_request_refused'},error instanceof MspError?error.status:400)}
}
