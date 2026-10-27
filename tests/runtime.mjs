import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:runtime');if(queued!==null)process.exit(queued);
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
// The installed homepage reads the claim state from D1: run the emitted Worker
// on its own migrated store, never the checkout's local data.
const persist = await mkdtemp(join(tmpdir(), 'foundation-runtime-'))
execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'foundation', '--local', '--persist-to', persist, '--config', 'dist/server/wrangler.json'], { stdio: 'pipe', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } })
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--inspector-port', '0', '--local', '--persist-to', persist, '--ip', '127.0.0.1', '--config', 'dist/server/wrangler.json', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
worker.stdout.on('data', chunk => { output += chunk })
worker.stderr.on('data', chunk => { output += chunk })
const origin = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (worker.exitCode !== null) throw new Error(output)
    try { ready = (await fetch(`${origin}/health`)).ok } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, output)
  const health = await (await fetch(`${origin}/health`)).json()
  assert.equal(health.status, 'ok')
  assert.equal(health.ok, true)
  assert.deepEqual(Object.keys(health.deployment ?? {}).sort(), ['fingerprint', 'sourceSha', 'versionId'])
  const document = await fetch(origin)
  assert.equal(document.status, 200)
  const branding = JSON.parse(await readFile(new URL('../src/branding.json', import.meta.url)))
  assert.ok((await document.text()).includes(branding.name))
  for (const path of ['/missing', '/health/extra', '/api', '/api/missing']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404, path)
  }
  console.log('HTTP-001 passed against emitted local Worker: health, the installed homepage, HTTP and document 404s')
} finally {
  worker.kill('SIGTERM')
  await new Promise(resolve => worker.exitCode !== null ? resolve() : worker.once('exit', resolve))
  await rm(persist, { recursive: true, force: true })
  // wrangler dev keeps its scratch (.wrangler/tmp) beside the config it runs, which here is the emitted Worker; the artifact producer refuses that folder in dist/server, so leave the build output as rer build wrote it.
  await rm('dist/server/.wrangler', { recursive: true, force: true })
}

// Product journeys use the emitted Worker, its actual D1 schema, WebCrypto and
// OPAQUE on both ends. Only the SendGrid network edge is substituted, using its
// published v3 JSON request and HTTP 202 acceptance response.
const { createRequire } = await import('node:module')
const { unstable_splitSqlQuery } = await import('wrangler')
const { readdir, stat, writeFile } = await import('node:fs/promises')
const fromWrangler = createRequire(import.meta.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = fromWrangler('miniflare')
const { MachineClient } = await import('../src/latchkey/machine.mjs')
const { VaultClient } = await import('../src/latchkey/client.mjs')
const cryptography = await import('../src/latchkey/crypto/envelope.mjs')
const { bytes, decode, digest, encode, id, open, random, signingText, sign, itemKey } = cryptography
const mail = [], traces = [], runtimeLogs = []
const tlsDirectory = await mkdtemp(join(tmpdir(), 'latchkey-tls-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tlsDirectory, 'key.pem'), '-out', join(tlsDirectory, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'pipe' })
const tls = { https: true, httpsKey: await readFile(join(tlsDirectory, 'key.pem'), 'utf8'), httpsCert: await readFile(join(tlsDirectory, 'cert.pem'), 'utf8') }
const { Agent } = fromWrangler('undici')
const dispatcher = new Agent({ connect: { ca: tls.httpsCert } })
const productOrigin = `https://127.0.0.1:${port}`
const bindings = { LATCHKEY_ERASURE_SECRET: encode(random()), AUTH_ORIGIN: productOrigin, OWNER_EMAIL: 'synthetic-latchkey-1@example.test', SESSION_SECRET: 'synthetic-latchkey-2'.repeat(3), SETUP_TOKEN: 'synthetic-latchkey-3'.repeat(3), MAIL_PROVIDER: 'sendgrid', MAIL_API_KEY: 'synthetic-latchkey-4', MAIL_FROM: 'synthetic-latchkey-5@example.test' }
const workerModules = [{ type: 'ESModule', path: join(process.cwd(), 'dist/server/index.js') }, ...(await readdir('dist/server/assets')).filter(name => /\.(?:js|wasm)$/.test(name)).map(name => ({ type: name.endsWith('.wasm') ? 'CompiledWasm' : 'ESModule', path: join(process.cwd(), 'dist/server/assets', name) }))]
const product = new Miniflare(convertV4MiniflareOptions({ ...tls, host: '127.0.0.1', port,
 modules: workerModules, modulesRoot: join(process.cwd(), 'dist/server'),
 compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'],
 d1Databases: { DB: 'synthetic-latchkey-6' }, bindings,
 log: new Log(LogLevel.ERROR),
 handleStructuredLogs: value => runtimeLogs.push(JSON.stringify(value)),
 outboundService: async request => {
  assert.equal(request.url, 'https://api.sendgrid.com/v3/mail/send')
  assert.equal(request.method, 'POST')
  const message = await request.json()
  assert.ok(message.personalizations[0].to[0].email.endsWith('@example.test'))
  assert.ok(message.content.some(content => content.type === 'text/plain'))
  mail.push(message)
  return new Response(null, { status: 202, headers: { 'x-message-id': 'synthetic-latchkey-7' } })
 },
}))
const dispatchProduct = async (url, init) => { await product.ready; return fetch(url, { ...init, dispatcher }) }
let productDb
const fetchProduct = async (url, init) => {
 init = { ...init, headers: { ...init.headers, host: new URL(url).host } }
 const result = await dispatchProduct(url, init)
 traces.push({ url, request: init, status: result.status, response: await result.clone().text() })
 return result
}
const post = (route, value, cookie = '') => dispatchProduct(productOrigin + route, { method: 'POST', headers: { host: new URL(productOrigin).host, origin: productOrigin, 'content-type': 'application/json', cookie }, body: JSON.stringify(value), redirect: 'manual' })
const body = async response => { assert.ok(response.ok, `${response.status}: ${await response.clone().text()}`); return response.json() }
const rejected = (promise, code) => assert.rejects(promise, error => error.message === code)
const dump = async () => {
 const tables = (await productDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results
 const result = {}
 for (const table of tables) result[table.name] = (await productDb.prepare(`SELECT * FROM "${table.name.replaceAll('"', '""')}"`).all()).results
 return result
}
try {
 productDb = await product.getD1Database('DB')
 for (const migration of (await readdir('migrations/core')).filter(name => name.endsWith('.sql')).sort()) await productDb.batch(unstable_splitSqlQuery(await readFile(join('migrations/core', migration), 'utf8')).map(sql => productDb.prepare(sql)))
 const bootstrap = await post('/auth/bootstrap', { token: bindings.SETUP_TOKEN, displayName: 'Synthetic Latchkey owner' })
 assert.equal(bootstrap.status, 303, await bootstrap.clone().text())
 const ownerCookie = bootstrap.headers.get('set-cookie').split(';')[0]
 const owner = new VaultClient(productOrigin, { cookie: ownerCookie, fetcher: fetchProduct })
 const password = 'synthetic-latchkey-8'
 const enrolled = await owner.register(password)
 await owner.unlock(enrolled.profile, password)
 const vault = (await owner.createVault()).vault
 assert.deepEqual((await owner.readVault(vault)).versions, [])
 const types = ['login', 'totp', 'passkey-private-material', 'secure-note', 'card', 'identity', 'bank-account', 'ssh-key', 'api-credential', 'database', 'server', 'wi-fi', 'software-license', 'document', 'custom-record']
 const values = types.map((type, index) => ({ type, title: `synthetic-latchkey-${100 + index}`, value: `synthetic-latchkey-${200 + index}`, custom: { label: `synthetic-latchkey-${300 + index}`, secret: `synthetic-latchkey-${400 + index}` }, attachment: { name: `synthetic-latchkey-${500 + index}`, content: `synthetic-latchkey-${600 + index}` } }))
 const objects = []
 for (const value of values) objects.push((await owner.put(vault, value)).object)
 for (let version = 2; version <= 10; version++) await owner.put(vault, { ...values[0], value: `synthetic-latchkey-${700 + version}` }, objects[0])
 const read = await owner.readVault(vault)
 assert.equal(read.versions.length, types.length + 9)
 assert.deepEqual(read.versions.find(row => row.object === objects[1]).value, values[1])
 const firstHistory = read.versions.filter(row => row.object === objects[0])
 assert.deepEqual(firstHistory.map(row => row.version), [1,2,3,4,5,6,7,8,9,10])
 const archiveKey = encode(random())
 const archive = await owner.exportVault(vault, archiveKey)
 assert.deepEqual((await VaultClient.openExport(archive, archiveKey)).versions, read.versions)
 await rejected(VaultClient.openExport(archive, encode(random())), 'cannot_decrypt')
 console.log('Vault envelopes: signup, all payload classes, encrypted metadata/attachments, ten versions and portable encrypted export passed')

 // Actual native invitation and email confirmation; no injected user session.
 const invited = await post('/auth/invite', { email: 'synthetic-latchkey-9@example.test', displayName: 'Synthetic Latchkey member', role: 'member' }, owner.cookie)
 assert.equal(invited.status, 202)
 const plainMail = mail.at(-1).content.find(content => content.type === 'text/plain').value
 const link = plainMail.match(/https:\/\/[^\s<>]+/)[0]
 const identityToken = new URL(link).searchParams.get('token')
 const member = new VaultClient(productOrigin, { fetcher: fetchProduct })
 await member.confirmIdentity(identityToken)
 const memberEnrollment = await member.register('synthetic-latchkey-10')
 await member.unlock(memberEnrollment.profile, 'synthetic-latchkey-10')
 await rejected(member.readVault(vault), 'not_found')
 const fingerprint = await digest(JSON.stringify([memberEnrollment.profile.recipientKey, memberEnrollment.profile.authorityKey]))
 await rejected(owner.share(vault, memberEnrollment.profile.account, await digest(enrolled.profile.recipientKey), ['read']), 'recipient_mismatch')
 await owner.share(vault, memberEnrollment.profile.account, fingerprint, ['read'])
 await rejected(member.readVault(vault), 'recipient_confirmation_required')
 await member.pinAccount(enrolled.profile.account, await digest(JSON.stringify([enrolled.profile.recipientKey, enrolled.profile.authorityKey])))
 assert.deepEqual((await member.readVault(vault)).versions, read.versions)
 // Audit proof uses signed public HTTP doors; raw-store writes model an attacker.
 const {requestApi}=await import('../src/latchkey/api/client.mjs');
 const auditApi=(method,path,value)=>requestApi(owner,method,'/api/latchkey/v1'+path,value);
 await Promise.all(Array.from({length:8},()=>owner.call('vaults',{})));
 const checkpoint=await auditApi('GET','/activity/checkpoint');
 assert.ok(checkpoint.length>0);
 assert.equal((await auditApi('POST','/activity/verify',{checkpoint})).valid,true);
 await rejected(member.call('audit' + '/list',{filters:{},after:0,limit:10}),'audit_owner_required');
 const {days:retentionThreshold,automaticExpiry}=await auditApi('GET','/activity/retention');
 assert.equal(retentionThreshold,365);assert.equal(automaticExpiry,false);
 const detailsBeforeRefusal=await productDb.prepare('SELECT * FROM lky_audit_details WHERE id=?').bind((await productDb.prepare('SELECT id FROM lky_audit_chain WHERE tenant=? ORDER BY sequence LIMIT 1').bind(owner.profile.tenant).first()).id).first();
 await rejected(auditApi('POST','/activity/expiry',{confirmed:false}),'audit_expiry_confirmation_required');
 assert.deepEqual(await productDb.prepare('SELECT * FROM lky_audit_details WHERE id=?').bind(detailsBeforeRefusal.id).first(),detailsBeforeRefusal);
 await rejected(requestApi(member,'POST','/api/latchkey/v1/activity/query',{filters:{},after:0,limit:10}),'audit_owner_required');
 const refusedReads=await auditApi('POST','/activity/query',{filters:{person:member.profile.account},after:0,limit:200});
 assert.ok(refusedReads.entries.filter(row=>row.result==='refused'&&row.permission==='audit').length>=2);
 const expiryRefusals=await auditApi('POST','/activity/query',{filters:{person:owner.profile.account},after:0,limit:200});
 assert.ok(expiryRefusals.entries.some(row=>row.result==='refused'&&row.retentionDays===365&&row.expiryConfirmed===false));
 const auditPage=await auditApi('POST','/activity/query',{filters:{person:owner.profile.account,vault},after:0,limit:2});
 assert.equal(auditPage.entries.length,2);assert.ok(auditPage.next);
 const auditNext=await owner.call('audit' + '/list',{filters:{person:owner.profile.account,vault},after:auditPage.next,limit:2});
 assert.ok(auditNext.entries.every(row=>row.sequence>auditPage.next));
 const revealReceipt=await owner.call('item' + '/authorize',{vault,object:objects[0],action:'reveal'});
 assert.equal(revealReceipt.authorized,'reveal');
 const reveals=await owner.call('audit' + '/list',{filters:{person:owner.profile.account,vault,item:objects[0],action:'reveal',device:owner.profile.device,from:0,to:Date.now()+60000},after:0,limit:200});
 assert.equal(reveals.entries.length,2);assert.deepEqual(reveals.entries.map(row=>row.result),['attempted','succeeded']);
 const csv=await auditApi('POST','/activity/csv',{filters:{action:'reveal',vault},after:0,limit:200});
 assert.equal(csv.count,reveals.entries.length);assert.equal(csv.csv.split('\r\n').length,csv.count+1);
 assert.ok(!JSON.stringify(reveals).includes(values[0].value));
 await rejected(owner.call('audit' + '/list',{filters:{secret:'synthetic-latchkey-90000'},after:0,limit:10}),'invalid_audit_filter');
 for(const filter of ['serviceIdentity','agent','ip'])assert.deepEqual((await owner.call('audit' + '/list',{filters:{[filter]:'synthetic-latchkey-90001'},after:0,limit:10})).entries,[]);
 const held=await owner.call('audit' + '/checkpoint',{});
 const chainRows=(await productDb.prepare('SELECT * FROM lky_audit_chain WHERE tenant=? ORDER BY sequence').bind(owner.profile.tenant).all()).results;
 const firstChain=chainRows[0],lastChain=chainRows.at(-1);
 const damaged=async(mutate,restore)=>{await mutate();try{await rejected(owner.call('audit' + '/verify',{checkpoint:held}),'audit_tampered')}finally{await restore()}};
 await damaged(()=>productDb.prepare("UPDATE lky_audit_chain SET commitment='changed' WHERE id=?").bind(firstChain.id).run(),()=>productDb.prepare('UPDATE lky_audit_chain SET commitment=? WHERE id=?').bind(firstChain.commitment,firstChain.id).run());
 await damaged(()=>productDb.prepare('DELETE FROM lky_audit_chain WHERE id=?').bind(firstChain.id).run(),()=>productDb.prepare('INSERT INTO lky_audit_chain VALUES(?,?,?,?,?,?)').bind(...Object.values(firstChain)).run());
 await damaged(()=>productDb.prepare('UPDATE lky_audit_chain SET sequence=sequence+100000 WHERE id=?').bind(firstChain.id).run(),()=>productDb.prepare('UPDATE lky_audit_chain SET sequence=? WHERE id=?').bind(firstChain.sequence,firstChain.id).run());
 await damaged(()=>productDb.prepare('DELETE FROM lky_audit_chain WHERE id=?').bind(lastChain.id).run(),()=>productDb.prepare('INSERT INTO lky_audit_chain VALUES(?,?,?,?,?,?)').bind(...Object.values(lastChain)).run());
 const insertedEvent=id();
 await damaged(()=>productDb.prepare('INSERT INTO lky_audit_chain VALUES(?,?,?,?,?,?)').bind(owner.profile.tenant,lastChain.sequence+1,insertedEvent,lastChain.hash,'synthetic-latchkey-90002','synthetic-latchkey-90003').run(),()=>productDb.prepare('DELETE FROM lky_audit_chain WHERE id=?').bind(insertedEvent).run());
 const details=await productDb.prepare('SELECT * FROM lky_audit_details WHERE id=?').bind(firstChain.id).first();
 await damaged(()=>productDb.prepare("UPDATE lky_audit_details SET facts='{}' WHERE id=?").bind(firstChain.id).run(),()=>productDb.prepare('UPDATE lky_audit_details SET facts=? WHERE id=?').bind(details.facts,firstChain.id).run());
 await rejected(owner.call('audit' + '/verify',{checkpoint:{...held,signature:'changed'}}),'audit_checkpoint_invalid');
 assert.equal((await owner.call('audit' + '/verify',{checkpoint:held})).valid,true);
 console.log('Audit HTTP journey: authenticated facts, every query field, bounded pagination, scoped CSV, owner refusal, altered, deleted and reordered history and checkpoint-anchored truncation passed');

 // People rights are independent of vault grants and enforced at native doors.
 await rejected(member.call('people' + '/preview',{csv:'email,displayName\nsynthetic-latchkey-90010@example.test,Synthetic member'}),'independent_admin_permission_required');
 await owner.call('admin' + '/permissions/set',{account:member.profile.account,permissions:['people.read','people.invite'],confirmed:true});
 assert.deepEqual((await member.call('admin' + '/permissions',{})).grants.map(row=>row.permission),['people.invite','people.read']);
 const nativeList=await fetchProduct(productOrigin+'/auth/operators',{headers:{cookie:member.cookie}});
 assert.equal(nativeList.status,200);
 const peopleCsv='email,displayName\n'+Array.from({length:25},(_,n)=>`synthetic-latchkey-${90010+n}@example.test,Synthetic person ${n}`).join('\n')+'\nSYNTHETIC-LATCHKEY-90010@example.test,Duplicate\ninvalid,Invalid';
 const peoplePlan=await member.call('people' + '/preview',{csv:peopleCsv});
 assert.equal(peoplePlan.rows.filter(row=>row.status==='ready').length,25);
 assert.equal(peoplePlan.rows.at(-2).status,'duplicate');assert.equal(peoplePlan.rows.at(-1).status,'invalid');
 await rejected(member.call('people' + '/invite',{csv:peopleCsv,previewHash:peoplePlan.previewHash,confirmed:false}),'people_confirmation_required');
 await owner.call('admin' + '/permissions/set',{account:member.profile.account,permissions:[],confirmed:true});
 await rejected(member.call('people' + '/invite',{csv:peopleCsv,previewHash:peoplePlan.previewHash,confirmed:true}),'independent_admin_permission_required');
 assert.equal((await fetchProduct(productOrigin+'/auth/operators',{headers:{cookie:member.cookie}})).status,403);
 const oneCsv='email,displayName\nsynthetic-latchkey-2200@example.test,Synthetic invitation';
 const onePreview=await owner.call('people' + '/preview',{csv:oneCsv});
 const invitedPeople=await auditApi('POST','/people/invitations',{csv:oneCsv,previewHash:onePreview.previewHash,confirmed:true});
 assert.equal(invitedPeople.rows[0].status,'accepted');
 const firstInvitation=mail.at(-1).content.find(content=>content.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0];
 await rejected(owner.call('people' + '/invite',{csv:oneCsv,previewHash:onePreview.previewHash,confirmed:true}),'people_preview_changed');
 const operators=await owner.call('api/users/list',{}),invitedOperator=operators.find(row=>row.email==='synthetic-latchkey-2200@example.test');
 await owner.call('api/users/invite',{email:invitedOperator.email,displayName:'Synthetic invitation',role:'member',returnTo:'/app/vault'});
 await owner.call('api/users/cancel-invitation',{operator:invitedOperator.id});
 await assert.rejects(new VaultClient(productOrigin,{fetcher:fetchProduct}).confirmIdentity(new URL(firstInvitation).searchParams.get('token')));
 console.log('People HTTP journey: 25-row CSV preview, duplicate and invalid rows, independent rights, live revocation at native and signed doors, explicit invite confirmation, replay refusal, resend and cancelled-link denial passed');

 const {runCompanyCustodyJourney}=await import('./latchkey-custody.mjs');await runCompanyCustodyJourney();

 await rejected(member.put(vault, values[0]), 'permission_denied')
 await rejected(member.exportVault(vault, archiveKey), 'permission_denied')
 const beforeRotation = await member.snapshot(vault)
 await owner.rotate(vault, memberEnrollment.profile.account)
 await owner.put(vault, { value: 'synthetic-latchkey-11' }, objects[0])
 await rejected(member.readVault(vault), 'not_found')
 const afterRotation = await owner.call('vault/read', { vault })
 const latest = afterRotation.versions.filter(row => row.object_id === objects[0]).at(-1)
 const oldItemKey = await itemKey(beforeRotation.key, enrolled.profile.tenant, vault, objects[0])
 await rejected(open(oldItemKey, JSON.parse(latest.envelope), { tenant: enrolled.profile.tenant, vault, object: objects[0], purpose: 'item', epoch: afterRotation.epoch, version: latest.version }), 'cannot_decrypt')
 beforeRotation.key.fill(0); oldItemKey.fill(0)
 assert.equal((await owner.readVault(vault)).versions.length, read.versions.length + 1)
 console.log('Recipient lifecycle: fingerprint confirmation, exact read-only rights, removal, atomic rekey and retained history passed')

 // Simulate a malicious storage service, not a fake client or cryptosystem.
 const originalWrap = await productDb.prepare('SELECT wrapped_key FROM lky_recipients WHERE vault_id=? AND account_id=?').bind(vault, enrolled.profile.account).first()
 const counterfeit = { ...await cryptography.wrapRecipient(random(), enrolled.profile.recipientKey, { tenant: enrolled.profile.tenant, vault, object: enrolled.profile.account, purpose: 'vault-key', epoch: 2, version: 1 }), signer: enrolled.profile.account, signature: encode(random(64)) }
 await productDb.prepare('UPDATE lky_recipients SET wrapped_key=? WHERE vault_id=? AND account_id=?').bind(JSON.stringify(counterfeit), vault, enrolled.profile.account).run()
 await rejected(owner.readVault(vault), 'invalid_key_signature')
 await rejected(owner.put(vault, { value: 'synthetic-latchkey-23' }), 'invalid_key_signature')
 await productDb.prepare('UPDATE lky_recipients SET wrapped_key=? WHERE vault_id=? AND account_id=?').bind(originalWrap.wrapped_key, vault, enrolled.profile.account).run()
 const original = await productDb.prepare('SELECT envelope FROM lky_versions WHERE vault_id=? AND object_id=? AND version=1').bind(vault, objects[0]).first()
 const altered = JSON.parse(original.envelope), ciphertext = decode(altered.ciphertext)
 ciphertext[0] ^= 1; altered.ciphertext = encode(ciphertext)
 await productDb.prepare('UPDATE lky_versions SET envelope=? WHERE vault_id=? AND object_id=? AND version=1').bind(JSON.stringify(altered), vault, objects[0]).run()
 await rejected(owner.readVault(vault), 'cannot_decrypt')
 altered.context.vault = id()
 await productDb.prepare('UPDATE lky_versions SET envelope=? WHERE vault_id=? AND object_id=? AND version=1').bind(JSON.stringify(altered), vault, objects[0]).run()
 await rejected(owner.readVault(vault), 'context_mismatch')
 await productDb.prepare('UPDATE lky_versions SET envelope=? WHERE vault_id=? AND object_id=? AND version=1').bind(original.envelope, vault, objects[0]).run()
 const invalid = JSON.parse(original.envelope); invalid.context.tenant = id()
 const revision = (await owner.call('vault/read', { vault })).revision
 await rejected(owner.call('item/put', { vault, object: id(), version: 1, revision, envelope: invalid }), 'request_refused')
 assert.equal((await owner.call('vault/read', { vault })).revision, revision)
 const replay = traces.at(-1)
 assert.equal((await dispatchProduct(replay.url, replay.request)).status, 409)
 const stalePath = '/api/latchkey/vaults', staleBody = '{}', staleNonce = id(), staleTime = String(Date.now() - 120000)
 const stale = await dispatchProduct(productOrigin + stalePath, { method: 'POST', headers: { host: new URL(productOrigin).host, origin: productOrigin, 'content-type': 'application/json', cookie: owner.cookie, 'x-latchkey-grant': owner.token, 'x-latchkey-nonce': staleNonce, 'x-latchkey-time': staleTime, 'x-latchkey-signature': await sign(owner.bundle.signing.privateKey, signingText('POST', stalePath, owner.token, staleNonce, staleTime, await digest(staleBody))) }, body: staleBody })
 assert.equal(stale.status, 401)
 const signed = traces.at(-1).request
 assert.equal((await dispatchProduct(replay.url, { ...signed, body: JSON.stringify({ vault: id() }) })).status, 403)
 const crossOrigin = await dispatchProduct(productOrigin + '/api/latchkey/account', { method: 'POST', headers: { host: new URL(productOrigin).host, origin: 'https://synthetic-latchkey-12.test', 'content-type': 'application/json', cookie: owner.cookie }, body: '{}' })
 assert.equal(crossOrigin.status, 403)
 await rejected(new VaultClient(productOrigin, { fetcher: fetchProduct }).unlock(enrolled.profile, 'synthetic-latchkey-13'), 'authentication_failed')
 const untrusted = new VaultClient(productOrigin, { cookie: owner.cookie, fetcher: fetchProduct })
 await rejected(untrusted.request('vaults', {}), 'invalid_input')
 await rejected(untrusted.unlock({ ...enrolled.profile, deviceSecret: encode(random()) }, password), 'cannot_decrypt')
 const race = await Promise.allSettled([owner.put(vault, { value: 'synthetic-latchkey-14' }), owner.put(vault, { value: 'synthetic-latchkey-15' })])
 assert.equal(race.filter(row => row.status === 'fulfilled').length, 1)
 assert.equal(race.find(row => row.status === 'rejected').reason.code, 'version_conflict')
 console.log('Tamper and authority: ciphertext/context rejection, stale writes, request replay/signature/origin checks and password/session-only refusal passed')

 const pendingClient = new VaultClient(productOrigin, { fetcher: fetchProduct })
 const pending = await pendingClient.beginEnrollment(enrolled.profile, password)
 await rejected(owner.approveEnrollment(pending.device, await digest('synthetic-latchkey-16')), 'enrollment_mismatch')
 await rejected(pendingClient.request('vaults', {}, owner.bundle.signing.privateKey), 'enrollment_only')
 await owner.approveEnrollment(pending.device, pending.fingerprint)
 const secondProfile = await pendingClient.completeEnrollment(pending.profile, password)
 const second = new VaultClient(productOrigin, { fetcher: fetchProduct })
 await second.unlock(secondProfile, password)
 assert.ok((await second.readVault(vault)).versions.length > types.length)
 await owner.call('device/revoke', { device: secondProfile.device })
 await rejected(second.call('vaults', {}), 'authority_expired')
 await rejected(second.unlock(secondProfile, password), 'authentication_failed')
 await productDb.prepare('UPDATE lky_grants SET expires_at=? WHERE token_hash=?').bind(Date.now() - 1, await digest(owner.token)).run()
 await rejected(owner.call('vaults', {}), 'authority_expired')
 await owner.unlock(enrolled.profile, password)
 const signedOut = await post('/auth/signout', {}, owner.cookie)
 assert.equal(signedOut.status, 204)
 await rejected(owner.call('vaults', {}), 'authentication_required')
 await owner.unlock(enrolled.profile, password)
 const recoveryClient = new VaultClient(productOrigin, { fetcher: fetchProduct })
 await rejected(recoveryClient.recover(enrolled.kit, 'synthetic-latchkey-17'), 'authentication_failed')
 await rejected(recoveryClient.recover({ ...enrolled.kit, recoverySecret: encode(random()) }, password), 'cannot_decrypt')
 const recovered = await recoveryClient.recover(enrolled.kit, password)
 await rejected(owner.call('vaults', {}), 'authority_expired')
 await rejected(owner.unlock(enrolled.profile, password), 'authentication_failed')
 await rejected(recoveryClient.recover(enrolled.kit, password), 'kit_revoked')
 await owner.unlock(recovered.profile, password)
 assert.ok((await owner.readVault(vault)).versions.some(row => row.value.value === 'synthetic-latchkey-11'))
 const events = await owner.call('audit', {})
 for (const action of ['account_enrolled', 'vault_created', 'item_written', 'vault_shared', 'vault_rotated', 'device_approved', 'device_enrolled', 'device_revoked', 'account_recovered']) assert.ok(events.some(event => event.action === action), action)
 console.log('Device/account lifecycle: verified second-device enrollment, revocation, expiry, sign-out, two-factor recovery and old-kit rejection passed')

 const runtimeKey = encode(random())
 const machineProfile = await MachineClient.create(productOrigin, runtimeKey)
 const machineIdentity = await MachineClient.identity(machineProfile)
 await rejected(owner.grantMachine(vault, objects[0], machineIdentity, await digest('synthetic-latchkey-22')), 'recipient_mismatch')
 const machineGrant = await owner.grantMachine(vault, objects[0], machineIdentity, machineIdentity.fingerprint)
 assert.deepEqual(await MachineClient.read(machineProfile, machineGrant, runtimeKey, { fetcher: fetchProduct }), { value: 'synthetic-latchkey-11' })
 await rejected(MachineClient.read(machineProfile, machineGrant, encode(random()), { fetcher: fetchProduct }), 'cannot_decrypt')
 await rejected(MachineClient.read(machineProfile, { ...machineGrant, object: objects[1] }, runtimeKey, { fetcher: fetchProduct }), 'context_mismatch')
 await owner.call('machine/revoke', { machine: machineIdentity.machine })
 await rejected(MachineClient.read(machineProfile, machineGrant, runtimeKey, { fetcher: fetchProduct }), 'machine_authority_expired')
 const secondMachine = await MachineClient.create(productOrigin, runtimeKey), secondIdentity = await MachineClient.identity(secondMachine)
 const secondGrant = await owner.grantMachine(vault, objects[0], secondIdentity, secondIdentity.fingerprint)
 await owner.rotate(vault)
 await rejected(MachineClient.read(secondMachine, secondGrant, runtimeKey, { fetcher: fetchProduct }), 'machine_authority_expired')
 const thirdMachine = await MachineClient.create(productOrigin, runtimeKey), thirdIdentity = await MachineClient.identity(thirdMachine)
 const thirdGrant = await owner.grantMachine(vault, objects[0], thirdIdentity, thirdIdentity.fingerprint)
 await productDb.prepare('UPDATE lky_machines SET expires_at=? WHERE id=?').bind(Date.now() - 1, thirdIdentity.machine).run()
 await rejected(MachineClient.read(thirdMachine, thirdGrant, runtimeKey, { fetcher: fetchProduct }), 'machine_authority_expired')
 console.log('Machine-runtime custody: explicit item-key wrap, private runtime profile, exact object context, expiry, revoke and rotation fences passed')
 const passwordChanged = await owner.changePassword('synthetic-latchkey-21')
 await rejected(new VaultClient(productOrigin, { fetcher: fetchProduct }).unlock(passwordChanged.profile, password), 'authentication_failed')
 await owner.unlock(passwordChanged.profile, 'synthetic-latchkey-21')
 assert.ok((await owner.readVault(vault)).versions.some(row => row.value.value === 'synthetic-latchkey-11'))
 await rejected(new VaultClient(productOrigin, { fetcher: fetchProduct }).unlock(recovered.profile, password), 'authentication_failed')
 console.log('Password lifecycle: fresh PAKE record and local factors, old-device/old-password exclusion and preserved encrypted values passed')
 const { runTypedItemJourneys } = await import('./latchkey-items.mjs')
 const typedPrivateValues = await runTypedItemJourneys({ owner, vault, reader: member })
 const { runSharingJourneys } = await import('./latchkey-sharing.mjs')
 const sharingPrivateValues = await runSharingJourneys({ owner, member, db: productDb, mail, fetcher: fetchProduct })
 const { runGeneratorPolicyJourneys } = await import('./latchkey-generator-policy.mjs')
 const policyPrivateValues = await runGeneratorPolicyJourneys({ owner, member, db: productDb })
 // The shipped command is also exercised in a separate Node process over
 // HTTPS; no secret is passed in argv or inherited environment.
 const cliDirectory = await mkdtemp(join(tmpdir(), 'latchkey-client-'))
 const cliPrivateValues = []
 const runCli = async (command, input, expected = 0) => {
  const child = spawn(process.execPath, ['scripts/latchkey.mjs', command], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_EXTRA_CA_CERTS: join(tlsDirectory, 'cert.pem') } })
  let output = '', errors = ''
  child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { errors += chunk })
  child.stdin.end(JSON.stringify(input))
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  assert.equal(code, expected, errors)
  for (const secret of ['synthetic-latchkey-24', 'synthetic-latchkey-25', input.password, input.newPassword, input.runtimeKey, input.exportKey].filter(Boolean)) assert.ok(!output.includes(secret) && !errors.includes(secret), 'CLI output must not contain input secrets')
  if (expected) { assert.equal(output, ''); return JSON.parse(errors) }
  return JSON.parse(output)
 }
 try {
  const invite = await post('/auth/invite', { email: 'synthetic-latchkey-26@example.test', displayName: 'Synthetic CLI member', role: 'member' }, owner.cookie)
  assert.equal(invite.status, 202)
  const email = mail.at(-1).content.find(content => content.type === 'text/plain').value
  const identityToken = new URL(email.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token')
  const profile = join(cliDirectory, 'device.json'), kit = join(cliDirectory, 'kit.json'), cliPassword = 'synthetic-latchkey-27'
  await runCli('register', { origin: productOrigin, identityToken, password: cliPassword, profile, kit })
  assert.equal((await stat(profile)).mode & 0o777, 0o600); assert.equal((await stat(kit)).mode & 0o777, 0o600)
  const created = await runCli('vault-create', { profile, password: cliPassword })
  const value = { title: 'synthetic-latchkey-24', value: 'synthetic-latchkey-25' }
  const written = await runCli('put', { profile, password: cliPassword, vault: created.vault, value })
  const output = join(cliDirectory, 'value.json')
  await runCli('read', { profile, password: cliPassword, vault: created.vault, output })
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')).versions[0].value, value)
  assert.equal((await stat(output)).mode & 0o777, 0o600)
  await runCli('read', { profile, password: 'synthetic-latchkey-28', vault: created.vault, output: join(cliDirectory, 'denied.json') }, 1)
  const encrypted = join(cliDirectory, 'archive.json'), opened = join(cliDirectory, 'archive-open.json')
  await runCli('export', { profile, password: cliPassword, vault: created.vault, exportKey: archiveKey, output: encrypted })
  await runCli('archive-open', { archive: encrypted, exportKey: archiveKey, output: opened })
  assert.deepEqual(JSON.parse(await readFile(opened, 'utf8')).versions[0].value, value)
  const machineProfile = join(cliDirectory, 'machine.json'), grantPath = join(cliDirectory, 'grant.json')
  const identity = await runCli('runtime-keygen', { origin: productOrigin, runtimeKey, machineProfile })
  await runCli('runtime-grant', { profile, password: cliPassword, vault: created.vault, object: written.object, identity, fingerprint: identity.fingerprint, output: grantPath })
  const runtimeOutput = join(cliDirectory, 'runtime.json')
  await runCli('runtime-read', { machineProfile, grant: grantPath, runtimeKey, output: runtimeOutput })
  assert.deepEqual(JSON.parse(await readFile(runtimeOutput, 'utf8')), value)
  await runCli('runtime-revoke', { profile, password: cliPassword, machine: identity.machine })
  assert.equal((await runCli('runtime-read', { machineProfile, grant: grantPath, runtimeKey, output: join(cliDirectory, 'runtime-denied.json') }, 1)).error, 'machine_authority_expired')
  const fileProfile = JSON.parse(await readFile(profile, 'utf8')), fileKit = JSON.parse(await readFile(kit, 'utf8'))
  cliPrivateValues.push(cliPassword, fileProfile.deviceSecret, fileKit.recoverySecret, value.title, value.value)
  const typed = await runCli('item-save', { profile, password: cliPassword, vault: created.vault, type: 'login', value: { title: 'synthetic-latchkey-902', values: { username: 'synthetic-latchkey-903', password: 'synthetic-latchkey-904' }, fields: [{id:'recovery',label:'Recovery',type:'secret',secret:true,value:'synthetic-latchkey-905'}] }, attachments: [{name:'synthetic-latchkey-906.txt',bytes:[1,2,3],mediaType:'text/plain'}] })
  const historyFile = join(cliDirectory, 'typed-history.json')
  await runCli('item-history', { profile, password: cliPassword, vault: created.vault, object: typed.object, output: historyFile })
  assert.equal(JSON.parse(await readFile(historyFile, 'utf8'))[0].value.fields.find(field => field.id === 'password').value, 'synthetic-latchkey-904')
  const generatedFile = join(cliDirectory, 'generated.json'), generatorHistory = join(cliDirectory, 'generator-history.json')
  const generatorPolicy = await runCli('generator-policy', {profile,password:cliPassword})
  await runCli('generate', { profile, password: cliPassword, acknowledgedRetentionDays: generatorPolicy.history.days, history: generatorHistory, output: generatedFile })
  const generated = JSON.parse(await readFile(generatedFile, 'utf8'))
  assert.ok(generated.value.length >= 20)
  await runCli('generator-clear', {profile,password:cliPassword,history:generatorHistory})
  const clearedFile=join(cliDirectory,'generator-cleared.json')
  await runCli('generator-history', {profile,password:cliPassword,history:generatorHistory,output:clearedFile})
  assert.deepEqual(JSON.parse(await readFile(clearedFile,'utf8')),[])
  cliPrivateValues.push(generated.value,'synthetic-latchkey-902','synthetic-latchkey-903','synthetic-latchkey-904','synthetic-latchkey-905','synthetic-latchkey-906')
  console.log('Shipped CLI: native-token registration, private custody files, encrypted write/read/export, local archive open and scoped runtime use/revoke passed')
 } finally { await rm(cliDirectory, { recursive: true, force: true }) }

 // The source owner explicitly promotes the receiving person before export.
 // A real email step-up, through the permitted SendGrid edge, authorizes it.
 const stepUp = await post('/auth/step-up', { action: 'owner:transfer', returnTo: '/app' }, owner.cookie)
 assert.equal(stepUp.status, 202, await stepUp.clone().text())
 const stepMail = mail.at(-1).content.find(content => content.type === 'text/plain').value
 const stepToken = new URL(stepMail.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token')
 assert.equal((await post('/auth/confirm', { token: stepToken }, owner.cookie)).status, 303)
 const people = await body(await fetchProduct(productOrigin + '/auth/operators', { headers: { cookie: owner.cookie } }))
 const receivingPerson = people.find(person => person.email === 'synthetic-latchkey-9@example.test')
 assert.ok(receivingPerson)
 assert.equal((await post('/auth/operator/role', { operatorId: receivingPerson.id, role: 'owner' }, owner.cookie)).status, 200)
 await member.unlock(memberEnrollment.profile, 'synthetic-latchkey-10')
 const { default: archivePolicy } = await import('../scripts/latchkey/archive-policy.mjs')
 const { createPortability } = await import('../node_modules/@runeditrun/rer/modules/portability/index.mjs')
 const records = await createPortability({ db: productDb, policy: archivePolicy })
 const { runItemErasureJourneys, refuseErasedArchive } = await import('./latchkey-erasure.mjs')
 const erasureProof = await runItemErasureJourneys({ owner, member, db: productDb, records, mail, ownerPassword: 'synthetic-latchkey-21', fetcher: fetchProduct })
 const { runSubjectErasureJourneys } = await import('./latchkey-subject-erasure.mjs');
 const subjectProof = await runSubjectErasureJourneys({ owner, db: productDb, records, mail, post, fetcher: fetchProduct, erasureSecret: bindings.LATCHKEY_ERASURE_SECRET });
 assert.equal((await owner.call('audit' + '/verify',{checkpoint:held})).valid,true);
 // A member’s separately owned personal vault is archived as ciphertext,
 // without giving the company owner or a newly restored owner its keys.
 const personalVault = (await member.createVault()).vault;
 const personalAttachment = { name: 'synthetic-latchkey-1400', content: 'synthetic-latchkey-1401' };
 const personalItem = await member.put(personalVault, { ownership: 'personal', title: 'synthetic-latchkey-1402', secret: 'synthetic-latchkey-1403', attachment: personalAttachment });
 await member.put(personalVault, { ownership: 'personal', title: 'synthetic-latchkey-1402', secret: 'synthetic-latchkey-1404', attachment: personalAttachment }, personalItem.object);
 await rejected(owner.readVault(personalVault), 'not_found');
 const personalVersions = (await member.readVault(personalVault)).versions;
 const backupId = await records.exports.create('synthetic-latchkey-29')
 let backupStatus = await records.exports.status(backupId)
 for (let count = 0; backupStatus.phase !== 'complete' && count < 20; count++) backupStatus = await records.exports.advance(backupId, { maxParts: 100 })
 assert.equal(backupStatus.phase, 'complete')
 const backup = await new Response(await records.exports.download(backupId)).text()
 const recordsDirectory = await mkdtemp(join(tmpdir(), 'latchkey-records-cli-'));
 try {
  const input = join(recordsDirectory, 'records.jsonl'), encrypted = join(recordsDirectory, 'records.lky'), output = join(recordsDirectory, 'restored.jsonl');
  await writeFile(input, backup, { mode: 0o600 });
  await runCli('records-seal', { input, output: encrypted, exportKey: archiveKey });
  await runCli('records-open', { input: encrypted, output: join(recordsDirectory, 'wrong.jsonl'), exportKey: encode(random()) }, 1);
  await assert.rejects(stat(join(recordsDirectory, 'wrong.jsonl')), { code: 'ENOENT' });
  await runCli('records-open', { input: encrypted, output, exportKey: archiveKey });
  assert.equal(await readFile(output, 'utf8'), backup);
  console.log('Records CLI: real encrypted backup round trip, wrong key refusal and no partial destination passed');
 } finally { await rm(recordsDirectory, { recursive: true, force: true }); }
 const backupLines = backup.trim().split('\n').map(line => JSON.parse(line)), manifest = backupLines[0], closing = backupLines.at(-1)
 assert.ok(manifest.tables.some(table => table.name === 'lky_versions'))
 for (const table of ['lky_devices', 'lky_grants', 'lky_exchanges', 'lky_enrollments', 'lky_machines']) assert.ok(manifest.excludedTables.includes(table))
 const restoreSocket = createServer(); await new Promise(resolve => restoreSocket.listen(0, '127.0.0.1', resolve)); const restorePort = restoreSocket.address().port; await new Promise(resolve => restoreSocket.close(resolve))
 const restoreOrigin = `https://127.0.0.1:${restorePort}`
 let restoredServerState = ''
 const restore = new Miniflare(convertV4MiniflareOptions({ ...tls, host: '127.0.0.1', port: restorePort, modules: workerModules, modulesRoot: join(process.cwd(), 'dist/server'), compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'synthetic-latchkey-30' }, bindings: { ...bindings, AUTH_ORIGIN: restoreOrigin }, log: new Log(LogLevel.ERROR) }))
 try {
  const restoreDb = await restore.getD1Database('DB')
  for (const migration of (await readdir('migrations/core')).filter(name => name.endsWith('.sql')).sort()) await restoreDb.batch(unstable_splitSqlQuery(await readFile(join('migrations/core', migration), 'utf8')).map(sql => restoreDb.prepare(sql)))
  const destination = await createPortability({ db: restoreDb, policy: archivePolicy })
  await refuseErasedArchive({ destination, ...erasureProof });
  await refuseErasedArchive({ destination, ...subjectProof, subjectRedaction: true });
  assert.equal((await restoreDb.prepare('SELECT COUNT(*) AS n FROM lky_versions').first()).n, 0);
  const imported = await destination.imports.create(manifest, 'synthetic-latchkey-31')
  for (const part of backupLines.slice(1, -1)) await destination.imports.uploadPart(imported, part.index, part)
  const restored = await destination.imports.finalize(imported, { contentHash: closing.contentHash, archiveHash: closing.archiveHash })
  assert.equal(restored.phase, 'complete')
  assert.equal((await restoreDb.prepare('SELECT COUNT(*) AS total FROM lky_versions').first()).total, (await productDb.prepare('SELECT COUNT(*) AS total FROM lky_versions').first()).total)
  assert.ok((await restoreDb.prepare('SELECT rights FROM lky_recipients').all()).results.every(row => row.rights === '[]'))
  for (const table of ['lky_devices', 'lky_grants', 'lky_machines']) assert.equal((await restoreDb.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first()).total, 0)
  const recipient = new VaultClient(restoreOrigin, { fetcher: fetchProduct })
  const destinationKit = { ...memberEnrollment.kit, origin: restoreOrigin }
  const destinationEnrollment = await recipient.recover(destinationKit, 'synthetic-latchkey-10')
  await recipient.unlock(destinationEnrollment.profile, 'synthetic-latchkey-10')
  const expectedVersions = {}
  for (const row of await owner.call('vaults', {})) if (row.owner === owner.profile.account) {
   try { expectedVersions[row.id] = (await owner.readVault(row.id)).versions; }
   catch(error) { const seen = owner.profile.seen[row.id]; throw new Error(`Source checkpoint epoch/revision ${row.epoch}/${row.revision} follows ${seen?.epoch}/${seen?.revision}`, { cause: error }); }
  }
  const { exerciseRecordsRestore } = await import('./latchkey-restore.mjs')
  const transferred = await exerciseRecordsRestore({ archive: backup, sourceClient: owner, destinationClient: recipient, expectedVersions });
  assert.ok(!transferred.vaults.some(row => row.vault === personalVault));
  assert.ok(transferred.unapprovedVaults.includes(personalVault));
  await rejected(recipient.readVault(personalVault), 'permission_denied');
  const preservedPersonal = (await restoreDb.prepare('SELECT version,envelope FROM lky_versions WHERE vault_id=? ORDER BY version').bind(personalVault).all()).results;
  const originalPersonal = (await productDb.prepare('SELECT version,envelope FROM lky_versions WHERE vault_id=? ORDER BY version').bind(personalVault).all()).results;
  assert.deepEqual(preservedPersonal, originalPersonal);assert.equal(preservedPersonal.length, personalVersions.length);
  const reexport = await destination.exports.create('synthetic-latchkey-94')
  let reexportStatus = await destination.exports.status(reexport)
  while (reexportStatus.phase !== 'complete') reexportStatus = await destination.exports.advance(reexport, { maxParts: 100 })
  const reexportLines = (await new Response(await destination.exports.download(reexport)).text()).trim().split('\n').map(line => JSON.parse(line))
  const reexportManifest = reexportLines[0]
  assert.deepEqual(reexportManifest.tables.map(table => table.name).sort(), manifest.tables.map(table => table.name).sort())
  assert.equal(reexportManifest.tables.find(table => table.name === 'lky_versions').count, manifest.tables.find(table => table.name === 'lky_versions').count)
  const restoredTables = (await restoreDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*'").all()).results
  const state = {}; for (const table of restoredTables) state[table.name] = (await restoreDb.prepare(`SELECT * FROM "${table.name.replaceAll('"','""')}"`).all()).results
  restoredServerState = JSON.stringify(state)
  recipient.lock()
  console.log('Destination restore: actual Base import, separate receiving owner recovery, independently approved key rewrap, inactive history, atomic activation and complete domain re-export passed')

 } finally { await restore.dispose() }
 console.log('Records backup: encrypted values/history preserved, live device/grant/runtime authority omitted and restored recipient rights inactive')
 const otherSocket = createServer(); await new Promise(resolve => otherSocket.listen(0, '127.0.0.1', resolve)); const otherPort = otherSocket.address().port; await new Promise(resolve => otherSocket.close(resolve))
 const otherOrigin = `https://127.0.0.1:${otherPort}`
 const otherProduct = new Miniflare(convertV4MiniflareOptions({ ...tls, host: '127.0.0.1', port: otherPort, modules: workerModules, modulesRoot: join(process.cwd(), 'dist/server'), compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'synthetic-latchkey-19' }, bindings: { ...bindings, AUTH_ORIGIN: otherOrigin }, log: new Log(LogLevel.ERROR) }))
 try {
  const otherDb = await otherProduct.getD1Database('DB')
  for (const migration of (await readdir('migrations/core')).filter(name => name.endsWith('.sql')).sort()) await otherDb.batch(unstable_splitSqlQuery(await readFile(join('migrations/core', migration), 'utf8')).map(sql => otherDb.prepare(sql)))
  await otherProduct.ready
  const boot = await fetch(otherOrigin + '/auth/bootstrap', { method: 'POST', headers: { host: new URL(otherOrigin).host, origin: otherOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ token: bindings.SETUP_TOKEN, displayName: 'Synthetic other owner' }), dispatcher, redirect: 'manual' })
  assert.equal(boot.status, 303)
  const other = new VaultClient(otherOrigin, { cookie: boot.headers.get('set-cookie').split(';')[0], fetcher: (url, init) => fetch(url, { ...init, dispatcher }) })
  const otherAccount = await other.register('synthetic-latchkey-20')
  await other.unlock(otherAccount.profile, 'synthetic-latchkey-20')
  assert.notEqual(otherAccount.profile.tenant, recovered.profile.tenant)
  await rejected(other.readVault(vault), 'not_found')
  const otherVault = (await other.createVault()).vault, otherObject = (await other.put(otherVault, values[0])).object
  const transplanted = JSON.parse(original.envelope)
  transplanted.context = { ...transplanted.context, tenant: otherAccount.profile.tenant, vault: otherVault, object: otherObject, epoch: 1, version: 1 }
  await otherDb.prepare('UPDATE lky_versions SET envelope=? WHERE vault_id=? AND object_id=?').bind(JSON.stringify(transplanted), otherVault, otherObject).run()
  await rejected(other.readVault(otherVault), 'cannot_decrypt')
 } finally { await otherProduct.dispose() }
 console.log('Tenant isolation: independent installations, foreign-vault denial and rewritten-context ciphertext transplant rejection passed')

 // Inspect every table, the client-produced encrypted backup, all legitimate
 // client API request/response payloads, and captured runtime error/log records.
 const serverState = JSON.stringify(await dump())
 const inspected = [serverState, restoredServerState, JSON.stringify(archive), JSON.stringify(traces), JSON.stringify(runtimeLogs), backup]
 const privateValues = ['synthetic-latchkey-2310','synthetic-latchkey-2311','synthetic-latchkey-2312','synthetic-latchkey-2313','synthetic-latchkey-2301','synthetic-latchkey-2302','synthetic-latchkey-2303','synthetic-latchkey-1400', 'synthetic-latchkey-1401', 'synthetic-latchkey-1402', 'synthetic-latchkey-1403', 'synthetic-latchkey-1404', ...subjectProof.privateValues, ...policyPrivateValues, ...erasureProof.privateValues, ...sharingPrivateValues, ...typedPrivateValues, ...cliPrivateValues, runtimeKey, 'synthetic-latchkey-21', password, 'synthetic-latchkey-10', enrolled.profile.deviceSecret, enrolled.kit.recoverySecret, recovered.profile.deviceSecret, recovered.kit.recoverySecret, owner.bundle.root.recipient.privateKey, owner.bundle.root.recovery.privateKey, owner.bundle.root.authority.privateKey, owner.bundle.signing.privateKey, archiveKey, ...values.flatMap(value => [value.title, value.value, value.custom.label, value.custom.secret, value.attachment.name, value.attachment.content])]
 for (const [index, secret] of privateValues.entries()) for (let channel = 0; channel < inspected.length; channel++) {
  const locations = channel === 0 && inspected[channel].includes(secret) ? Object.entries(JSON.parse(serverState)).flatMap(([table, rows]) => [...new Set(rows.flatMap(row => Object.entries(row).filter(([, value]) => String(value).includes(secret)).map(([column]) => `${table}.${column}`)))]) : [];
  assert.ok(!inspected[channel].includes(secret), `private fixture ${index} in channel ${channel}; columns ${locations.join(',')}`)
 }
 const nonces = (await productDb.prepare('SELECT envelope FROM lky_versions').all()).results.map(row => JSON.parse(row.envelope).nonce)
 assert.equal(new Set(nonces).size, nonces.length)
 console.log('Leakage inspection: complete D1 table dump, encrypted archive, wire payloads and captured runtime logs contain no tested values, sensitive metadata or client private keys')
} finally {
 await product.dispose()
 await dispatcher.close()
 await rm(tlsDirectory, { recursive: true, force: true })
}
