import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {unstable_splitSqlQuery} from 'wrangler';
const {Miniflare,convertV4MiniflareOptions,Log,LogLevel}=createRequire(import.meta.resolve('wrangler/package.json'))('miniflare');
const issuer='https://demo.example.test',installationId='synthetic-latchkey-demo-1';
const segment=value=>Buffer.from(JSON.stringify(value)).toString('base64url');

test('host-signed owner claims require the configured demo runtime; installed authority is unchanged',async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const directory=await mkdtemp(join(tmpdir(),'latchkey-demo-claim-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'pipe'});
 const tls={https:true,httpsKey:await readFile(join(directory,'key.pem'),'utf8'),httpsCert:await readFile(join(directory,'cert.pem'),'utf8')},origin=`https://127.0.0.1:${port}`;
 const {Agent}=createRequire(import.meta.resolve('wrangler/package.json'))('undici'),dispatcher=new Agent({connect:{ca:tls.httpsCert}});
 try {
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const {kty,crv,x,y}=await crypto.subtle.exportKey('jwk',pair.publicKey),kid='synthetic-latchkey-demo-2';
 const now=Math.floor(Date.now()/1000),email='synthetic-latchkey-demo-3@example.test';
 const claim={v:1,iss:issuer,aud:origin,installationId,email,jti:crypto.randomUUID(),iat:now,exp:now+300};
 const signClaim=async(value,key=pair.privateKey)=>{const signed=segment({alg:'ES256',typ:'rer-owner-claim+jwt',kid})+'.'+segment(value);return signed+'.'+Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(signed))).toString('base64url')};
 const token=await signClaim(claim);
 const foreign=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const refusedTokens=await Promise.all([signClaim(claim,foreign.privateKey),...[
  {iss:'https://wrong.example.test'},{aud:'https://wrong.example.test'},
  {installationId:'synthetic-latchkey-other-installation'},{iat:now-600,exp:now-300},
 ].map(change=>signClaim({...claim,...change}))]);
 const modules=[{type:'ESModule',path:join(process.cwd(),'dist/server/index.js')},...(await readdir('dist/server/assets')).filter(n=>/\.(?:js|wasm)$/.test(n)).map(n=>({type:n.endsWith('.wasm')?'CompiledWasm':'ESModule',path:join(process.cwd(),'dist/server/assets',n)}))];
 for(const mode of ['installed','demo-without-keys','demo']){
  const bindings={AUTH_ORIGIN:origin,OWNER_EMAIL:email,SESSION_SECRET:crypto.randomUUID()+crypto.randomUUID(),SETUP_TOKEN:crypto.randomUUID()+crypto.randomUUID(),RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,...(mode!=='demo-without-keys'?{RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:{kty,crv,x,y,kid,alg:'ES256',use:'sig'}})}:{}),...(mode!=='installed'?{RER_DEMO:'1'}:{})};
  const worker=new Miniflare(convertV4MiniflareOptions({...tls,host:'127.0.0.1',port,modules,modulesRoot:join(process.cwd(),'dist/server'),compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:crypto.randomUUID()},bindings,log:new Log(LogLevel.ERROR),outboundService:()=>{throw Error('Owner claim must not fetch')}}));
  try{
   const dispatch=(url,init)=>fetch(url,{...init,dispatcher});
   const db=await worker.getD1Database('DB');
   for(const name of (await readdir('migrations/core')).filter(n=>n.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile(join('migrations/core',name),'utf8')).map(sql=>db.prepare(sql)));
   const post=(data,extra={})=>dispatch(origin+'/auth/owner-claim',{method:'POST',redirect:'manual',headers:{host:new URL(origin).host,origin,'content-type':'application/json',...extra},body:JSON.stringify(data)});
   const inputs=mode==='demo'?[{},{token:'synthetic-latchkey-invalid-claim'}]:[{},{token},...refusedTokens.map(token=>({token})),{token:'synthetic-latchkey-invalid-claim'}];
   for(const input of inputs){
    const refused=await post(input,{'x-rer-demo':'1','x-rer-owner-claim-public-keys':bindings.RER_OWNER_CLAIM_PUBLIC_KEYS??'{}'});
    assert.equal(refused.status,403,mode);assert.equal(refused.headers.has('set-cookie'),false,mode);
   }
   if(mode==='demo'){
    const accepted=await post({token});assert.equal(accepted.status,303,await accepted.clone().text());
    const cookie=accepted.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    const session=await dispatch(origin+'/auth/session',{headers:{host:new URL(origin).host,cookie}});assert.equal(session.status,200);assert.equal((await session.json()).operator.email,email);
    const replay=await post({token});assert.equal(replay.status,409);assert.equal(replay.headers.has('set-cookie'),false);
   }else{
    const absent=await dispatch(origin+'/auth/session',{headers:{host:new URL(origin).host}});
    assert.equal(absent.status,401,mode+': '+await absent.text());
    assert.equal((await db.prepare('SELECT count(*) AS n FROM oa_operators').first()).n,0,mode);
   }
  }finally{await worker.dispose()}
 }
 }finally{await dispatcher.close();await rm(directory,{recursive:true,force:true})}
});
