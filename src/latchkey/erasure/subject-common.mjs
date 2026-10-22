import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { bytes, decode, encode, digest } from '../crypto/envelope.mjs';
export class SubjectErasureError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
export const need = (value, code, status = 400) => { if (!value) throw new SubjectErasureError(code, status); };
export const uuid = value => { need(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'invalid_subject'); return value; };
export const exact = (input, keys) => need(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).sort().join() === [...keys].sort().join(), 'invalid_fields');
export function access(ctx) {
 const stmt = (sql, ...args) => args.length ? ctx.db.prepare(sql).bind(...args) : ctx.db.prepare(sql);
 return { stmt, first: (sql,...args) => stmt(sql,...args).first(), all: async (sql,...args) => (await stmt(sql,...args).all()).results,
  guard: (sql,args=[]) => stmt(`INSERT INTO lky_subject_guard SELECT CASE WHEN (${sql}) THEN 1 ELSE 0 END`,...args) };
}
export function key(ctx) {
 let value; try { value = decode(ctx.env.LATCHKEY_ERASURE_SECRET, 32); } catch {}
 need(value?.length === 32, 'erasure_key_required', 503); return value;
}
export async function keyed(ctx, domain, value) {
 const material = key(ctx);
 try { const hmac = await crypto.subtle.importKey('raw',material,{name:'HMAC',hash:'SHA-256'},false,['sign']); return encode(new Uint8Array(await crypto.subtle.sign('HMAC',hmac,bytes(['latchkey/subject-erasure/v1',ctx.tenant,domain,value])))); }
 finally { material.fill(0); }
}
export const normalized = (kind,value) => kind === 'email' ? String(value).trim().toLowerCase() : value;
export async function subjectReplayKnown(ctx,kind,value) {
 need(typeof kind === 'string' && /^[a-z-]{1,40}$/.test(kind),'invalid_fence_kind');
 const hash = await keyed(ctx,`fence:${kind}`,normalized(kind,value));
 return !!await access(ctx).first('SELECT 1 AS erased FROM lky_subject_fences WHERE tenant=? AND kind=? AND digest=?',ctx.tenant,kind,hash);
}
export const ownerPredicate = `EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.id=? AND o.role='owner' AND o.status='active')`;
export const ownerArgs = ctx => [ctx.actor,ctx.tenant,ctx.session.operator.id];
export const fresh = ctx => ctx.fenceArgs.map(value => value === ctx.now ? Math.max(ctx.now,Date.now()) : value);
export async function requireOwner(ctx) { need(await access(ctx).first(`SELECT 1 AS allowed WHERE ${ownerPredicate} AND ${ctx.fence}`,...ownerArgs(ctx),...fresh(ctx)),'owner_required',403); key(ctx).fill(0); }
export async function receipt(ctx,row) {
 const result = {operation:row.id,label:row.label,phase:row.phase,controlPlaneErased:true,complete:false,counts:JSON.parse(row.counts),outstanding:JSON.parse(row.outstanding),createdAt:row.created_at};
 need(await keyed(ctx,'receipt',result) === row.proof,'erasure_receipt_tampered',409);
 return {...result,proof:row.proof,requiresSeparatelyHeldErasureKey:true};
}
export const rowHash = row => digest(canonicalJson(row));
