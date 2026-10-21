import { resolvePolicy } from './policy.mjs';
import { id } from '../crypto/envelope.mjs';

export class GeneratorPolicyError extends Error {
 constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const need = (condition, code = 'invalid_generator_policy', status = 400) => { if (!condition) throw new GeneratorPolicyError(code, status); };
const exact = (input, keys) => need(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).sort().join() === [...keys].sort().join(), 'invalid_fields');
function resolve(policies) {
 try { return resolvePolicy(policies); } catch (error) { throw new GeneratorPolicyError(error.code ?? 'invalid_generator_policy'); }
}
function policyInput(value) {
 const keys = ['minLength', 'maxLength', 'minEntropyBits', 'requiredClasses', 'allowedClasses', 'historyDays'];
 need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key) && value[key] != null));
 return resolve([value]);
}

async function current(ctx) {
 const { db, actor, tenant, fence, fenceArgs } = ctx;
 // A left join keeps a baseline row when no company policy exists, while an
 // expired authority returns no rows. Membership is read in this statement.
 const rows = (await db.prepare(`SELECT p.scope,p.group_id,p.policy FROM (SELECT 1) live LEFT JOIN lky_generator_policies p ON p.tenant=? AND (p.group_id IS NULL OR EXISTS(SELECT 1 FROM lky_share_groups g JOIN lky_share_group_members m ON m.group_id=g.id WHERE g.id=p.group_id AND g.tenant=p.tenant AND m.account_id=?)) WHERE ${fence} ORDER BY p.scope`).bind(tenant, actor, ...fenceArgs).all()).results;
 need(rows.length, 'authority_expired', 401);
 return { policy: resolve(rows.filter(row => row.policy != null).map(row => JSON.parse(row.policy))), sources: [{ scope: 'baseline' }, ...rows.filter(row => row.policy != null).map(row => row.group_id == null ? { scope: 'company' } : { scope: 'group', group: row.group_id })], canManage: ctx.session.operator.role === 'owner' };
}

export async function generatorAuthenticated(route, input, ctx) {
 if (route === 'generator/policy') { exact(input, []); return current(ctx); }
 if (route !== 'generator/policy/set') return null;
 exact(input, ['group', 'policy', 'reason']);
 need(ctx.session.operator.role === 'owner', 'owner_required', 403);
 need(input.group === null || typeof input.group === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.group), 'invalid_group');
 need(typeof input.reason === 'string' && input.reason.trim().length > 0 && input.reason.length <= 1000, 'policy_reason_required');
 const policy = policyInput(input.policy), { db, tenant, actor, device, now } = ctx;
 const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
 if (input.group !== null) need(await stmt('SELECT id FROM lky_share_groups WHERE id=? AND tenant=?', input.group, tenant).first(), 'not_found', 404);
 const stored = (await stmt('SELECT scope,group_id,policy,mutation FROM lky_generator_policies WHERE tenant=? ORDER BY scope', tenant).all()).results;
 const scope = input.group ?? 'company', proposed = [...stored.filter(row => row.scope !== scope), { scope, group_id: input.group, policy: JSON.stringify(policy) }];
 const company = proposed.find(row => row.group_id === null), global = company ? JSON.parse(company.policy) : {};
 // Refuse contradictions with company constraints before making any write.
 for (const row of proposed) resolve([global, JSON.parse(row.policy)]);
 const memberships = (await stmt('SELECT m.group_id,m.account_id FROM lky_share_group_members m JOIN lky_share_groups g ON g.id=m.group_id WHERE g.tenant=?', tenant).all()).results;
 const perMember = new Map();
 for (const membership of memberships) {
  const row = proposed.find(row => row.group_id === membership.group_id); if (!row) continue;
  const list = perMember.get(membership.account_id) ?? [global]; list.push(JSON.parse(row.policy)); perMember.set(membership.account_id, list);
 }
 for (const policies of perMember.values()) resolve(policies);
 const mutation = id(), encoded = JSON.stringify(policy);
 // Fence live authority, current owner role, tenant group and the policy
 // snapshot in the same transaction as the policy and its reasoned audit.
 const guard = `${ctx.fence} AND EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.role='owner' AND o.status='active') AND (SELECT COUNT(*) FROM lky_generator_policies WHERE tenant=?)=?${stored.map(() => ' AND EXISTS(SELECT 1 FROM lky_generator_policies WHERE tenant=? AND scope=? AND mutation=?)').join('')}${input.group === null ? '' : ' AND EXISTS(SELECT 1 FROM lky_share_groups WHERE id=? AND tenant=?)'}`;
 const guardArgs = [...ctx.fenceArgs, actor, tenant, tenant, stored.length, ...stored.flatMap(row => [tenant, row.scope, row.mutation]), ...(input.group === null ? [] : [input.group, tenant])];
 const active = 'EXISTS(SELECT 1 FROM lky_generator_policies WHERE tenant=? AND scope=? AND mutation=?)', activeArgs = [tenant, scope, mutation];
 const changed = await db.batch([
  stmt(`INSERT INTO lky_generator_policies SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(tenant,scope) DO UPDATE SET group_id=excluded.group_id,policy=excluded.policy,mutation=excluded.mutation`, tenant, scope, input.group, encoded, mutation, ...guardArgs),
  stmt(`INSERT INTO lky_generator_policy_changes SELECT ?,?,?,?,?,?,?,? WHERE ${active}`, mutation, tenant, input.group, actor, device, input.reason.trim(), encoded, now, ...activeArgs),
  stmt(`INSERT INTO lky_events SELECT ?,?,?,?,?,? WHERE ${active}`, id(), actor, device, 'generator_policy_changed', mutation, now, ...activeArgs),
 ]);
 need(changed[0].meta.changes, 'authority_changed', 409);
 return current(ctx);
}
