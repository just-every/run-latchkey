import { digest, verify, signingText } from '../crypto/envelope.mjs';
import { access, activeObject, need, uuid } from './common.mjs';

export const grantLiveSql = `EXISTS(SELECT 1 FROM lky_runtime_grants g JOIN lky_accounts a ON a.id=g.account_id JOIN oa_operators o ON o.id=a.operator_id JOIN lky_devices d ON d.id=g.device_id WHERE g.id=? AND g.token_hash=? AND g.revoked_at IS NULL AND g.expires_at>? AND (g.max_uses IS NULL OR g.uses<g.max_uses) AND a.tenant=g.tenant AND a.generation=g.generation AND a.authority_key=g.authority_key AND o.status='active' AND o.version=g.operator_version AND d.account_id=a.id AND d.generation=a.generation AND d.revoked_at IS NULL)`;

export function scopeLiveSql() {
 const projects = `EXISTS(SELECT 1 FROM lky_project_resources resource JOIN lky_project_environments environment ON environment.id=resource.environment_id JOIN lky_projects project ON project.id=environment.project_id WHERE resource.vault_id=sc.vault_id AND resource.object_id=sc.object_id AND project.tenant=v.tenant AND ${activeObject('project.vault_id', 'project.metadata_object')}) AND EXISTS(SELECT 1 FROM lky_project_environments environment JOIN lky_projects project ON project.id=environment.project_id WHERE environment.id=sc.environment_id AND project.id=sc.project_id AND project.tenant=v.tenant AND ${activeObject('project.vault_id', 'project.metadata_object')})`;
 return `NOT EXISTS(SELECT 1 FROM lky_runtime_scopes sc LEFT JOIN lky_vaults v ON v.id=sc.vault_id LEFT JOIN lky_recipients r ON r.vault_id=v.id AND r.account_id=? WHERE sc.grant_id=? AND (v.id IS NULL OR v.tenant<>? OR v.kind<>'company' OR v.epoch<>sc.epoch OR r.account_id IS NULL OR NOT EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read') OR NOT EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='share') OR (sc.can_write=1 AND NOT EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='edit')) OR NOT EXISTS(SELECT 1 FROM lky_versions WHERE vault_id=sc.vault_id AND object_id=sc.object_id) OR NOT (${activeObject('sc.vault_id', 'sc.object_id')}) OR (sc.kind='field' AND sc.source_version<>(SELECT MAX(version) FROM lky_versions WHERE vault_id=sc.vault_id AND object_id=sc.object_id)) OR (sc.kind='project' AND NOT (${projects}))))`;
}
export function dependencyLiveSql() {
 return `NOT EXISTS(SELECT 1 FROM lky_runtime_dependencies dep LEFT JOIN lky_vaults v ON v.id=dep.vault_id LEFT JOIN lky_recipients r ON r.vault_id=v.id AND r.account_id=? WHERE dep.grant_id=? AND (v.id IS NULL OR v.tenant<>? OR v.kind<>'company' OR v.epoch<>dep.epoch OR r.account_id IS NULL OR NOT EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read') OR NOT EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='share') OR COALESCE((SELECT MAX(version) FROM lky_versions WHERE vault_id=dep.vault_id AND object_id=dep.object_id),0)<>dep.version OR NOT (${activeObject('dep.vault_id', 'dep.object_id')})))`;
}
export async function machineAuthority(input, ctx) {
 const { first } = access(ctx), request = ctx.request;
 uuid(input.grant);
 const token = request.headers.get('x-latchkey-grant');
 need(typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token), 'machine_authority_expired', 401);
 const hash = await digest(token), grant = await first('SELECT * FROM lky_runtime_grants WHERE id=? AND token_hash=?', input.grant, hash);
 need(grant, 'machine_authority_expired', 401);
 const now = Math.max(ctx.now, Date.now());
 const sql = `${grantLiveSql} AND ${scopeLiveSql()} AND ${dependencyLiveSql()}`;
 const args = [grant.id, hash, now, grant.account_id, grant.id, grant.tenant, grant.account_id, grant.id, grant.tenant];
 need(await first(`SELECT 1 AS live WHERE ${sql}`, ...args), 'machine_authority_expired', 401);
 const nonce = uuid(request.headers.get('x-latchkey-nonce')), time = request.headers.get('x-latchkey-time');
 need(typeof time === 'string' && /^\d{1,16}$/.test(time) && Math.abs(now - Number(time)) <= 60000, 'request_expired', 401);
 const signature = request.headers.get('x-latchkey-signature');
 need(typeof signature === 'string' && await verify(grant.public_key, signature, signingText('POST', new URL(request.url).pathname, token, nonce, time, await digest(ctx.raw))), 'invalid_signature', 403);
 need(await first('INSERT INTO lky_nonces VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING nonce', hash, nonce, grant.expires_at), 'request_replayed', 409);
 return { grant, sql, args, now };
}
