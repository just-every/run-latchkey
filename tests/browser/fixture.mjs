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
export async function vaultFixture() {
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const directory=await mkdtemp(join(tmpdir(),'latchkey-browser-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'pipe'});
 const tls={https:true,httpsKey:await readFile(join(directory,'key.pem'),'utf8'),httpsCert:await readFile(join(directory,'cert.pem'),'utf8')},origin=`https://127.0.0.1:${port}`,mail=[];
 const bindings={LATCHKEY_ERASURE_SECRET:encode(random()),AUTH_ORIGIN:origin,OWNER_EMAIL:'synthetic-latchkey-1100@example.test',SESSION_SECRET:'synthetic-latchkey-1101'.repeat(3),SETUP_TOKEN:'synthetic-latchkey-1102'.repeat(3),MAIL_PROVIDER:'sendgrid',MAIL_API_KEY:'synthetic-latchkey-1103',MAIL_FROM:'synthetic-latchkey-1104@example.test'};
 const modules=[{type:'ESModule',path:join(process.cwd(),'dist/server/index.js')},...(await readdir('dist/server/assets')).filter(n=>/\.(?:js|wasm)$/.test(n)).map(n=>({type:n.endsWith('.wasm')?'CompiledWasm':'ESModule',path:join(process.cwd(),'dist/server/assets',n)}))];
 const worker=new Miniflare(convertV4MiniflareOptions({...tls,host:'127.0.0.1',port,modules,modulesRoot:join(process.cwd(),'dist/server'),assets:{directory:join(process.cwd(),'dist/client'),binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true}},compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'synthetic-latchkey-1105',ARCHIVE:'synthetic-latchkey-2080'},bindings,log:new Log(LogLevel.ERROR),outboundService:async request=>{
  assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');assert.equal(request.method,'POST');mail.push(await request.json());return new Response(null,{status:202,headers:{'x-message-id':'synthetic-latchkey-1106'}});
 }}));
 const db=await worker.getD1Database('DB');for(const name of (await readdir('migrations/core')).filter(n=>n.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile(join('migrations/core',name),'utf8')).map(sql=>db.prepare(sql)));
 const dispatcher=new Agent({connect:{ca:tls.httpsCert}}),fetcher=(url,init)=>fetch(url,{...init,dispatcher});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext({ignoreHTTPSErrors:true});
 try {
 const response=await context.request.post(origin+'/auth/bootstrap',{headers:{origin},data:{token:bindings.SETUP_TOKEN,displayName:'Northstar Finance owner'},maxRedirects:0});assert.equal(response.status(),303,await response.text());
 const cookies=await context.cookies(),cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');
 const owner=new VaultClient(origin,{cookie,fetcher}),password='synthetic-latchkey-1107',enrolled=await owner.register(password);await owner.unlock(enrolled.profile,password);
 const page=await context.newPage();
 return {caFile:join(directory,'cert.pem'),origin,db,owner,password,enrolled,page,context,browser,mail,fetcher,
  archiveDatabase:()=>worker.getD1Database('ARCHIVE'),
  schedule:async(time=Date.now())=>(await worker.getWorker()).scheduled({scheduledTime:new Date(time),cron:'* * * * *'}),
  code:()=>{const value=mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/Latchkey verification code: (\d{6})/);assert.ok(value);return value[1]},
  close:async()=>{owner.lock();await browser.close();await worker.dispose();await dispatcher.close();await rm(directory,{recursive:true,force:true})}};
 } catch(error) {await browser.close();await worker.dispose();await dispatcher.close();await rm(directory,{recursive:true,force:true});throw error}
}
