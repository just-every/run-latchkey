import {createAgentDoor, type Trust} from '../../modules/agent-door/index.ts'
import {operatorAuthPeople} from '../../modules/agent-door/operator-people.ts'
import {operatorAuth, type Bindings} from '../../auth.server'
import {digest, signingText, verify} from '../crypto/envelope.mjs'
import {credentialLive} from '../automation/common.mjs'
import {nativeCredential} from './authority.ts'
import {agentTools} from './tools.ts'

export const capabilities = ['tools', 'policy', 'pause', 'audit', 'idempotency'] as const
export function latchkeyAgentDoor(env: Bindings) {
 const trust: Trust | null = env.RER_OWNER_CLAIM_PUBLIC_KEYS ? {issuer: env.RER_OWNER_CLAIM_ISSUER ?? '', installationId: env.RER_OWNER_CLAIM_INSTALLATION_ID ?? '', appOrigin: env.AUTH_ORIGIN, publicKeys: JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS)} : null
 const people = operatorAuthPeople({db: env.DB, session: request => operatorAuth(env).getSession(request)})
 // Latchkey's installation audit and policy console are owner-only.
 people.businessRole = person => person.role === 'owner' ? 'owner' : null
 const credentials = new WeakMap<Request, Awaited<ReturnType<typeof authenticateLocal>>>()
 const door = createAgentDoor({seed: 'latchkey', name: 'Latchkey', specialist: 'credential-security', origin: env.AUTH_ORIGIN, db: env.DB, trust,
  capabilities: [...capabilities], paths: ['/api/latchkey/mcp'], tools: agentTools,
  people,
  async currentScopes(who) { const credential = await nativeCredential(env.DB, who); return credential ? JSON.parse(credential.scopes) : [] },
  localCredentials: async request => credentials.get(request) ?? null,
  notTools: [
   {clauses: ['LKY-001', 'LKY-035'], reason: 'device'},
   {clauses: ['LKY-029'], reason: 'connector'},
   {clauses: ['LKY-017', 'LKY-033'], reason: 'import-door'},
   {clauses: ['LKY-031'], reason: 'installation'},
   {clauses: ['LKY-032', 'LKY-035'], reason: 'screen'},
  ],
 })
 async function authenticateLocal(request: Request) {
   const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
   if (!token) return null
   const credential = await env.DB.prepare(`SELECT c.*,a.operator_id FROM lky_mcp_credentials c JOIN lky_accounts a ON a.id=c.owner WHERE c.token_hash=? AND c.revoked_at IS NULL AND c.expires_at>? AND ${credentialLive('c')}`).bind(await digest(token), Date.now()).first<Record<string, any>>()
   if (!credential) return null
   const nonce = request.headers.get('x-latchkey-nonce'), time = request.headers.get('x-latchkey-time'), url = new URL(request.url)
   if (!nonce || !/^[a-f0-9-]{36}$/.test(nonce) || !time || !/^\d+$/.test(time) || Math.abs(Date.now()-Number(time))>60000) return null
   if (!await verify(credential.public_key, request.headers.get('x-latchkey-signature') ?? '', signingText(request.method, url.pathname+url.search, token, nonce, time, await digest(await request.clone().text())))) return null
   if (!await env.DB.prepare('INSERT INTO lky_nonces VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING nonce').bind(await digest(token), nonce, credential.expires_at).first()) return null
   return {sponsor: {id: credential.operator_id}, agent: {id: credential.id, name: 'Scoped vault client', specialist: 'credential-security'}, clientId: credential.id, scopes: JSON.parse(credential.scopes)}
 }
 return {...door, async handle(request: Request) {
  // The shared transport parses the body before credential admission. Verify the
  // native wire signature against its untouched clone before handing it over.
  if (/^Bearer [A-Za-z0-9_-]{43}$/.test(request.headers.get('authorization') ?? '')) credentials.set(request, await authenticateLocal(request))
  return door.handle(request)
 }}
}
