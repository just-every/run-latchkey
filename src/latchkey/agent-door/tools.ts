import { ToolRefusal, type ToolDefinition, type ToolContext } from '../../modules/agent-door/index.ts'
import { machineTool } from '../automation/mcp.mjs'
import { nativeContext, visibleVault } from './authority.ts'

const identifier = {type: 'string', format: 'uuid'}
const vaultInput = {type: 'object' as const, properties: {vault: identifier}, required: ['vault'], additionalProperties: false}
const requestInput = {type: 'object' as const, properties: {vault: identifier, account: identifier,
 objects: {type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: identifier},
 rights: {type: 'array', minItems: 1, uniqueItems: true, items: {enum: ['read', 'edit', 'export']}}, expiresAt: {type: 'integer'}},
 required: ['vault', 'account', 'objects', 'rights', 'expiresAt'], additionalProperties: false}
const facts = [{class: 'standard' as const, facts: {measure: 1}}]
async function classify(args: Record<string, unknown>, ctx: ToolContext) { await visibleVault(args, ctx); return facts }
async function target(args: Record<string, unknown>, ctx: ToolContext) { return {kind: 'vault', id: (await visibleVault(args, ctx)).vault.id} }
async function nativeRun(route: string, args: Record<string, unknown>, ctx: ToolContext) {
 try { return {result: await machineTool(route, args, await nativeContext(ctx))} }
 catch (error: any) { if (typeof error?.code === 'string') throw new ToolRefusal(error.code); throw error }
}
export const agentTools: ToolDefinition[] = [
 {name: 'latchkey.posture.read', title: 'Read vault posture', description: 'Read current scoped vault metadata. No values, item names, keys or MFA claims.',
  scope: 'posture:read', readOnly: true, inputSchema: vaultInput,
  outputSchema: {type: 'object', properties: {vault: identifier, epoch: {type: 'integer'}, revision: {type: 'integer'}, valuesIncluded: {const: false}, mfa: {type: 'string'}, openAccessRequests: {type: 'integer'}}, required: ['vault', 'epoch', 'revision', 'valuesIncluded', 'mfa', 'openAccessRequests'], additionalProperties: false},
  classes: ['standard'], clauses: ['LKY-029', 'LKY-035'], classify, target,
  run: (args, ctx) => nativeRun('mcp/posture', args, ctx)},
 {name: 'latchkey.access.requests', title: 'Inspect access requests', description: 'Inspect this credential’s retained requests without granting or revealing access.',
  scope: 'access:request', readOnly: true, inputSchema: {type: 'object', properties: {}, additionalProperties: false},
  outputSchema: {type: 'object', properties: {requests: {type: 'array', items: {type: 'object', properties: {id: identifier, phase: {type: 'string'}, revision: {type: 'integer'}}, required: ['id', 'phase', 'revision'], additionalProperties: false}}}, required: ['requests'], additionalProperties: false},
  classes: ['standard'], clauses: ['LKY-029', 'LKY-035'], classify, target,
  async run(_args, ctx) { const {native} = await visibleVault({}, ctx)
   return {result: {requests: (await ctx.db.prepare('SELECT id,phase,revision FROM lky_mcp_requests WHERE tenant=? AND owner=? AND credential_id=? ORDER BY id').bind(native.tenant, native.actor, native.credential.id).all()).results}} }},
 {name: 'latchkey.access.request', title: 'Request exact vault access', description: 'Record a request for existing objects and recipient. Creates no grant. A native human owner must decide and supply client-held key wraps.',
  scope: 'access:request', readOnly: false, inputSchema: requestInput,
  outputSchema: {type: 'object', properties: {request: identifier, phase: {const: 'pending'}, previewHash: {type: 'string'}, requiresHumanOwnerApproval: {const: true}, granted: {const: false}}, required: ['request', 'phase', 'previewHash', 'requiresHumanOwnerApproval', 'granted'], additionalProperties: false},
  classes: ['standard'], clauses: ['LKY-029', 'LKY-035'], classify, target,
  async revision(args, ctx) { return (await visibleVault(args, ctx)).vault.revision },
  async summary(args, ctx) { await visibleVault(args, ctx); return {target: {id: String(args.vault)}, recipients: [String(args.account)], items: (args.objects as string[]), role: (args.rights as string[]).join(', ')} },
  run: (args, ctx) => nativeRun('mcp/requestaccess', args, ctx)},
]
