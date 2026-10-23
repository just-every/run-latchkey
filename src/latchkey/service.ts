import {mspAuthenticated} from './msp/owner.mjs'
import {mspResponse} from './msp/http.mjs'
import {MspError} from './msp/common.mjs'
import {apiRequest,apiAuthenticated,rateApi,ApiError,type ApiMetadata} from './api/http.mjs'
import {automationAuthenticated,automationPublic,AutomationError} from './automation/index.mjs'
import {projectsAuthenticated} from './projects/service.mjs'
import {runtimeAuthenticated,runtimePublic,RuntimeError} from './runtime/service.mjs'
import {bulkAuthenticated,BulkError} from './collections/bulk-service.mjs'
import {batchAuthenticated} from './lifecycle/batch.mjs'
import { lifecycleAuthenticated,LifecycleError } from './lifecycle/service.mjs'
import { activeItem,verifyCapability,verifyPolicy } from './lifecycle/common.mjs'
import { evidenceAuthenticated } from './evidence/service.mjs'
import { ReviewError, reviewsAuthenticated } from './reviews/index.mjs'
import { SubjectErasureError, subjectErasureAuthenticated, subjectItemReplayKnown, subjectVaultWriteAllowed, subjectRotationStatements } from './erasure/subject.mjs'
import { subjectAdmission } from './erasure/admission.mjs'
import { GeneratorPolicyError, generatorAuthenticated } from './generator/service.mjs'
import { ItemErasureError, erasureAuthenticated, erasureKnown } from './erasure/index.mjs'
import { RecordsError, portabilityAuthenticated } from './portability/service.mjs'
import { SharingError, sharingAuthenticated, sharingPublic } from './sharing/index.mjs'
import * as opaque from '@serenity-kit/opaque'
import { bytes, digest, encode, id, publicKey, random, signingText, validateEnvelope, verify, verifyWrapped, type Context } from './crypto/envelope.mjs'
import type { Bindings } from '../auth.server'
import type { OperatorAuth, Session } from '../modules/operator-auth/index.mjs'

type Row = Record<string, any>
class Refusal extends Error { constructor(readonly code: string, readonly status = 400) { super(code) } }
function refuse(code: string, status = 400): never { throw new Refusal(code, status) }
const identifier = (value: unknown): string => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) ? value : refuse('invalid_identifier')
const string = (value: unknown, max = 4096): string => typeof value === 'string' && value.length > 0 && value.length <= max ? value : refuse('invalid_input')
const exact = (value: Row, keys: string[]) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== keys.sort().join()) refuse('invalid_fields') }
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : refuse('invalid_version')
const rightsList = ['read', 'create', 'edit', 'export', 'share', 'rotate','delete','restore']
const rights = (value: unknown) => {
 if (!Array.isArray(value) || !value.length || value.length > rightsList.length || new Set(value).size !== value.length || value.some(x => !rightsList.includes(x))) refuse('invalid_rights')
 return value as string[]
}
const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'" }
const response = (value: unknown, status = 200, cookie?: string) => Response.json(value, { status, headers: { ...headers, ...(cookie ? { 'set-cookie': cookie } : {}) } })
const binding = (tenant: string, vault: string, object: string, purpose: string, epoch: number, version = 1): Context => ({ tenant, vault, object, purpose, epoch, version })
const envString = (value: unknown) => JSON.stringify(value)

export async function latchkeyResponse(request: Request, env: Bindings, auth: OperatorAuth, meta?: ApiMetadata): Promise<Response | null> {
 const url = new URL(request.url)
 if (!url.pathname.startsWith('/api/latchkey/')) return null
 if(url.pathname==='/api/latchkey/msp/provider')return mspResponse(request,env)
 if(!meta&&url.pathname.startsWith('/api/latchkey/v1/'))return apiRequest(request,(wire,metadata)=>latchkeyResponse(wire,env,auth,metadata) as Promise<Response>)
 const db = env.DB; let now = Date.now()
 const first = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args).first<Row>()
 const checkWrap = async (value: unknown, accountId: string, expected: Context) => {
  const account = await first('SELECT authority_key FROM lky_accounts WHERE id=?', accountId)
  if (!account || !await verifyWrapped(value, account.authority_key, accountId, expected)) refuse('invalid_key_signature', 403)
 }
 const all = async (sql: string, ...args: any[]) => (await db.prepare(sql).bind(...args).all<Row>()).results
 const stmt = (sql: string, ...args: any[]) => db.prepare(sql).bind(...args)
 const event = (actor: string, device: string, action: string, object: string, guard = '1', args: any[] = []) => stmt(`INSERT INTO lky_events SELECT ?,?,?,?,?,? WHERE ${guard}`, id(), actor, device, action, object, now, ...args)
 const limited = async (account: string) => {
  const key = await digest(`${request.headers.get('cf-connecting-ip') ?? 'local'}:${account}`)
  const result = await first('INSERT INTO lky_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count', key, Math.floor(now / 60000))
  if (!result || result.count > 20) refuse('rate_limited', 429)
 }
 try {
  if (!meta && request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405)
  if (url.origin !== env.AUTH_ORIGIN || !meta&&url.search || request.headers.get('origin') !== env.AUTH_ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.has('host') && request.headers.get('host')?.toLowerCase() !== url.host.toLowerCase()) refuse('invalid_origin', 403)
  if (!meta&&request.headers.get('content-type') !== 'application/json') refuse('invalid_content_type')
  // Bound the stream as well as Content-Length. Failed bodies are never echoed.
  let raw:Uint8Array,input:Row;
  if(meta){raw=meta.raw;input=meta.input}
  else{
   const reader = request.body?.getReader(); if (!reader) refuse('invalid_body')
   let size=0;const chunks:Uint8Array[]=[];
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1500000){await reader.cancel();refuse('body_too_large',413)}chunks.push(part.value)}
   raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length}
   try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{refuse('invalid_json')}
  }
  if(!input!||typeof input!=='object'||Array.isArray(input))refuse('invalid_body')
  // Authority and expiry must be judged against the moment the complete request
  // is in hand, not its header arrival: a stalled body may outlast a grant,
  // link or verification code that was still valid when the first byte arrived.
  now = Date.now()
  const route=meta?.route??url.pathname.slice('/api/latchkey/'.length)
  const automated=await automationPublic(route,input,{db,env,now,request,raw})
  if(automated!==null)return automated instanceof Response?automated:response(automated)
  const machineResult=await runtimePublic(route,input,{db,now,request,raw})
  if(machineResult!==null)return response(machineResult)
  const external = await sharingPublic(route, input, { db, env, now, limited })
  if (external !== null) return response(external)
  await opaque.ready
  if (route === 'login/start') {
   exact(input, ['account', 'device', 'request'])
   const accountId = identifier(input.account), device = ['recovery', 'enrollment'].includes(input.device) ? input.device : identifier(input.device)
   await limited('start:' + accountId)
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
   const exchange = await first('UPDATE lky_exchanges SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>? RETURNING *', now, identifier(input.exchange), now)
   if (!exchange) { await limited('invalid_finish'); refuse('authentication_failed', 401) }
   await limited('finish:' + exchange.account_id)
   try { opaque.server.finishLogin({ serverLoginState: exchange.state, finishLoginRequest: string(input.request) }) } catch { refuse('authentication_failed', 401) }
   const account = await first('SELECT a.*,o.version,o.status FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=?', exchange.account_id)
   if (!account || account.status !== 'active' || account.generation !== exchange.generation || account.version !== exchange.operator_version || !['recovery', 'enrollment'].includes(exchange.device_id) && !await first('SELECT id FROM lky_devices WHERE id=? AND account_id=? AND revoked_at IS NULL AND generation=?', exchange.device_id, account.id, account.generation)) refuse('authentication_failed', 401)
   const existing = await auth.getSession(request)
   const completed = existing && existing.operator.id === account.operator_id ? { session: existing, cookie: undefined } : await auth.admitVerifiedPassword(request, account.operator_id)
   const token = encode(random()), expires = Math.min(now + 600000, completed.session.expiresAt)
   await db.batch([stmt('DELETE FROM lky_grants WHERE expires_at<?', now), stmt('DELETE FROM lky_nonces WHERE expires_at<?', now), stmt('INSERT INTO lky_grants VALUES(?,?,?,?,?,?,?)', await digest(token), account.id, exchange.device_id, completed.session.id, account.generation, expires, exchange.device_id === 'recovery' ? 1 : exchange.device_id === 'enrollment' ? 2 : 0), event(account.id, exchange.device_id, 'password_authenticated', account.id)])
   const device = ['recovery', 'enrollment'].includes(exchange.device_id) ? null : await first('SELECT bundle FROM lky_devices WHERE id=?', exchange.device_id)
   return response({ token, expires, account: account.id, tenant: account.tenant, generation: account.generation, recipientKey: account.recipient_key, authorityKey: account.authority_key, recoveryKey: account.recovery_key, bundle: device ? JSON.parse(device.bundle) : exchange.device_id === 'recovery' ? JSON.parse(account.recovery_wrap) : null }, 200, completed.cookie)
  }
  if (route === 'runtime/read') {
   exact(input, ['machine'])
   const hash = await digest(string(request.headers.get('x-latchkey-grant'), 100))
   const machine = await first(`SELECT m.*,a.tenant FROM lky_machines m JOIN lky_accounts a ON a.id=m.account_id JOIN oa_operators o ON o.id=a.operator_id JOIN lky_devices d ON d.id=m.device_id JOIN lky_vaults v ON v.id=m.vault_id JOIN lky_recipients r ON r.vault_id=v.id AND r.account_id=a.id WHERE m.id=? AND m.token_hash=? AND m.revoked_at IS NULL AND m.expires_at>? AND m.generation=a.generation AND m.operator_version=o.version AND o.status='active' AND d.account_id=a.id AND d.generation=a.generation AND d.revoked_at IS NULL AND v.tenant=a.tenant AND v.epoch=m.epoch AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read') AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='share')`, identifier(input.machine), hash, now)
   if (!machine) refuse('machine_authority_expired', 401)
   await activeItem({db},machine.vault_id,machine.object_id)
   const nonce = identifier(request.headers.get('x-latchkey-nonce')), time = string(request.headers.get('x-latchkey-time'), 20)
   if (!/^\d+$/.test(time) || Math.abs(now - Number(time)) > 60000) refuse('request_expired', 401)
   if (!await verify(machine.public_key, string(request.headers.get('x-latchkey-signature')), signingText(meta?.signatureMethod??'POST', meta?.signaturePath??url.pathname, string(request.headers.get('x-latchkey-grant'), 100), nonce, time, await digest(raw)))) refuse('invalid_signature', 403)
   if (!await first('INSERT INTO lky_nonces VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING nonce', hash, nonce, machine.expires_at)) refuse('request_replayed', 409)
   const value = await first('SELECT version,envelope FROM lky_versions WHERE vault_id=? AND object_id=? ORDER BY version DESC LIMIT 1', machine.vault_id, machine.object_id)
   if (!value) refuse('not_found', 404)
   await event(machine.account_id, machine.id, 'runtime_read', machine.object_id).run()
   return response({ tenant: machine.tenant, vault: machine.vault_id, object: machine.object_id, epoch: machine.epoch, version: value.version, envelope: JSON.parse(value.envelope), wrapped: JSON.parse(machine.wrapped_key) })
  }
  const session = await auth.getSession(request)
  if (!session) refuse('authentication_required', 401)
  if (route === 'account') {
   exact(input, [])
   const account = await first('SELECT id,tenant,generation,recipient_key,authority_key FROM lky_accounts WHERE operator_id=?', session.operator.id)
   return response(account ? { account: account.id, tenant: account.tenant, generation: account.generation, recipientKey: account.recipient_key, authorityKey: account.authority_key } : { account: null })
  }
  if (route === 'register/start' || route === 'register/finish') {
   const installation = await first('SELECT id FROM lky_installation WHERE singleton=1');
   if (installation) await subjectAdmission({ db, env, tenant: installation.id }, [['operator', session.operator.id], ['email', session.operator.email], ...(route === 'register/finish' ? [['account', input.account], ['device', input.device]] : [])] as [string, unknown][]);
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
   exact(input, ['account', 'record', 'recipientKey', 'authorityKey', 'recoveryKey', 'recoveryWrap', 'device', 'deviceKey', 'bundle', 'signature'])
   const account = identifier(input.account), device = identifier(input.device)
   const pending = await first('SELECT * FROM lky_registrations WHERE id=? AND operator_id=? AND session_id=? AND expires_at>?', account, session.operator.id, session.id, now)
   if (!pending) refuse('registration_expired', 409)
   await publicKey(string(input.authorityKey), 'sign'); await publicKey(string(input.recipientKey), 'wrap'); await publicKey(string(input.recoveryKey), 'sign'); await publicKey(string(input.deviceKey), 'sign')
   validateEnvelope(input.bundle, binding(pending.tenant, 'account', device, 'device', 1)); validateEnvelope(input.recoveryWrap, binding(pending.tenant, 'account', account, 'recovery', 1))
   string(input.record)
   const { signature, ...signed } = input
   if (!await verify(input.deviceKey, string(signature), envString(signed))) refuse('invalid_signature', 403)
   await db.batch([
    stmt('INSERT INTO lky_accounts SELECT ?,?,?,1,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM lky_registrations WHERE id=? AND expires_at>?)', account, session.operator.id, pending.tenant, pending.setup, input.record, input.recipientKey, input.recoveryKey, envString(input.recoveryWrap), id(), input.authorityKey, account, now),
    stmt('INSERT INTO lky_devices VALUES(?,?,?,?,1,NULL)', device, account, input.deviceKey, envString(input.bundle)), event(account, device, 'account_enrolled', account), stmt('DELETE FROM lky_registrations WHERE id=?', account),
   ])
   return response({ account, device }, 201)
  }
  const token = string(request.headers.get('x-latchkey-grant'), 100), hash = await digest(token)
  const grant = await first('SELECT g.*,a.tenant,a.operator_id,a.recipient_key,a.recovery_key,a.authority_key,d.public_key FROM lky_grants g JOIN lky_accounts a ON a.id=g.account_id LEFT JOIN lky_devices d ON d.id=g.device_id AND d.account_id=a.id AND d.generation=a.generation AND d.revoked_at IS NULL WHERE g.token_hash=? AND g.expires_at>? AND g.generation=a.generation AND g.session_id=? AND a.operator_id=?', hash, now, session.id, session.operator.id)
  if (!grant || !grant.recovery && !grant.public_key) refuse('authority_expired', 401)
  const nonce = identifier(request.headers.get('x-latchkey-nonce')), time = string(request.headers.get('x-latchkey-time'), 20)
  if (!/^\d+$/.test(time) || Math.abs(now - Number(time)) > 60000) refuse('request_expired', 401)
  const enrollmentRoutes = ['enrollment/request', 'enrollment/status', 'enrollment/complete']
  if (grant.recovery === 2 && !enrollmentRoutes.includes(route)) refuse('enrollment_only', 403)
  const pendingKey = grant.recovery === 2 && route !== 'enrollment/request' ? await first('SELECT public_key FROM lky_enrollments WHERE id=? AND account_id=? AND generation=?', identifier(input.device), grant.account_id, grant.generation) : null
  const signatureKey = grant.recovery === 1 ? grant.recovery_key : grant.recovery === 2 ? route === 'enrollment/request' ? input.deviceKey : pendingKey?.public_key : grant.public_key
  if (!await verify(signatureKey, string(request.headers.get('x-latchkey-signature')), signingText(meta?.signatureMethod??'POST', meta?.signaturePath??url.pathname, token, nonce, time, await digest(raw)))) refuse('invalid_signature', 403)
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
  if (route === 'password/start') {
   exact(input, ['request'])
   await limited(actor)
   const setup = opaque.server.createSetup(), change = id()
   const registration = opaque.server.createRegistrationResponse({ serverSetup: setup, userIdentifier: actor, registrationRequest: string(input.request) })
   await db.batch([stmt('DELETE FROM lky_password_changes WHERE expires_at<?', now), stmt(`INSERT INTO lky_password_changes SELECT ?,?,?,?,?,? WHERE ${fence}`, change, actor, device, grant.generation, setup, now + 120000, ...fenceArgs)])
   return response({ change, response: registration.registrationResponse, serverKey: opaque.server.getPublicKey(setup) })
  }
  if (route === 'password/finish') {
   exact(input, ['change', 'record', 'device', 'deviceKey', 'bundle', 'recoveryKey', 'recoveryWrap'])
   const pending = await first('SELECT * FROM lky_password_changes WHERE id=? AND account_id=? AND device_id=? AND generation=? AND expires_at>?', identifier(input.change), actor, device, grant.generation, now)
   if (!pending) refuse('password_change_expired', 409)
   const next = grant.generation + 1, target = identifier(input.device)
   string(input.record); await publicKey(string(input.deviceKey), 'sign'); await publicKey(string(input.recoveryKey), 'sign')
   validateEnvelope(input.bundle, binding(tenant, 'account', target, 'device', next)); validateEnvelope(input.recoveryWrap, binding(tenant, 'account', actor, 'recovery', next))
   const active = '(SELECT mutation FROM lky_accounts WHERE id=?)=?', activeArgs = [actor, target]
   const changed = await db.batch([
    stmt(`UPDATE lky_accounts SET opaque_setup=?,opaque_record=?,generation=?,recovery_key=?,recovery_wrap=?,mutation=? WHERE id=? AND generation=? AND ${fence}`, pending.setup, input.record, next, input.recoveryKey, envString(input.recoveryWrap), target, actor, grant.generation, ...fenceArgs),
    stmt(`UPDATE lky_devices SET revoked_at=? WHERE account_id=? AND ${active}`, now, actor, ...activeArgs),
    stmt(`INSERT INTO lky_devices SELECT ?,?,?,?,?,NULL WHERE ${active}`, target, actor, input.deviceKey, envString(input.bundle), next, ...activeArgs),
    event(actor, target, 'password_changed', actor, active, activeArgs), stmt('DELETE FROM lky_password_changes WHERE id=?', input.change),
   ])
   if (!changed[0].meta.changes) refuse('authority_changed', 409)
   return response({ generation: next, device: target })
  }
  if (route === 'machine/revoke') {
   exact(input, ['machine']); const machine = identifier(input.machine), mutation = id()
   const changed = await db.batch([stmt(`UPDATE lky_machines SET revoked_at=?,mutation=? WHERE id=? AND account_id=? AND revoked_at IS NULL AND ${fence}`, now, mutation, machine, actor, ...fenceArgs), event(actor, device, 'machine_revoked', machine, 'EXISTS(SELECT 1 FROM lky_machines WHERE id=? AND mutation=?)', [machine, mutation])])
   if (!changed[0].meta.changes) refuse('not_found', 404)
   return response({ revoked: machine })
  }
  const subjectResult = grant.recovery === 0 ? await subjectErasureAuthenticated(route, input, { db, env, now, actor, device, tenant, session, fence, fenceArgs }) : null
  if (subjectResult !== null) return response(subjectResult)
  if (grant.recovery === 0) {
   const context = { db, env, tenant };
   const entries: [string, unknown][] = route === 'vault/create' ? [['vault', input.vault]] : route === 'sharing/group/create' ? [['group', input.group]] : route === 'machine/grant' ? [['machine', input.machine]] : [];
   await subjectAdmission(context, entries);
   if (['item/put','vault/share','machine/grant','sharing/grant','sharing/link/create','sharing/put'].includes(route)) {
    if (input.vault) await subjectVaultWriteAllowed(context, input.vault);
    if (input.share) { const share = await first('SELECT vault_id FROM lky_shares WHERE id=? AND tenant=?', input.share, tenant); if (share) await subjectVaultWriteAllowed(context, share.vault_id); }
   }
   if (route === 'item/put' && await first('SELECT 1 AS present FROM lky_subject_fences WHERE tenant=? LIMIT 1', tenant) && await subjectItemReplayKnown(context, input.vault, input.object)) refuse('item_erased', 409);
  }
  const ctx={db,env,now,actor,device,tenant,session,fence,fenceArgs,auth,request}
  if(meta)await rateApi(ctx)
  const mspResult=grant.recovery===0?await mspAuthenticated(route,input,ctx):null
  if(mspResult!==null)return response(mspResult)
  const apiResult=grant.recovery===0?await apiAuthenticated(route,input,ctx):null
  if(apiResult!==null)return response(apiResult)
  const automationResult=grant.recovery===0?await automationAuthenticated(route,input,ctx):null
  if(automationResult!==null)return response(automationResult)
  const projectResult=grant.recovery===0?await projectsAuthenticated(route,input,{db,now,actor,device,tenant,fence,fenceArgs}):null
  if(projectResult!==null)return response(projectResult)
  const runtimeResult=grant.recovery===0?await runtimeAuthenticated(route,input,{db,now,actor,device,tenant,fence,fenceArgs}):null
  if(runtimeResult!==null)return response(runtimeResult)
  const bulk=grant.recovery===0?await bulkAuthenticated(route,input,{db,env,now,actor,device,tenant,session,fence,fenceArgs}):null
  if(bulk!==null)return response(bulk)
  const batch=grant.recovery===0?await batchAuthenticated(route,input,{db,env,now,actor,device,tenant,session,fence,fenceArgs}):null
  if(batch!==null)return response(batch)
  const lifecycle = grant.recovery === 0 ? await lifecycleAuthenticated(route,input,{db,env,now,actor,device,tenant,session,fence,fenceArgs}) : null
  if(lifecycle !== null)return response(lifecycle)
  const evidence = grant.recovery === 0 ? await evidenceAuthenticated(route, input, { db, env, now, actor, device, tenant, session, fence, fenceArgs }) : null
  if (evidence !== null) return response(evidence)
  const reviewed = grant.recovery === 0 ? await reviewsAuthenticated(route, input, { db, env, now, actor, device, tenant, session, fence, fenceArgs }) : null
  if (reviewed !== null) return response(reviewed)
  const generator = grant.recovery === 0 ? await generatorAuthenticated(route, input, { db, env, now, actor, device, tenant, session, fence, fenceArgs }) : null
  if (generator !== null) return response(generator)
  const erased = grant.recovery === 0 ? await erasureAuthenticated(route, input, { db, env, now, actor, device, tenant, session, fence, fenceArgs }) : null
  if (erased !== null) return response(erased)
  const portable = grant.recovery === 0 ? await portabilityAuthenticated(route, input, { db, env, now, actor, device, tenant, session, fence, fenceArgs }) : null
  if (portable !== null) return response(portable)
  const shared = grant.recovery === 0 ? await sharingAuthenticated(route, input, { db, env, now, actor, device, tenant, session, fence, fenceArgs }) : null
  if (shared !== null) return response(shared)
  if (route === 'directory') {
   exact(input, ['account']); const recipient = await first('SELECT a.id,a.tenant,a.generation,a.recipient_key,a.authority_key FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status=\'active\'', identifier(input.account), tenant)
   if (!recipient) refuse('not_found', 404)
   return response({ account: recipient.id, tenant,generation:recipient.generation, publicKey: recipient.recipient_key, authorityKey: recipient.authority_key, fingerprint: await digest(envString([recipient.recipient_key, recipient.authority_key])) })
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
   await checkWrap(input.wrapped, actor, binding(tenant, 'account', target, 'enrollment', grant.generation))
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
   exact(input, ['vault', 'wrapped','kind','policy']); const vault = identifier(input.vault)
   if(!['company','private-work','family'].includes(input.kind))refuse('invalid_vault_kind')
   const authority=await first('SELECT authority_key FROM lky_accounts WHERE id=?',actor)
   if(!await verifyPolicy(input.policy,{id:vault,tenant,owner:actor,authority_key:authority!.authority_key}))refuse('invalid_retention_policy',403)
   await checkWrap(input.wrapped, actor, binding(tenant, vault, actor, 'vault-key', 1))
   await db.batch([stmt(`INSERT INTO lky_vaults(id,tenant,owner,epoch,revision,mutation,kind,trash_policy) SELECT ?,?,?,1,1,?,?,? WHERE ${fence}`, vault, tenant, actor, id(),input.kind,envString(input.policy), ...fenceArgs), stmt('INSERT INTO lky_recipients VALUES(?,?,?,?)', vault, actor, envString(rightsList), envString(input.wrapped)), event(actor, device, 'vault_created', vault)])
   return response({ vault, epoch: 1, revision: 1 }, 201)
  }
  if (route === 'vaults') {
   exact(input, []); return response(await all('SELECT v.id,v.kind,v.epoch,v.revision,v.owner,r.rights,r.wrapped_key FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE r.account_id=? AND v.tenant=?', actor, tenant))
  }
  const vault = await first('SELECT v.*,r.rights,r.wrapped_key FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE v.id=? AND v.tenant=? AND r.account_id=?', identifier(input.vault), tenant, actor)
  if (!vault) refuse('not_found', 404)
  const has = (right: string) => { if (!(JSON.parse(vault.rights) as string[]).includes(right)) refuse('permission_denied', 403) }
  const active = 'EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND mutation=?)'
  const mutation = id(), activeArgs = [vault.id, mutation]
  const change = (revision: unknown) => stmt(`UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=? AND revision=? AND ${fence} RETURNING revision`, mutation, vault.id, integer(revision), ...fenceArgs)
  if (route === 'item/authorize') {
   exact(input, ['vault', 'object', 'action']); identifier(input.object)
   const action = string(input.action)
   if(action==='fill')await activeItem({db},vault.id,input.object)
   if (['history', 'attachment', 'copy', 'reveal', 'fill'].includes(action)) has('read')
   else if (action === 'restore') { has('restore'); has('create'); if(vault.kind==='family'&&vault.owner!==actor)refuse('family_restore_forbidden',403) }
   else if (action === 'template-author') { has('create'); if (vault.owner !== actor) refuse('permission_denied', 403) }
   else refuse('invalid_action')
   return response({ authorized: action })
  }
  if (route === 'item/read') {
   exact(input, ['vault', 'object', 'history']); has('read'); const object = identifier(input.object)
   if (typeof input.history !== 'boolean') refuse('invalid_input')
   const versions = await all(input.history ? 'SELECT object_id,version,envelope FROM lky_versions WHERE vault_id=? AND object_id=? ORDER BY version' : 'SELECT object_id,version,envelope FROM lky_versions WHERE vault_id=? AND object_id=? ORDER BY version DESC LIMIT 1', vault.id, object)
   if (!versions.length) refuse('not_found', 404)
   return response({ vault: vault.id, tenant, epoch: vault.epoch, revision: vault.revision, owner: vault.owner, wrapped: JSON.parse(vault.wrapped_key), versions, erased: (await all('SELECT proof FROM lky_erased_items WHERE vault_id=?', vault.id)).map(row => JSON.parse(row.proof)), recipients: [] })
  }
  if (route === 'vault/read' || route === 'vault/export') {
   exact(input, ['vault']); has(route === 'vault/read' ? 'read' : 'export')
   return response({ vault: vault.id, tenant, epoch: vault.epoch, revision: vault.revision, owner: vault.owner, wrapped: JSON.parse(vault.wrapped_key), versions: await all('SELECT object_id,version,envelope FROM lky_versions WHERE vault_id=? ORDER BY object_id,version', vault.id), erased: (await all('SELECT proof FROM lky_erased_items WHERE vault_id=?', vault.id)).map(row => JSON.parse(row.proof)), recipients: (JSON.parse(vault.rights) as string[]).includes('share') ? await all('SELECT r.account_id,r.rights,a.generation,a.recipient_key,a.authority_key FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id WHERE r.vault_id=?', vault.id) : [] })
  }
  if (route === 'machine/grant') {
   exact(input, ['vault', 'object', 'machine', 'deviceKey', 'recipientKey', 'fingerprint', 'wrapped', 'tokenHash', 'expiresInSeconds']); has('read'); has('share')
   await activeItem({db},vault.id,input.object)
   const object = identifier(input.object), machine = identifier(input.machine), ttl = integer(input.expiresInSeconds)
   if (ttl > 3600) refuse('invalid_expiry')
   if (!await first('SELECT version FROM lky_versions WHERE vault_id=? AND object_id=? LIMIT 1', vault.id, object)) refuse('not_found', 404)
   await publicKey(string(input.deviceKey), 'sign'); await publicKey(string(input.recipientKey), 'wrap')
   if (input.fingerprint !== await digest(envString([machine, input.deviceKey, input.recipientKey]))) refuse('recipient_mismatch', 409)
   if (!/^[A-Za-z0-9_-]{43}$/.test(input.tokenHash)) refuse('invalid_token_hash')
   await checkWrap(input.wrapped, actor, binding(tenant, vault.id, machine, `machine-key:${object}`, vault.epoch))
   const mutation = id(), expires = now + ttl * 1000
   const changed = await db.batch([
    stmt(`INSERT INTO lky_machines SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,? WHERE ${fence} AND EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND epoch=? AND revision=?)`, machine, input.tokenHash, actor, device, grant.generation, session.operator.version, vault.id, object, vault.epoch, input.deviceKey, input.recipientKey, envString(input.wrapped), expires, mutation, ...fenceArgs, vault.id, vault.epoch, vault.revision),
    event(actor, device, 'machine_granted', machine, 'EXISTS(SELECT 1 FROM lky_machines WHERE id=? AND mutation=?)', [machine, mutation]),
   ])
   if (!changed[0].meta.changes) refuse('authority_changed', 409)
   return response({ machine, expires }, 201)
  }
  if (route === 'item/put') {
   exact(input, ['vault', 'object', 'version', 'revision', 'envelope']); const object = identifier(input.object), version = integer(input.version)
   if (await erasureKnown({ db, tenant }, vault.id, object)) refuse('item_erased', 409)
   await activeItem({db},vault.id,object)
   const latest = await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?', vault.id, object)
   has(latest?.version ? 'edit' : 'create')
   if (version !== (latest?.version ?? 0) + 1) refuse('version_conflict', 409)
   validateEnvelope(input.envelope, binding(tenant, vault.id, object, 'item', vault.epoch, version))
   const result = await db.batch([change(input.revision), stmt(`INSERT INTO lky_versions SELECT ?,?,?,? WHERE ${active} AND NOT EXISTS(SELECT 1 FROM lky_erased_items WHERE vault_id=? AND object_id=?)`, vault.id, object, version, envString(input.envelope), ...activeArgs, vault.id, object), event(actor, device, 'item_written', object, active, activeArgs)])
   if (!result[0].meta.changes) refuse('version_conflict', 409)
   return response({ object, version, revision: input.revision + 1 }, 201)
  }
  if (route === 'vault/share') {
   exact(input, ['vault', 'revision', 'account', 'fingerprint', 'rights', 'wrapped','capability']); has('share')
   const recipientId = identifier(input.account), recipient = await first('SELECT a.id,a.generation,a.recipient_key,a.authority_key FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status=\'active\'', recipientId, tenant)
   if (!recipient || input.fingerprint !== await digest(envString([recipient.recipient_key, recipient.authority_key]))) refuse('recipient_mismatch', 409)
   if (recipientId === vault.owner) refuse('owner_rights_fixed', 403)
   if (rights(input.rights).some(right => !(JSON.parse(vault.rights) as string[]).includes(right))) refuse('permission_denied', 403)
   await checkWrap(input.wrapped, vault.owner, binding(tenant, vault.id, recipientId, 'vault-key', vault.epoch))
   const authority=await first('SELECT authority_key FROM lky_accounts WHERE id=?',vault.owner)
   if(!await verifyCapability(input.capability,{...vault,authority_key:authority!.authority_key},{...recipient,rights:input.rights}))refuse('invalid_rights_signature',403)
   const result = await db.batch([change(input.revision), stmt(`INSERT INTO lky_recipients SELECT ?,?,?,? WHERE ${active} ON CONFLICT(vault_id,account_id) DO UPDATE SET rights=excluded.rights,wrapped_key=excluded.wrapped_key`, vault.id, recipientId, envString(rights(input.rights)), envString(input.wrapped), ...activeArgs), stmt(`INSERT INTO lky_vault_capabilities SELECT ?,?,? WHERE ${active} ON CONFLICT(vault_id,account_id) DO UPDATE SET capability=excluded.capability`,vault.id,recipientId,envString(input.capability),...activeArgs),event(actor, device, 'vault_shared', vault.id, active, activeArgs)])
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
   for (const value of input.recipients) { exact(value, ['account', 'wrapped','capability']); const target=await first('SELECT a.id,a.generation,a.authority_key,r.rights FROM lky_accounts a JOIN lky_recipients r ON r.account_id=a.id WHERE r.vault_id=? AND a.id=?',vault.id,value.account);const ownerAuthority=await first('SELECT authority_key FROM lky_accounts WHERE id=?',vault.owner);if(!target||!await verifyCapability(value.capability,{...vault,epoch:next,authority_key:ownerAuthority!.authority_key},{...target,rights:JSON.parse(target.rights)}))refuse('invalid_rights_signature',403);updates.push(stmt(`INSERT INTO lky_vault_capabilities SELECT ?,?,? WHERE ${active} ON CONFLICT(vault_id,account_id) DO UPDATE SET capability=excluded.capability`,vault.id,value.account,envString(value.capability),...activeArgs)); await checkWrap(value.wrapped, vault.owner, binding(tenant, vault.id, identifier(value.account), 'vault-key', next)); updates.push(stmt(`UPDATE lky_recipients SET wrapped_key=? WHERE vault_id=? AND account_id=? AND ${active}`, envString(value.wrapped), vault.id, value.account, ...activeArgs)) }
   const result = await db.batch([change(input.revision), stmt(`UPDATE lky_vaults SET epoch=? WHERE id=? AND ${active}`, next, vault.id, ...activeArgs), ...updates, ...subjectRotationStatements({ db, tenant }, vault.id, next),stmt(`DELETE FROM lky_vault_capabilities WHERE vault_id=? AND account_id=? AND ${active}`,vault.id,removed??'',...activeArgs), stmt(`DELETE FROM lky_recipients WHERE vault_id=? AND account_id=? AND ${active}`, vault.id, removed ?? '', ...activeArgs), event(actor, device, 'vault_rotated', vault.id, active, activeArgs)])
   if (!result[0].meta.changes) refuse('version_conflict', 409)
   return response({ vault: vault.id, epoch: next, residualExposure: 'Past plaintext and old backups cannot be recalled. Rotate provider credentials separately.' })
  }
  refuse('not_found', 404)
 } catch (error) {
  if (error instanceof MspError || error instanceof ApiError || error instanceof AutomationError || error instanceof RuntimeError || error instanceof BulkError || error instanceof LifecycleError || error instanceof ReviewError || error instanceof Refusal || error instanceof SharingError || error instanceof RecordsError || error instanceof ItemErasureError || error instanceof GeneratorPolicyError || error instanceof SubjectErasureError) return response({ error: error.code }, error.status)
  // Neither input, exception messages, cryptographic state nor SQL is logged.
  return response({ error: 'request_refused' }, 400)
 }
}
