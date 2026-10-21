import * as opaque from '@serenity-kit/opaque'
import { bytes, digest, encode, id, publicKey, random, signingText, validateEnvelope, verify, type Context } from './crypto/envelope.mjs'
import type { Bindings } from '../auth.server'
import type { OperatorAuth, Session } from '../modules/operator-auth/index.mjs'

type Row = Record<string, any>
class Refusal extends Error { constructor(readonly code: string, readonly status = 400) { super(code) } }
function refuse(code: string, status = 400): never { throw new Refusal(code, status) }
const identifier = (value: unknown): string => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) ? value : refuse('invalid_identifier')
const string = (value: unknown, max = 4096): string => typeof value === 'string' && value.length > 0 && value.length <= max ? value : refuse('invalid_input')
const exact = (value: Row, keys: string[]) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== keys.sort().join()) refuse('invalid_fields') }
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : refuse('invalid_version')
const rightsList = ['read', 'create', 'edit', 'export', 'share', 'rotate']
const rights = (value: unknown) => {
 if (!Array.isArray(value) || !value.length || value.length > rightsList.length || new Set(value).size !== value.length || value.some(x => !rightsList.includes(x))) refuse('invalid_rights')
 return value as string[]
}
const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'" }
const response = (value: unknown, status = 200, cookie?: string) => Response.json(value, { status, headers: { ...headers, ...(cookie ? { 'set-cookie': cookie } : {}) } })
const binding = (tenant: string, vault: string, object: string, purpose: string, epoch: number, version = 1): Context => ({ tenant, vault, object, purpose, epoch, version })
const envString = (value: unknown) => JSON.stringify(value)

export async function latchkeyResponse(request: Request, env: Bindings, auth: OperatorAuth): Promise<Response | null> {
 const url = new URL(request.url)
 if (!url.pathname.startsWith('/api/latchkey/')) return null
 const db = env.DB, now = Date.now()
 const first = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args).first<Row>()
 const all = async (sql: string, ...args: any[]) => (await db.prepare(sql).bind(...args).all<Row>()).results
 const stmt = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args)
 const event = (actor: string, device: string, action: string, object: string, guard = '1', args: any[] = []) => stmt(`INSERT INTO lky_events SELECT ?,?,?,?,?,? WHERE ${guard}`, id(), actor, device, action, object, now, ...args)
 const limited = async (account: string) => {
  const key = await digest(`${request.headers.get('cf-connecting-ip') ?? 'local'}:${account}`)
  const result = await first('INSERT INTO lky_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count', key, Math.floor(now / 60000))
  if (!result || result.count > 20) refuse('rate_limited', 429)
 }
 try {
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405)
  if (url.origin !== env.AUTH_ORIGIN || url.search || request.headers.get('origin') !== env.AUTH_ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.has('host') && request.headers.get('host')?.toLowerCase() !== url.host.toLowerCase()) refuse('invalid_origin', 403)
  if (request.headers.get('content-type') !== 'application/json') refuse('invalid_content_type')
  // Bound the stream as well as Content-Length. Failed bodies are never echoed.
  const reader = request.body?.getReader(); if (!reader) refuse('invalid_body')
  let size = 0; const chunks: Uint8Array[] = []
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 1500000) { await reader.cancel(); refuse('body_too_large', 413) } chunks.push(part.value) }
  const raw = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length }
  let input: Row; try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) } catch { refuse('invalid_json') }
  if (!input! || typeof input !== 'object' || Array.isArray(input)) refuse('invalid_body')
  const route = url.pathname.slice('/api/latchkey/'.length)
  await opaque.ready
  if (route === 'login/start') {
   exact(input, ['account', 'device', 'request'])
   const accountId = identifier(input.account), device = ['recovery', 'enrollment'].includes(input.device) ? input.device : identifier(input.device)
   await limited(accountId)
   const account = await first('SELECT a.*,o.version,o.status FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=?', accountId)
   // No account, device or registration details in public failure responses.
   if (!account || account.status !== 'active' || !['recovery', 'enrollment'].includes(device) && !await first('SELECT id FROM lky_devices WHERE id=? AND account_id=? AND revoked_at IS NULL AND generation=?', device, accountId, account.generation)) refuse('authentication_failed', 401)
   const started = opaque.server.startLogin({ serverSetup: account.opaque_setup, registrationRecord: account.opaque_record, userIdentifier: accountId, startLoginRequest: string(input.request), identifiers: { client: accountId, server: account.tenant } })
   const exchange = id()
   await db.batch([stmt('DELETE FROM lky_exchanges WHERE expires_at<? OR used_at IS NOT NULL', now), stmt('INSERT INTO lky_exchanges VALUES(?,?,?,?,?,?,?,NULL)', exchange, accountId, device, started.serverLoginState, account.generation, account.version, now + 120000)])
   return response({ exchange, response: started.loginResponse })
  }
  if (route === 'login/finish') {
   exact(input, ['exchange', 'request'])
   await limited('finish')
   const exchange = await first('UPDATE lky_exchanges SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>? RETURNING *', now, identifier(input.exchange), now)
   if (!exchange) refuse('authentication_failed', 401)
   try { opaque.server.finishLogin({ serverLoginState: exchange.state, finishLoginRequest: string(input.request) }) } catch { refuse('authentication_failed', 401) }
   const account = await first('SELECT a.*,o.version,o.status FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=?', exchange.account_id)
   if (!account || account.status !== 'active' || account.generation !== exchange.generation || account.version !== exchange.operator_version || !['recovery', 'enrollment'].includes(exchange.device_id) && !await first('SELECT id FROM lky_devices WHERE id=? AND account_id=? AND revoked_at IS NULL AND generation=?', exchange.device_id, account.id, account.generation)) refuse('authentication_failed', 401)
   const completed = await auth.admitVerifiedPassword(request, account.operator_id)
   const token = encode(random()), expires = Math.min(now + 600000, completed.session.expiresAt)
   await db.batch([stmt('DELETE FROM lky_grants WHERE expires_at<?', now), stmt('DELETE FROM lky_nonces WHERE expires_at<?', now), stmt('INSERT INTO lky_grants VALUES(?,?,?,?,?,?,?)', await digest(token), account.id, exchange.device_id, completed.session.id, account.generation, expires, exchange.device_id === 'recovery' ? 1 : exchange.device_id === 'enrollment' ? 2 : 0), event(account.id, exchange.device_id, 'password_authenticated', account.id)])
   const device = ['recovery', 'enrollment'].includes(exchange.device_id) ? null : await first('SELECT bundle FROM lky_devices WHERE id=?', exchange.device_id)
   return response({ token, expires, account: account.id, tenant: account.tenant, generation: account.generation, recipientKey: account.recipient_key, recoveryKey: account.recovery_key, bundle: device ? JSON.parse(device.bundle) : exchange.device_id === 'recovery' ? JSON.parse(account.recovery_wrap) : null }, 200, completed.cookie)
  }
  const session = await auth.getSession(request)
  if (!session) refuse('authentication_required', 401)
  if (route === 'account') {
   exact(input, [])
   const account = await first('SELECT id,tenant,generation,recipient_key FROM lky_accounts WHERE operator_id=?', session.operator.id)
   return response(account ? { account: account.id, tenant: account.tenant, generation: account.generation, recipientKey: account.recipient_key } : { account: null })
  }
  if (route === 'register/start') {
   exact(input, ['request']); await limited(session.operator.id)
   if (await first('SELECT id FROM lky_accounts WHERE operator_id=?', session.operator.id)) refuse('already_registered', 409)
   await stmt('INSERT INTO lky_installation VALUES(1,?) ON CONFLICT(singleton) DO NOTHING', id()).run()
   const tenant = (await first('SELECT id FROM lky_installation WHERE singleton=1'))!.id
   const account = id(), setup = opaque.server.createSetup()
   const registration = opaque.server.createRegistrationResponse({ serverSetup: setup, userIdentifier: account, registrationRequest: string(input.request) })
   await db.batch([stmt('DELETE FROM lky_registrations WHERE expires_at<?', now), stmt('INSERT INTO lky_registrations VALUES(?,?,?,?,?,?)', account, session.operator.id, session.id, tenant, setup, now + 120000)])
   return response({ account, tenant, response: registration.registrationResponse, serverKey: opaque.server.getPublicKey(setup) })
  }
  if (route === 'register/finish') {
   exact(input, ['account', 'record', 'recipientKey', 'recoveryKey', 'recoveryWrap', 'device', 'deviceKey', 'bundle', 'signature'])
   const account = identifier(input.account), device = identifier(input.device)
   const pending = await first('SELECT * FROM lky_registrations WHERE id=? AND operator_id=? AND session_id=? AND expires_at>?', account, session.operator.id, session.id, now)
   if (!pending) refuse('registration_expired', 409)
   await publicKey(string(input.recipientKey), 'wrap'); await publicKey(string(input.recoveryKey), 'sign'); await publicKey(string(input.deviceKey), 'sign')
   validateEnvelope(input.bundle, binding(pending.tenant, 'account', device, 'device', 1)); validateEnvelope(input.recoveryWrap, binding(pending.tenant, 'account', account, 'recovery', 1))
   string(input.record)
   const { signature, ...signed } = input
   if (!await verify(input.deviceKey, string(signature), envString(signed))) refuse('invalid_signature', 403)
   await db.batch([
    stmt('INSERT INTO lky_accounts SELECT ?,?,?,1,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM lky_registrations WHERE id=? AND expires_at>?)', account, session.operator.id, pending.tenant, pending.setup, input.record, input.recipientKey, input.recoveryKey, envString(input.recoveryWrap), id(), account, now),
    stmt('INSERT INTO lky_devices VALUES(?,?,?,?,1,NULL)', device, account, input.deviceKey, envString(input.bundle)), event(account, device, 'account_enrolled', account), stmt('DELETE FROM lky_registrations WHERE id=?', account),
   ])
   return response({ account, device }, 201)
  }
  const token = string(request.headers.get('x-latchkey-grant'), 100), hash = await digest(token)
  const grant = await first('SELECT g.*,a.tenant,a.operator_id,a.recipient_key,a.recovery_key,d.public_key FROM lky_grants g JOIN lky_accounts a ON a.id=g.account_id LEFT JOIN lky_devices d ON d.id=g.device_id AND d.account_id=a.id AND d.generation=a.generation AND d.revoked_at IS NULL WHERE g.token_hash=? AND g.expires_at>? AND g.generation=a.generation AND g.session_id=? AND a.operator_id=?', hash, now, session.id, session.operator.id)
  if (!grant || !grant.recovery && !grant.public_key) refuse('authority_expired', 401)
  const nonce = identifier(request.headers.get('x-latchkey-nonce')), time = string(request.headers.get('x-latchkey-time'), 20)
  if (!/^\d+$/.test(time) || Math.abs(now - Number(time)) > 60000) refuse('request_expired', 401)
  const enrollmentRoutes = ['enrollment/request', 'enrollment/status', 'enrollment/complete']
  if (grant.recovery === 2 && !enrollmentRoutes.includes(route)) refuse('enrollment_only', 403)
  const pendingKey = grant.recovery === 2 && route !== 'enrollment/request' ? await first('SELECT public_key FROM lky_enrollments WHERE id=? AND account_id=? AND generation=?', identifier(input.device), grant.account_id, grant.generation) : null
  const signatureKey = grant.recovery === 1 ? grant.recovery_key : grant.recovery === 2 ? route === 'enrollment/request' ? input.deviceKey : pendingKey?.public_key : grant.public_key
  if (!await verify(signatureKey, string(request.headers.get('x-latchkey-signature')), signingText('POST', url.pathname, token, nonce, time, await digest(raw)))) refuse('invalid_signature', 403)
  const inserted = await first('INSERT INTO lky_nonces VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING nonce', hash, nonce, grant.expires_at)
  if (!inserted) refuse('request_replayed', 409)
  const actor = grant.account_id as string, device = grant.device_id as string, tenant = grant.tenant as string
  // Mutations recheck live authority within the same D1 transaction as writes.
  const fence = `EXISTS(SELECT 1 FROM lky_grants g JOIN lky_accounts a ON a.id=g.account_id JOIN oa_sessions s ON s.id=g.session_id JOIN oa_operators o ON o.id=a.operator_id LEFT JOIN lky_devices d ON d.id=g.device_id WHERE g.token_hash=? AND g.expires_at>? AND a.generation=g.generation AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version AND o.status='active' AND (g.recovery IN (1,2) OR (d.account_id=a.id AND d.revoked_at IS NULL AND d.generation=a.generation)))`
  const fenceArgs = [hash, now, now]
  if (route === 'recover') {
   exact(input, ['generation', 'device', 'deviceKey', 'bundle', 'recoveryKey', 'recoveryWrap'])
   if (grant.recovery !== 1 || integer(input.generation) !== grant.generation) refuse('recovery_required', 403)
   const newDevice = identifier(input.device), next = grant.generation + 1
   await publicKey(string(input.deviceKey), 'sign'); await publicKey(string(input.recoveryKey), 'sign')
   validateEnvelope(input.bundle, binding(tenant, 'account', newDevice, 'device', next)); validateEnvelope(input.recoveryWrap, binding(tenant, 'account', actor, 'recovery', next))
   const result = await db.batch([
    stmt(`UPDATE lky_accounts SET generation=?,recovery_key=?,recovery_wrap=?,mutation=? WHERE id=? AND generation=? AND ${fence} RETURNING id`, next, input.recoveryKey, envString(input.recoveryWrap), newDevice, actor, grant.generation, ...fenceArgs),
    stmt('UPDATE lky_devices SET revoked_at=? WHERE account_id=? AND (SELECT mutation FROM lky_accounts WHERE id=?)=?', now, actor, actor, newDevice),
    stmt('INSERT INTO lky_devices SELECT ?,?,?,?,?,NULL WHERE (SELECT mutation FROM lky_accounts WHERE id=?)=?', newDevice, actor, input.deviceKey, envString(input.bundle), next, actor, newDevice),
    event(actor, newDevice, 'account_recovered', actor, '(SELECT mutation FROM lky_accounts WHERE id=?)=?', [actor, newDevice]),
   ])
   if (!result[0].meta.changes) refuse('authority_changed', 409)
   return response({ generation: next, device: newDevice })
  }
  if (grant.recovery === 1) refuse('recovery_only', 403)
  if (route === 'directory') {
   exact(input, ['account']); const recipient = await first('SELECT a.id,a.tenant,a.recipient_key FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status=\'active\'', identifier(input.account), tenant)
   if (!recipient) refuse('not_found', 404)
   return response({ account: recipient.id, tenant, publicKey: recipient.recipient_key, fingerprint: await digest(recipient.recipient_key) })
  }
  if (route === 'devices') { exact(input, []); return response(await all('SELECT id,public_key,generation,revoked_at FROM lky_devices WHERE account_id=?', actor)) }
  if (route === 'device/revoke') {
   exact(input, ['device']); const target = identifier(input.device)
   const result = await db.batch([stmt(`UPDATE lky_devices SET revoked_at=? WHERE id=? AND account_id=? AND revoked_at IS NULL AND ${fence} RETURNING id`, now, target, actor, ...fenceArgs), event(actor, device, 'device_revoked', target, 'EXISTS(SELECT 1 FROM lky_devices WHERE id=? AND account_id=? AND revoked_at=?)', [target, actor, now])])
   if (!result[0].meta.changes) refuse('not_found', 404)
   return response({ revoked: target, residualExposure: 'Previously decrypted or offline copies cannot be recalled. Rotate exposed vaults and provider credentials.' })
  }
  if (route === 'enrollment/request') {
   exact(input, ['device', 'deviceKey', 'transferKey']); const target = identifier(input.device)
   await publicKey(string(input.deviceKey), 'sign'); await publicKey(string(input.transferKey), 'wrap')
   await stmt(`INSERT INTO lky_enrollments SELECT ?,?,?,?,?,?,NULL,NULL,NULL WHERE ${fence}`, target, actor, input.deviceKey, input.transferKey, grant.generation, now + 120000, ...fenceArgs).run()
   return response({ device: target, fingerprint: await digest(envString([actor, target, input.deviceKey, input.transferKey, grant.generation])) }, 201)
  }
  if (route === 'enrollment/approve') {
   exact(input, ['device', 'fingerprint', 'wrapped']); const target = identifier(input.device)
   const pending = await first('SELECT * FROM lky_enrollments WHERE id=? AND account_id=? AND generation=? AND expires_at>? AND approved_wrap IS NULL AND consumed_at IS NULL', target, actor, grant.generation, now)
   if (!pending || input.fingerprint !== await digest(envString([actor, target, pending.public_key, pending.transfer_key, grant.generation]))) refuse('enrollment_mismatch', 409)
   await publicKey(string(input.wrapped?.publicKey), 'wrap'); validateEnvelope(input.wrapped?.envelope, binding(tenant, 'account', target, 'enrollment', grant.generation))
   const result = await db.batch([stmt(`UPDATE lky_enrollments SET approved_wrap=?,approved_nonce=? WHERE id=? AND approved_wrap IS NULL AND consumed_at IS NULL AND expires_at>? AND generation=? AND ${fence}`, envString(input.wrapped), nonce, target, now, grant.generation, ...fenceArgs), event(actor, device, 'device_approved', target, 'EXISTS(SELECT 1 FROM lky_enrollments WHERE id=? AND approved_nonce=?)', [target, nonce])])
   if (!result[0].meta.changes) refuse('enrollment_mismatch', 409)
   return response({ approved: target })
  }
  if (route === 'enrollment/complete') {
   exact(input, ['device', 'bundle', 'signature']); const target = identifier(input.device)
   const pending = await first('SELECT * FROM lky_enrollments WHERE id=? AND account_id=? AND generation=? AND expires_at>? AND approved_wrap IS NOT NULL AND consumed_at IS NULL', target, actor, grant.generation, now)
   if (!pending || !await verify(pending.public_key, string(input.signature), envString([target, input.bundle]))) refuse('enrollment_mismatch', 409)
   validateEnvelope(input.bundle, binding(tenant, 'account', target, 'device', grant.generation))
   const result = await db.batch([stmt(`UPDATE lky_enrollments SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>? AND generation=? AND ${fence} RETURNING id`, now, target, now, grant.generation, ...fenceArgs), stmt('INSERT INTO lky_devices SELECT id,account_id,public_key,?,generation,NULL FROM lky_enrollments WHERE id=? AND consumed_at=?', envString(input.bundle), target, now), event(actor, device, 'device_enrolled', target, 'EXISTS(SELECT 1 FROM lky_enrollments WHERE id=? AND consumed_at=?)', [target, now])])
   if (!result[0].meta.changes) refuse('enrollment_mismatch', 409)
   return response({ device: target })
  }
  if (route === 'enrollment/status') {
   exact(input, ['device']); const pending = await first('SELECT id,public_key,transfer_key,approved_wrap,expires_at FROM lky_enrollments WHERE id=? AND account_id=? AND generation=? AND consumed_at IS NULL AND expires_at>?', identifier(input.device), actor, grant.generation, now)
   if (!pending) refuse('enrollment_expired', 404)
   return response(pending)
  }
  if (route === 'audit') { exact(input, []); return response(await all('SELECT * FROM lky_events WHERE actor=? ORDER BY created_at,id LIMIT 1000', actor)) }
  if (route === 'vault/create') {
   exact(input, ['vault', 'wrapped']); const vault = identifier(input.vault)
   await publicKey(string(input.wrapped?.publicKey), 'wrap'); validateEnvelope(input.wrapped?.envelope, binding(tenant, vault, actor, 'vault-key', 1))
   await db.batch([stmt(`INSERT INTO lky_vaults SELECT ?,?,?,1,1,? WHERE ${fence}`, vault, tenant, actor, id(), ...fenceArgs), stmt('INSERT INTO lky_recipients VALUES(?,?,?,?)', vault, actor, envString(rightsList), envString(input.wrapped)), event(actor, device, 'vault_created', vault)])
   return response({ vault, epoch: 1, revision: 1 }, 201)
  }
  if (route === 'vaults') {
   exact(input, []); return response(await all('SELECT v.id,v.epoch,v.revision,v.owner,r.rights,r.wrapped_key FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE r.account_id=? AND v.tenant=?', actor, tenant))
  }
  const vault = await first('SELECT v.*,r.rights,r.wrapped_key FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE v.id=? AND v.tenant=? AND r.account_id=?', identifier(input.vault), tenant, actor)
  if (!vault) refuse('not_found', 404)
  const has = (right: string) => { if (!(JSON.parse(vault.rights) as string[]).includes(right)) refuse('permission_denied', 403) }
  const active = 'EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND mutation=?)'
  const mutation = id(), activeArgs = [vault.id, mutation]
  const change = (revision: unknown) => stmt(`UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=? AND revision=? AND ${fence} RETURNING revision`, mutation, vault.id, integer(revision), ...fenceArgs)
  if (route === 'vault/read' || route === 'vault/export') {
   exact(input, ['vault']); has(route === 'vault/read' ? 'read' : 'export')
   return response({ vault: vault.id, tenant, epoch: vault.epoch, revision: vault.revision, owner: vault.owner, wrapped: JSON.parse(vault.wrapped_key), versions: await all('SELECT object_id,version,envelope FROM lky_versions WHERE vault_id=? ORDER BY object_id,version', vault.id), recipients: (JSON.parse(vault.rights) as string[]).includes('share') ? await all('SELECT r.account_id,r.rights,a.recipient_key FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id WHERE r.vault_id=?', vault.id) : [] })
  }
  if (route === 'item/put') {
   exact(input, ['vault', 'object', 'version', 'revision', 'envelope']); const object = identifier(input.object), version = integer(input.version)
   const latest = await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?', vault.id, object)
   has(latest?.version ? 'edit' : 'create')
   if (version !== (latest?.version ?? 0) + 1) refuse('version_conflict', 409)
   validateEnvelope(input.envelope, binding(tenant, vault.id, object, 'item', vault.epoch, version))
   const result = await db.batch([change(input.revision), stmt(`INSERT INTO lky_versions SELECT ?,?,?,? WHERE ${active}`, vault.id, object, version, envString(input.envelope), ...activeArgs), event(actor, device, 'item_written', object, active, activeArgs)])
   if (!result[0].meta.changes) refuse('version_conflict', 409)
   return response({ object, version, revision: input.revision + 1 }, 201)
  }
  if (route === 'vault/share') {
   exact(input, ['vault', 'revision', 'account', 'fingerprint', 'rights', 'wrapped']); has('share')
   const recipientId = identifier(input.account), recipient = await first('SELECT a.recipient_key FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status=\'active\'', recipientId, tenant)
   if (!recipient || input.fingerprint !== await digest(recipient.recipient_key)) refuse('recipient_mismatch', 409)
   if (recipientId === vault.owner) refuse('owner_rights_fixed', 403)
   if (rights(input.rights).some(right => !(JSON.parse(vault.rights) as string[]).includes(right))) refuse('permission_denied', 403)
   await publicKey(string(input.wrapped?.publicKey), 'wrap'); validateEnvelope(input.wrapped?.envelope, binding(tenant, vault.id, recipientId, 'vault-key', vault.epoch))
   const result = await db.batch([change(input.revision), stmt(`INSERT INTO lky_recipients SELECT ?,?,?,? WHERE ${active} ON CONFLICT(vault_id,account_id) DO UPDATE SET rights=excluded.rights,wrapped_key=excluded.wrapped_key`, vault.id, recipientId, envString(rights(input.rights)), envString(input.wrapped), ...activeArgs), event(actor, device, 'vault_shared', vault.id, active, activeArgs)])
   if (!result[0].meta.changes) refuse('version_conflict', 409)
   return response({ shared: recipientId })
  }
  if (route === 'vault/rotate') {
   exact(input, ['vault', 'revision', 'remove', 'versions', 'recipients']); has('rotate'); has('read'); has('share')
   const removed = input.remove === null ? null : identifier(input.remove)
   if (removed === vault.owner) refuse('owner_removal_forbidden', 403)
   const current = await all('SELECT object_id,version FROM lky_versions WHERE vault_id=? ORDER BY object_id,version', vault.id)
   const recipients = await all('SELECT account_id FROM lky_recipients WHERE vault_id=? ORDER BY account_id', vault.id)
   if (!Array.isArray(input.versions) || !Array.isArray(input.recipients) || envString(input.versions.map((x: Row) => [x.object, x.version]).sort()) !== envString(current.map(x => [x.object_id, x.version]).sort()) || envString(input.recipients.map((x: Row) => x.account).sort()) !== envString(recipients.filter(x => x.account_id !== removed).map(x => x.account_id).sort())) refuse('incomplete_rotation', 409)
   const next = vault.epoch + 1
   const updates = input.versions.map((value: Row) => { exact(value, ['object', 'version', 'envelope']); validateEnvelope(value.envelope, binding(tenant, vault.id, identifier(value.object), 'item', next, integer(value.version))); return stmt(`UPDATE lky_versions SET envelope=? WHERE vault_id=? AND object_id=? AND version=? AND ${active}`, envString(value.envelope), vault.id, value.object, value.version, ...activeArgs) })
   for (const value of input.recipients) { exact(value, ['account', 'wrapped']); await publicKey(string(value.wrapped?.publicKey), 'wrap'); validateEnvelope(value.wrapped?.envelope, binding(tenant, vault.id, identifier(value.account), 'vault-key', next)); updates.push(stmt(`UPDATE lky_recipients SET wrapped_key=? WHERE vault_id=? AND account_id=? AND ${active}`, envString(value.wrapped), vault.id, value.account, ...activeArgs)) }
   const result = await db.batch([change(input.revision), stmt(`UPDATE lky_vaults SET epoch=? WHERE ${active}`, next, ...activeArgs), ...updates, stmt(`DELETE FROM lky_recipients WHERE vault_id=? AND account_id=? AND ${active}`, vault.id, removed ?? '', ...activeArgs), event(actor, device, 'vault_rotated', vault.id, active, activeArgs)])
   if (!result[0].meta.changes) refuse('version_conflict', 409)
   return response({ vault: vault.id, epoch: next, residualExposure: 'Past plaintext and old backups cannot be recalled. Rotate provider credentials separately.' })
  }
  refuse('not_found', 404)
 } catch (error) {
  if (error instanceof Refusal) return response({ error: error.code }, error.status)
  // Neither input, exception messages, cryptographic state nor SQL is logged.
  return response({ error: 'request_refused' }, 400)
 }
}
