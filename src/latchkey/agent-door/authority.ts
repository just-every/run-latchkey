import { ToolRefusal, type ToolContext, type Principal } from '../../modules/agent-door/index.ts'
import { credentialLive } from '../automation/common.mjs'

export async function nativeCredential(db: D1Database, who: Pick<Principal, 'person' | 'agent' | 'clientId' | 'consent'>) {
 const row = await db.prepare(`SELECT c.*,a.operator_id FROM lky_mcp_credentials c
 JOIN lky_accounts a ON a.id=c.owner
 LEFT JOIN lky_agent_bindings b ON b.credential_id=c.id
 WHERE a.operator_id=? AND (b.agent_id=? OR (?=1 AND c.id=?)) AND c.revoked_at IS NULL
 AND c.expires_at>? AND ${credentialLive('c')}`).bind(who.person.id, who.agent.id, !who.consent && who.clientId === who.agent.id ? 1 : 0, who.clientId ?? '', Date.now()).first<Record<string, any>>()
 return row
}

export async function nativeContext(ctx: ToolContext) {
 const credential = await nativeCredential(ctx.db, ctx)
 if (!credential) throw new ToolRefusal('machine_authority_expired')
 const now = ctx.now()
 const state = await ctx.db.prepare('SELECT envelope,local_revision,local_paused FROM agent_door_state WHERE id=1').first<{envelope: string | null; local_revision: number; local_paused: number}>()
 const envelope = state?.envelope ? JSON.parse(state.envelope) : null
 const envelopeAllowed = !ctx.consent || envelope && !envelope.paused && envelope.document && envelope.exp * 1000 > now && !envelope.revoked?.agents?.includes(ctx.agent.id) && !envelope.revoked?.consents?.includes(ctx.consent)
 const policyFence = `EXISTS(SELECT 1 FROM agent_door_state WHERE id=1 AND envelope IS ? AND local_revision=? AND local_paused=0) AND NOT EXISTS(SELECT 1 FROM agent_door_agents WHERE id=? AND revoked<>0)`
 return { db: ctx.db, now, actor: credential.owner, tenant: credential.tenant,
  device: credential.id, credential, machine: true, agentOrigin: ctx,
  fence: `(${envelopeAllowed ? 1 : 0}=1) AND (${policyFence}) AND EXISTS(SELECT 1 FROM lky_mcp_credentials c WHERE c.id=? AND c.revoked_at IS NULL AND c.expires_at>? AND ${credentialLive('c')})`,
  fenceArgs: [state?.envelope ?? null, state?.local_revision ?? 0, ctx.agent.id, credential.id, now] }
}

export async function visibleVault(args: Record<string, unknown>, ctx: ToolContext) {
 const native = await nativeContext(ctx)
 const vault = await ctx.db.prepare('SELECT id,epoch,revision FROM lky_vaults WHERE id=? AND tenant=? AND owner=?')
  .bind(args.vault ?? native.credential.vault_id, native.tenant, native.actor).first<{id: string; epoch: number; revision: number}>()
 if (!vault || vault.id !== native.credential.vault_id) throw new ToolRefusal('not_found')
 return {native, vault}
}
