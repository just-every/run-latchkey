import { resolvePolicy, explainPolicy } from './policy.mjs';
import { id, digest } from '../crypto/envelope.mjs';

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
 try { return resolvePolicy([value], { allowConflict: true }); } catch (error) { throw new GeneratorPolicyError(error.code ?? 'invalid_generator_policy'); }
}

async function current(ctx) {
 const { db, actor, tenant, fence, fenceArgs } = ctx;
 // A left join keeps a baseline row when no company policy exists, while an
 // expired authority returns no rows. Membership is read in this statement.
 const rows = (await db.prepare(`SELECT p.scope,p.group_id,p.policy FROM (SELECT 1) live LEFT JOIN lky_generator_policies p ON p.tenant=? AND (p.group_id IS NULL OR EXISTS(SELECT 1 FROM lky_share_groups g JOIN lky_share_group_members m ON m.group_id=g.id WHERE g.id=p.group_id AND g.tenant=p.tenant AND m.account_id=?)) WHERE ${fence} ORDER BY p.scope`).bind(tenant, actor, ...fenceArgs).all()).results;
 need(rows.length, 'authority_expired', 401);
 return { policy: resolve(rows.filter(row => row.policy != null).map(row => JSON.parse(row.policy))), sources: [{ scope: 'baseline' }, ...rows.filter(row => row.policy != null).map(row => row.group_id == null ? { scope: 'company' } : { scope: 'group', group: row.group_id })], canManage: ctx.session.operator.role === 'owner' };
}

// Snapshot metadata only, never device keys or encrypted account material. Each
// ordered query is reused inside the final transaction to close review races.
const inventories = {
 policies: "SELECT scope,group_id,policy,mutation FROM lky_generator_policies WHERE tenant=? ORDER BY scope",
 membership: "SELECT g.id AS group_id,m.account_id FROM lky_share_groups g LEFT JOIN lky_share_group_members m ON m.group_id=g.id WHERE g.tenant=? ORDER BY g.id,m.account_id",
 accounts: "SELECT a.id,a.generation,o.version,o.status,o.role FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.tenant=? ORDER BY a.id",
 devices: "SELECT d.id,d.account_id,d.generation,d.revoked_at FROM lky_devices d JOIN lky_accounts a ON a.id=d.account_id WHERE a.tenant=? ORDER BY d.id",
 changes: "SELECT e.id,e.action,e.object_id FROM lky_events e JOIN lky_accounts a ON a.id=e.actor WHERE a.tenant=? AND e.action IN ('sharing_group_created','sharing_group_members_changed','account_enrolled','device_enrolled','device_revoked','account_recovered') ORDER BY e.id",
};
const columns = { policies: ['scope','group_id','policy','mutation'], membership: ['group_id','account_id'], accounts: ['id','generation','version','status','role'], devices: ['id','account_id','generation','revoked_at'], changes: ['id','action','object_id'] };
const snapshots = Object.entries(inventories).map(([key, sql]) => ({ key, sql: `SELECT json_group_array(json_object(${columns[key].map(name => `'${name}',${name}`).join(',')})) FROM (${sql})` }));
async function review(input, ctx) {
 const { db, tenant, actor, device } = ctx;
 const owner = `EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.role='owner' AND o.status='active')`;
 const raw = await db.prepare(`SELECT ${snapshots.map(({key,sql}) => `(${sql}) AS ${key}`).join(',')} WHERE ${ctx.fence} AND ${owner}`).bind(...snapshots.map(() => tenant), ...ctx.fenceArgs, actor, tenant).first();
 need(raw, 'owner_required', 403);
 const data = Object.fromEntries(Object.entries(raw).map(([key,value]) => [key, JSON.parse(value)]));
 if (input.group !== null) need(data.membership.some(row => row.group_id === input.group), 'not_found', 404);
 const policy = policyInput(input.policy), scope = input.group ?? 'company';
 const proposed = [...data.policies.filter(row => row.scope !== scope), { scope, group_id: input.group, policy: JSON.stringify(policy) }];
 const effective = (rows, groups) => explainPolicy([{ scope: 'baseline', policy: resolvePolicy([]) }, ...rows.filter(row => row.group_id === null || groups.includes(row.group_id)).map(row => ({ scope: row.group_id === null ? 'company' : 'group', group: row.group_id, policy: JSON.parse(row.policy) }))]);
 const members = data.accounts.filter(account => account.status === 'active' && (input.group === null || data.membership.some(row => row.group_id === input.group && row.account_id === account.id))).map(account => {
  const groups = data.membership.filter(row => row.account_id === account.id).map(row => row.group_id);
  return { account: account.id, before: effective(data.policies, groups), after: effective(proposed, groups), devices: data.devices.filter(row => row.account_id === account.id).map(row => ({ id: row.id, enrollment: row.revoked_at !== null ? 'revoked' : row.generation !== account.generation ? 'superseded' : 'enrolled', reachability: 'unknown', convergence: 'unverified' })) };
 });
 // Empty groups still get a constraint check against company policy.
 const scopes = [null, ...new Set(proposed.filter(row => row.group_id !== null).map(row => row.group_id))];
 const conflicts = scopes.flatMap(group => effective(proposed, group === null ? [] : [group]).conflicts.map(conflict => ({ ...conflict, group }))).concat(members.flatMap(member => member.after.conflicts.map(conflict => ({ ...conflict, account: member.account }))));
 const revisions = Object.fromEntries(await Promise.all(Object.entries(raw).map(async ([key,value]) => [key, await digest(value)])));
 const plan = { group: input.group, policy, reason: input.reason.trim(), revisions, members, conflicts, canApply: conflicts.length === 0 };
 return { plan: { ...plan, hash: await digest(JSON.stringify({ tenant, actor, device, ...plan })) }, raw };
}

export async function generatorAuthenticated(route, input, ctx) {
 if (route === 'generator/policy') { exact(input, []); return current(ctx); }
 if (!['generator/policy/preview', 'generator/policy/set'].includes(route)) return null;
 const applying = route.endsWith('/set');
 need(ctx.session.operator.role === 'owner', 'owner_required', 403);
 exact(input, applying ? ['group', 'policy', 'reason', 'confirmed', 'review'] : ['group', 'policy', 'reason']);
 need(input.group === null || typeof input.group === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.group), 'invalid_group');
 need(typeof input.reason === 'string' && input.reason.trim().length > 0 && input.reason.length <= 1000, 'policy_reason_required');
 if (applying) need(input.confirmed === true, 'policy_confirmation_required');
 const { plan, raw } = await review(input, ctx);
 if (!applying) return plan;
 need(typeof input.review === 'string' && input.review === plan.hash, 'policy_review_changed', 409);
 need(plan.canApply, 'conflicting_generator_policy');
 const { db, tenant, actor, device, now } = ctx, scope = input.group ?? 'company', policy = plan.policy;
 const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
 const mutation = id(), encoded = JSON.stringify(policy);
 const guard = `${ctx.fence} AND EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.role='owner' AND o.status='active') AND ${snapshots.map(({sql}) => `(${sql})=?`).join(' AND ')}`;
 const guardArgs = [...ctx.fenceArgs, actor, tenant, ...snapshots.flatMap(({key}) => [tenant, raw[key]])];
 const active = 'EXISTS(SELECT 1 FROM lky_generator_policies WHERE tenant=? AND scope=? AND mutation=?)', activeArgs = [tenant, scope, mutation];
 const changed = await db.batch([
  stmt(`INSERT INTO lky_generator_policies SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(tenant,scope) DO UPDATE SET group_id=excluded.group_id,policy=excluded.policy,mutation=excluded.mutation`, tenant, scope, input.group, encoded, mutation, ...guardArgs),
  stmt(`INSERT INTO lky_generator_policy_changes SELECT ?,?,?,?,?,?,?,? WHERE ${active}`, mutation, tenant, input.group, actor, device, input.reason.trim(), encoded, now, ...activeArgs),
  stmt(`INSERT INTO lky_events SELECT ?,?,?,?,?,? WHERE ${active}`, id(), actor, device, 'generator_policy_changed', mutation, now, ...activeArgs),
 ]);
 need(changed[0].meta.changes, 'policy_review_changed', 409);
 return current(ctx);
}
