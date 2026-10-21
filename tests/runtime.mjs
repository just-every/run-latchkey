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
}

// Product journeys use the emitted Worker, its actual D1 schema, WebCrypto and
// OPAQUE on both ends. Only the SendGrid network edge is substituted, using its
// published v3 JSON request and HTTP 202 acceptance response.
const { createRequire } = await import('node:module')
const { readdir } = await import('node:fs/promises')
const fromWrangler = createRequire(import.meta.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = fromWrangler('miniflare')
const { VaultClient } = await import('../src/latchkey/client.mjs')
const cryptography = await import('../src/latchkey/crypto/envelope.mjs')
const { bytes, decode, digest, encode, id, open, random, signingText, sign, itemKey } = cryptography
const mail = [], traces = [], runtimeLogs = []
const productOrigin = 'https://synthetic-latchkey-1.test'
const bindings = { AUTH_ORIGIN: productOrigin, OWNER_EMAIL: 'synthetic-latchkey-1@example.test', SESSION_SECRET: 'synthetic-latchkey-2'.repeat(3), SETUP_TOKEN: 'synthetic-latchkey-3'.repeat(3), MAIL_PROVIDER: 'sendgrid', MAIL_API_KEY: 'synthetic-latchkey-4', MAIL_FROM: 'synthetic-latchkey-5@example.test' }
const workerModules = [{ type: 'ESModule', path: join(process.cwd(), 'dist/server/index.js') }, ...(await readdir('dist/server/assets')).filter(name => /\.(?:js|wasm)$/.test(name)).map(name => ({ type: name.endsWith('.wasm') ? 'CompiledWasm' : 'ESModule', path: join(process.cwd(), 'dist/server/assets', name) }))]
const product = new Miniflare(convertV4MiniflareOptions({
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
let productDb
const fetchProduct = async (url, init) => {
 const result = await product.dispatchFetch(url, init)
 traces.push({ url, request: init, status: result.status, response: await result.clone().text() })
 return result
}
const post = (route, value, cookie = '') => product.dispatchFetch(productOrigin + route, { method: 'POST', headers: { origin: productOrigin, 'content-type': 'application/json', cookie }, body: JSON.stringify(value), redirect: 'manual' })
const body = async response => { assert.ok(response.ok, `${response.status}: ${await response.clone().text()}`); return response.json() }
const rejected = (promise, code) => assert.rejects(promise, error => error.message === code)
const dump = async () => {
 const tables = (await productDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results
 const result = {}
 for (const table of tables) result[table.name] = (await productDb.prepare(`SELECT * FROM "${table.name.replaceAll('"', '""')}"`).all()).results
 return result
}
try {
 productDb = await product.getD1Database('DB')
 for (const migration of (await readdir('migrations/core')).filter(name => name.endsWith('.sql')).sort()) await productDb.exec(await readFile(join('migrations/core', migration), 'utf8'))
 const bootstrap = await post('/auth/bootstrap', { token: bindings.SETUP_TOKEN, displayName: 'Synthetic Latchkey owner' })
 assert.equal(bootstrap.status, 303)
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
 const fingerprint = await digest(memberEnrollment.profile.recipientKey)
 await rejected(owner.share(vault, memberEnrollment.profile.account, await digest(enrolled.profile.recipientKey), ['read']), 'recipient_mismatch')
 await owner.share(vault, memberEnrollment.profile.account, fingerprint, ['read'])
 assert.deepEqual((await member.readVault(vault)).versions, read.versions)
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
 assert.equal((await product.dispatchFetch(replay.url, replay.request)).status, 409)
 const stalePath = '/api/latchkey/vaults', staleBody = '{}', staleNonce = id(), staleTime = String(Date.now() - 120000)
 const stale = await product.dispatchFetch(productOrigin + stalePath, { method: 'POST', headers: { origin: productOrigin, 'content-type': 'application/json', cookie: owner.cookie, 'x-latchkey-grant': owner.token, 'x-latchkey-nonce': staleNonce, 'x-latchkey-time': staleTime, 'x-latchkey-signature': await sign(owner.bundle.signing.privateKey, signingText('POST', stalePath, owner.token, staleNonce, staleTime, await digest(staleBody))) }, body: staleBody })
 assert.equal(stale.status, 401)
 const signed = traces.at(-1).request
 assert.equal((await product.dispatchFetch(replay.url, { ...signed, body: JSON.stringify({ vault: id() }) })).status, 403)
 const crossOrigin = await product.dispatchFetch(productOrigin + '/api/latchkey/account', { method: 'POST', headers: { origin: 'https://synthetic-latchkey-12.test', 'content-type': 'application/json', cookie: owner.cookie }, body: '{}' })
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

 const otherOrigin = 'https://synthetic-latchkey-18.test'
 const otherProduct = new Miniflare(convertV4MiniflareOptions({ modules: workerModules, modulesRoot: join(process.cwd(), 'dist/server'), compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'synthetic-latchkey-19' }, bindings: { ...bindings, AUTH_ORIGIN: otherOrigin }, log: new Log(LogLevel.ERROR) }))
 try {
  const otherDb = await otherProduct.getD1Database('DB')
  for (const migration of (await readdir('migrations/core')).filter(name => name.endsWith('.sql')).sort()) await otherDb.exec(await readFile(join('migrations/core', migration), 'utf8'))
  const boot = await otherProduct.dispatchFetch(otherOrigin + '/auth/bootstrap', { method: 'POST', headers: { origin: otherOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ token: bindings.SETUP_TOKEN, displayName: 'Synthetic other owner' }) })
  assert.equal(boot.status, 303)
  const other = new VaultClient(otherOrigin, { cookie: boot.headers.get('set-cookie').split(';')[0], fetcher: otherProduct.dispatchFetch.bind(otherProduct) })
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
 const inspected = [serverState, JSON.stringify(archive), JSON.stringify(traces), JSON.stringify(runtimeLogs)]
 const privateValues = [password, 'synthetic-latchkey-10', enrolled.profile.deviceSecret, enrolled.kit.recoverySecret, recovered.profile.deviceSecret, recovered.kit.recoverySecret, owner.bundle.root.recipient.privateKey, owner.bundle.root.recovery.privateKey, owner.bundle.signing.privateKey, archiveKey, ...values.flatMap(value => [value.title, value.value, value.custom.label, value.custom.secret, value.attachment.name, value.attachment.content])]
 for (const secret of privateValues) for (let channel = 0; channel < inspected.length; channel++) assert.ok(!inspected[channel].includes(secret), `plaintext or private key in channel ${channel}`)
 const nonces = (await productDb.prepare('SELECT envelope FROM lky_versions').all()).results.map(row => JSON.parse(row.envelope).nonce)
 assert.equal(new Set(nonces).size, nonces.length)
 console.log('Leakage inspection: complete D1 table dump, encrypted archive, wire payloads and captured runtime logs contain no tested values, sensitive metadata or client private keys')
} finally {
 await product.dispose()
}
