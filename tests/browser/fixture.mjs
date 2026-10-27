import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { chromium } from '@playwright/test';
import { encode, random } from '../../src/latchkey/crypto/envelope.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
const require = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = require('miniflare');
const { Agent } = require('undici');
export async function vaultFixture({webhook=false,browserEnabled=true,enrollOwner=true,mailStatus=202,clock=null,persistent=false}={}) {
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const directory=await mkdtemp(join(tmpdir(),'latchkey-browser-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'pipe'});
 const tls={https:true,httpsKey:await readFile(join(directory,'key.pem'),'utf8'),httpsCert:await readFile(join(directory,'cert.pem'),'utf8')},origin=`https://127.0.0.1:${port}`,mail=[],webhooks=[],runtimeLogs=[];
 const bindings={LATCHKEY_ERASURE_SECRET:encode(random()),AUTH_ORIGIN:origin,OWNER_EMAIL:'synthetic-latchkey-1100@example.test',SESSION_SECRET:'synthetic-latchkey-1101'.repeat(3),SETUP_TOKEN:'synthetic-latchkey-1102'.repeat(3),MAIL_PROVIDER:'sendgrid',MAIL_API_KEY:'synthetic-latchkey-1103',MAIL_FROM:'synthetic-latchkey-1104@example.test'};
 if(webhook)bindings.LATCHKEY_WEBHOOK_ORIGINS=JSON.stringify(['https://receiver.example.test']);
 let currentClock=clock;
 const modules=()=>[{type:'ESModule',path:join(process.cwd(),'./dist/server/index.js'),...(currentClock===null?{}:{contents:`Date.now=()=>${Number(currentClock)};\n`+await readFile('./dist/server/index.js','utf8')})},...(await readdir('./dist/server/assets')).filter(n=>/\.(?:js|wasm)$/.test(n)).map(n=>({type:n.endsWith('.wasm')?'CompiledWasm':'ESModule',path:join(process.cwd(),'./dist/server/assets',n)}))];
 const createWorker=()=>new Miniflare(convertV4MiniflareOptions({...tls,...(persistent?{resourcePersistencePath:join(directory,'database')}:{}),host:'127.0.0.1',port,modules:modules(),modulesRoot:join(process.cwd(),'./dist/server'),assets:{directory:join(process.cwd(),'./dist/client'),binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true}},compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'synthetic-latchkey-1105',ARCHIVE:'synthetic-latchkey-2080'},bindings,log:new Log(LogLevel.ERROR),handleStructuredLogs:value=>runtimeLogs.push(JSON.stringify(value)),outboundService:async request=>{
  if(webhook&&request.url==='https://receiver.example.test/hook'){webhooks.push({headers:Object.fromEntries(request.headers),body:await request.text()});return new Response(null,{status:webhooks.length===1?503:webhooks.length===2?302:204,headers:webhooks.length===2?{location:'https://unapproved.example.test/hook'}:{}})}
  assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');assert.equal(request.method,'POST');mail.push(await request.json());return new Response(null,{status:mailStatus,headers:{'x-message-id':'synthetic-latchkey-1106'}});
 }}));let worker=createWorker();
 let db=await worker.getD1Database('DB');for(const name of (await readdir('./migrations/core')).filter(n=>n.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile(join('./migrations/core',name),'utf8')).map(sql=>db.prepare(sql)));
 const dispatcher=new Agent({connect:{ca:tls.httpsCert}}),fetcher=(url,init)=>fetch(url,{...init,dispatcher});
 const browser=browserEnabled?await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--use-mock-keychain','--password-store=basic','--no-sandbox']}):null;
 const context=browser?await browser.newContext({ignoreHTTPSErrors:true}):null;
 try {
 const bootstrapInput={token:bindings.SETUP_TOKEN,displayName:'Northstar Finance owner'};
 let cookie='';
 if(enrollOwner){
 if(context){
  const response=await context.request.post(origin+'/auth/bootstrap',{headers:{origin},data:bootstrapInput,maxRedirects:0});assert.equal(response.status(),303,await response.text());
  cookie=(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ');
 }else{
  const response=await fetcher(origin+'/auth/bootstrap',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(bootstrapInput),redirect:'manual'});assert.equal(response.status,303);
  cookie=response.headers.get('set-cookie').split(';')[0];
 }
 }
 const owner=new VaultClient(origin,{cookie,fetcher}),password='synthetic-latchkey-1107',enrolled=enrollOwner?await owner.register(password):null;if(enrolled)await owner.unlock(enrolled.profile,password);
 const page=context?await context.newPage():null;
 return {caFile:join(directory,'cert.pem'),origin,get db(){return db},owner,password,enrolled,page,context,browser,mail,webhooks,fetcher,runtimeLogs,
  restart:async()=>{if(!persistent)throw Error('Restart proof requires persistent fixture storage');await worker.dispose();worker=createWorker();db=await worker.getD1Database('DB')},
  setClock:async value=>{if(!persistent)throw Error('Clock changes require persistent fixture storage');currentClock=value;await worker.dispose();worker=createWorker();db=await worker.getD1Database('DB')},
  archiveDatabase:()=>worker.getD1Database('ARCHIVE'),
  schedule:async(time=Date.now())=>(await worker.getWorker()).scheduled({scheduledTime:new Date(time),cron:'* * * * *'}),
  code:()=>{const value=mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/Latchkey verification code: (\d{6})/);assert.ok(value);return value[1]},
  close:async()=>{owner.lock();await browser?.close();await worker.dispose();await dispatcher.close();await rm(directory,{recursive:true,force:true})}};
 } catch(error) {await browser?.close();await worker.dispose();await dispatcher.close();await rm(directory,{recursive:true,force:true});throw error}
}
