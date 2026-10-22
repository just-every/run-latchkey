import { digest, encode, id, publicKey, random, signingText, verify } from '../crypto/envelope.mjs';
import { canonicalJson } from '../reviews/common.mjs';
import { sharingAuthenticated } from '../sharing/index.mjs';
import { access, credentialLive, exact, human, need, transact, uuid } from './common.mjs';

const scopes = ['posture:read', 'access:request'];
const summary = row => ({ id: row.id, vault: row.vault_id, account: row.account_id, objects: JSON.parse(row.objects), rights: JSON.parse(row.rights), expiresAt: row.expires_at, fingerprint: row.fingerprint, recipientGeneration: row.recipient_generation, epoch: row.epoch, vaultRevision: row.vault_revision, previewHash: row.preview_hash, phase: row.phase, revision: row.revision, createdAt: row.created_at, decidedAt: row.decided_at, share: row.share_id });
export const tools = [
 { name: 'latchkey_posture', description: 'Read allowed vault posture metadata; never returns item values or keys.', inputSchema: { type: 'object', properties: { vault: { type: 'string', format: 'uuid' } }, required: ['vault'], additionalProperties: false } },
 { name: 'latchkey_request_access', description: 'Request an exact grant by reference. Only the vault owner on a human session can decide and cryptographically fulfill it.', inputSchema: { type: 'object', properties: { vault: { type: 'string', format: 'uuid' }, account: { type: 'string', format: 'uuid' }, objects: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string', format: 'uuid' } }, rights: { type: 'array', minItems: 1, items: { enum: ['read', 'edit', 'export'] } }, expiresAt: { type: 'integer' } }, required: ['vault', 'account', 'objects', 'rights', 'expiresAt'], additionalProperties: false } },
];

async function machineTool(route, input, ctx) {
 const { first, all, stmt, event } = access(ctx), credential = ctx.credential;
 need(credential && credential.expires_at > ctx.now && !credential.revoked_at, 'machine_authority_expired', 401);
 const allowed = JSON.parse(credential.scopes);
 need(allowed.includes(route === 'mcp/posture' ? 'posture:read' : 'access:request'), 'machine_scope_required', 403);
 need(input.vault === credential.vault_id, 'machine_scope_required', 403);
 const vault = await first('SELECT id,epoch,revision FROM lky_vaults WHERE id=? AND tenant=? AND owner=?', uuid(input.vault), ctx.tenant, credential.owner);
 need(vault, 'machine_authority_expired', 401);
 if (route === 'mcp/posture') {
  exact(input, ['vault']);
  await event('mcp_posture_read', vault.id).run();
  return { vault: vault.id, epoch: vault.epoch, revision: vault.revision, sourceTimestamp: ctx.now, valuesIncluded: false, mfa: 'unknown-not-implemented', openAccessRequests: (await first("SELECT COUNT(*) AS n FROM lky_mcp_requests WHERE credential_id=? AND phase='pending'", credential.id)).n };
 }
 exact(input, ['vault', 'account', 'objects', 'rights', 'expiresAt']);
 need(Array.isArray(input.objects) && input.objects.length > 0 && input.objects.length <= 200 && new Set(input.objects).size === input.objects.length);
 need(Array.isArray(input.rights) && input.rights.length > 0 && new Set(input.rights).size === input.rights.length && input.rights.includes('read') && input.rights.every(right => ['read','edit','export'].includes(right)), 'invalid_rights');
 need(Number.isSafeInteger(input.expiresAt) && input.expiresAt > ctx.now && input.expiresAt <= credential.expires_at, 'invalid_expiry');
 const recipient = await first("SELECT a.id,a.generation,a.recipient_key,a.authority_key FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active'", uuid(input.account), ctx.tenant);
 need(recipient && recipient.id !== credential.owner, 'recipient_mismatch', 409);
 const objects = [];
 for (const object of [...input.objects].sort()) {
  const row = await first('SELECT object_id,MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=? GROUP BY object_id', vault.id, uuid(object));
  need(row, 'not_found', 404); objects.push({ object: row.object_id, version: row.version });
 }
 const request = id(), rights = [...input.rights].sort(), fingerprint = await digest(JSON.stringify([recipient.recipient_key, recipient.authority_key]));
 const exactGrant = { request, vault: vault.id, owner: credential.owner, account: recipient.id, recipientGeneration: recipient.generation, fingerprint, objects, rights, expiresAt: input.expiresAt, epoch: vault.epoch, vaultRevision: vault.revision };
 const previewHash = await digest(canonicalJson(exactGrant));
 await transact(ctx, [stmt("INSERT INTO lky_mcp_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',1,?,NULL,NULL)", request, ctx.tenant, credential.id, credential.owner, vault.id, recipient.id, recipient.generation, fingerprint, canonicalJson(objects), canonicalJson(rights), input.expiresAt, vault.epoch, vault.revision, previewHash, ctx.now), event('mcp_access_requested', request)], 'EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND epoch=? AND revision=?)', [vault.id, vault.epoch, vault.revision]);
 return { request, phase: 'pending', previewHash, requiresHumanOwnerApproval: true, granted: false };
}

export async function automationPublic(route, input, ctx) {
 if (!['mcp', 'mcp/posture', 'mcp/requestaccess'].includes(route)) return null;
 const url = new URL(ctx.request.url), token = ctx.request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
 need(token, 'machine_authentication_required', 401);
 const hash = await digest(token), credential = await access(ctx).first(`SELECT * FROM lky_mcp_credentials c WHERE c.token_hash=? AND c.revoked_at IS NULL AND c.expires_at>? AND ${credentialLive('c')}`, hash, ctx.now);
 need(credential, 'machine_authority_expired', 401);
 const nonce = uuid(ctx.request.headers.get('x-latchkey-nonce')), time = ctx.request.headers.get('x-latchkey-time'), signature = ctx.request.headers.get('x-latchkey-signature');
 need(typeof time === 'string' && /^\d+$/.test(time) && Math.abs(ctx.now - Number(time)) <= 60000, 'request_expired', 401);
 need(await verify(credential.public_key, signature, signingText(ctx.request.method, url.pathname + url.search, token, nonce, time, await digest(ctx.raw))), 'invalid_signature', 403);
 const { first } = access(ctx);
 const used = await first('INSERT INTO lky_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count', 'mcp:' + hash, Math.floor(ctx.now / 60000));
 need(used.count <= 60, 'rate_limited', 429);
 need(await first('INSERT INTO lky_nonces VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING nonce', hash, nonce, credential.expires_at), 'request_replayed', 409);
 const scoped = { ...ctx, actor: credential.owner, device: credential.id, tenant: credential.tenant, credential, machine: true, fence: `EXISTS(SELECT 1 FROM lky_mcp_credentials c WHERE c.id=? AND c.revoked_at IS NULL AND c.expires_at>? AND ${credentialLive('c')})`, fenceArgs: [credential.id, ctx.now] };
 if (route !== 'mcp') return machineTool(route, input, scoped);
 need(input?.jsonrpc === '2.0', 'invalid_mcp_request');
 if(input.id === undefined && ['notifications/initialized','notifications/cancelled'].includes(input.method))return new Response(null,{status:202});
 need(typeof input.id === 'number' || typeof input.id === 'string','invalid_mcp_request');
 const reply = result => ({ jsonrpc: '2.0', id: input.id, result });
 if (input.method === 'initialize') return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'latchkey', version: '1.0.0' } });
 if (input.method === 'ping') return reply({});
 if (input.method === 'tools/list') return reply({ tools: tools.filter(tool => JSON.parse(credential.scopes).includes(tool.name === 'latchkey_posture' ? 'posture:read' : 'access:request')) });
 if (input.method !== 'tools/call') return { jsonrpc: '2.0', id: input.id, error: { code: -32601, message: 'Method not found' } };
 const toolRoute = { latchkey_posture: 'mcp/posture', latchkey_request_access: 'mcp/requestaccess' }[input.params?.name];
 if (!toolRoute) return { jsonrpc: '2.0', id: input.id, error: { code: -32602, message: 'Unknown tool' } };
 try { const value = await machineTool(toolRoute, input.params.arguments, scoped); return reply({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false }); }
 catch (error) { return reply({ content: [{ type: 'text', text: error?.code ?? 'request_refused' }], isError: true }); }
}

export async function mcpAuthenticated(route, input, ctx) {
 if (!route.startsWith('mcp/')) return null;
 await human(ctx);
 const { first, all, stmt, event } = access(ctx);
 if (route === 'mcp/credential/issue') {
  exact(input, ['vault', 'publicKey', 'scopes', 'expiresAt', 'confirmed']); need(input.confirmed === true, 'human_approval_required', 403);
  const vault = await first('SELECT * FROM lky_vaults WHERE id=? AND tenant=? AND owner=?', uuid(input.vault), ctx.tenant, ctx.actor); need(vault, 'vault_owner_required', 403);
  need(Array.isArray(input.scopes) && input.scopes.length > 0 && new Set(input.scopes).size === input.scopes.length && input.scopes.every(scope => scopes.includes(scope)), 'invalid_scopes');
  need(Number.isSafeInteger(input.expiresAt) && input.expiresAt > ctx.now, 'invalid_expiry'); await publicKey(input.publicKey, 'sign');
  const account = await first('SELECT generation FROM lky_accounts WHERE id=?', ctx.actor), token = encode(random()), credential = id();
  await transact(ctx, [stmt('INSERT INTO lky_mcp_credentials VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,?)', credential, ctx.tenant, ctx.actor, vault.id, await digest(token), input.publicKey, canonicalJson(input.scopes), ctx.device, account.generation, ctx.session.operator.version, input.expiresAt, ctx.now), event('mcp_credential_issued', credential)], 'EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=?)', [vault.id, ctx.actor]);
  return { credential, token, vault: vault.id, scopes: input.scopes, expiresAt: input.expiresAt };
 }
 if (route === 'mcp/credential/revoke') {
  exact(input, ['credential']); const credential = uuid(input.credential);
  need(await first('SELECT id FROM lky_mcp_credentials WHERE id=? AND tenant=? AND owner=?', credential, ctx.tenant, ctx.actor), 'not_found', 404);
  await transact(ctx, [stmt('UPDATE lky_mcp_credentials SET revoked_at=? WHERE id=?', ctx.now, credential), event('mcp_credential_revoked', credential)]); return { credential, revoked: true };
 }
 if (route === 'mcp/requests') { exact(input, []); return (await all('SELECT * FROM lky_mcp_requests WHERE tenant=? AND owner=? ORDER BY created_at,id', ctx.tenant, ctx.actor)).map(summary); }
 const row = await first('SELECT r.* FROM lky_mcp_requests r JOIN lky_vaults v ON v.id=r.vault_id WHERE r.id=? AND r.tenant=? AND r.owner=? AND v.owner=?', uuid(input.request), ctx.tenant, ctx.actor, ctx.actor);
 need(row, 'not_found', 404);
 if (route === 'mcp/ownerpreview') { exact(input, ['request']); return summary(row); }
 if (route === 'mcp/ownerapprove') {
  exact(input, ['request','revision','previewHash','decision','confirmed']); need(input.confirmed === true, 'human_approval_required', 403);
  need(input.previewHash === row.preview_hash && input.revision === row.revision && ['approve','deny'].includes(input.decision) && ['pending','approved'].includes(row.phase), 'access_request_changed', 409);
  const live = `EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=? AND epoch=? AND revision=?) AND EXISTS(SELECT 1 FROM lky_mcp_credentials c WHERE c.id=? AND c.revoked_at IS NULL AND c.expires_at>? AND ${credentialLive('c')}) AND EXISTS(SELECT 1 FROM lky_accounts WHERE id=? AND generation=?)`;
  await transact(ctx, [stmt("UPDATE lky_mcp_requests SET phase=?,revision=revision+1,decided_at=? WHERE id=? AND revision=?", input.decision === 'approve' ? 'approved' : 'denied', ctx.now, row.id, row.revision), event(input.decision === 'approve' ? 'mcp_access_owner_approved' : 'mcp_access_owner_denied', row.id)], `EXISTS(SELECT 1 FROM lky_mcp_requests WHERE id=? AND revision=?) AND (?='deny' OR (${live} AND ?>?))`, [row.id,row.revision,input.decision,row.vault_id,ctx.actor,row.epoch,row.vault_revision,row.credential_id,ctx.now,row.account_id,row.recipient_generation,row.expires_at,ctx.now]);
  return { ...summary(await first('SELECT * FROM lky_mcp_requests WHERE id=?', row.id)), granted: false, fulfillmentRequired: input.decision === 'approve' };
 }
 if (route === 'mcp/fulfill') {
  exact(input, ['request','revision','shareInput']); const share = input.shareInput;
  need(row.phase === 'approved' && row.revision === input.revision && row.expires_at > ctx.now, 'access_request_changed', 409);
  uuid(share?.share);
  need(share.vault === row.vault_id && share.scope === 'items' && share.group === null && share.approvalRequired === false && share.startsAt === null && share.expiresAt === row.expires_at && Array.isArray(share.rights) && canonicalJson([...share.rights].sort()) === row.rights && share.recipients?.length === 1, 'exact_access_approval_required', 403);
  const recipient = share.recipients[0];
  need(recipient.account === row.account_id && recipient.fingerprint === row.fingerprint && canonicalJson(recipient.items.map(({ object, version }) => ({ object, version })).sort((a,b) => a.object.localeCompare(b.object))) === row.objects, 'exact_access_approval_required', 403);
  need(!row.share_id || row.share_id === share.share,'access_fulfillment_in_progress',409);
  await transact(ctx,[stmt('UPDATE lky_mcp_requests SET share_id=? WHERE id=? AND revision=? AND (share_id IS NULL OR share_id=?)',share.share,row.id,row.revision,share.share)],"EXISTS(SELECT 1 FROM lky_mcp_requests WHERE id=? AND phase='approved' AND revision=? AND (share_id IS NULL OR share_id=?))",[row.id,row.revision,share.share]);
  const gate = `EXISTS(SELECT 1 FROM lky_mcp_requests r JOIN lky_vaults v ON v.id=r.vault_id JOIN lky_accounts a ON a.id=r.account_id JOIN lky_mcp_credentials c ON c.id=r.credential_id WHERE r.id=? AND r.phase='approved' AND r.revision=? AND r.share_id=? AND v.owner=? AND v.epoch=r.epoch AND v.revision=r.vault_revision AND a.generation=r.recipient_generation AND c.revoked_at IS NULL AND c.expires_at>? AND ${credentialLive('c')})`;
  const gateArgs = [row.id,row.revision,share.share,ctx.actor,ctx.now];
  // The existing share handler verifies every client wrap and current policy.
  const existing = await first('SELECT * FROM lky_shares WHERE id=? AND tenant=? AND source_account=?',share.share,ctx.tenant,ctx.actor);
  let result;
  if(existing){
   const keys=await all('SELECT account_id,object_id AS object,version FROM lky_share_keys WHERE share_id=? ORDER BY object_id',share.share);
   need(existing.vault_id===row.vault_id&&existing.scope==='items'&&existing.group_id===null&&existing.rights===canonicalJson(share.rights)&&existing.expires_at===row.expires_at&&existing.epoch===row.epoch&&existing.approved_at!==null&&existing.revoked_at===null&&keys.every(key=>key.account_id===row.account_id)&&canonicalJson(keys.map(({object,version})=>({object,version})))===row.objects,'exact_access_approval_required',403);
   result={share:share.share};
  }else result = await sharingAuthenticated('sharing/grant', share, { ...ctx, fence: `(${ctx.fence}) AND (${gate})`, fenceArgs: [...ctx.fenceArgs,...gateArgs] });
  await transact(ctx, [stmt("UPDATE lky_mcp_requests SET phase='fulfilled',revision=revision+1 WHERE id=? AND phase='approved' AND revision=?", row.id,row.revision), event('mcp_access_fulfilled',row.id)], `(${gate}) AND EXISTS(SELECT 1 FROM lky_shares WHERE id=? AND tenant=? AND source_account=?)`, [...gateArgs,share.share,ctx.tenant,ctx.actor]);
  return { request: row.id, phase: 'fulfilled', share: result.share, granted: true };
 }
 need(false, 'not_found', 404);
}
