import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { digest, id } from '../crypto/envelope.mjs';
export { canonicalJson, digest, id };
export class ReviewError extends Error { constructor(code,status=400){super(code);this.code=code;this.status=status} }
export const need=(condition,code='invalid_review_input',status=400)=>{if(!condition)throw new ReviewError(code,status)};
export const uuid=value=>{need(typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value));return value};
export const exact=(input,keys)=>need(input&&Object.keys(input).sort().join() === [...keys].sort().join(),'invalid_fields');
export const text=(value,max=1000)=>{need(typeof value==='string'&&value.trim().length>0&&value.length<=max);return value.trim()};
export function access(ctx){const stmt=(sql,...args)=>ctx.db.prepare(sql).bind(...args);return {stmt,first:(sql,...args)=>stmt(sql,...args).first(),all:async(sql,...args)=>(await stmt(sql,...args).all()).results,event:(action,object)=>stmt('INSERT INTO lky_events VALUES(?,?,?,?,?,?)',id(),ctx.actor,ctx.device,action,object,ctx.now),guard:(sql,args=[])=>stmt(`INSERT INTO lky_review_guard SELECT CASE WHEN (${sql}) THEN 1 ELSE 0 END`,...args)}}
export async function ownedVault(ctx,vault){const row=await access(ctx).first('SELECT * FROM lky_vaults WHERE id=? AND tenant=? AND owner=?',uuid(vault),ctx.tenant,ctx.actor);need(row,'review_owner_required',403);return row}
export async function reviewer(ctx,account){need(await access(ctx).first("SELECT a.id FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active'",uuid(account),ctx.tenant),'reviewer_unavailable',409);return account}
export async function campaign(ctx,id){const row=await access(ctx).first('SELECT * FROM lky_reviews WHERE id=? AND tenant=?',uuid(id),ctx.tenant);need(row,'review_not_found',404);need(row.owner===ctx.actor||await access(ctx).first('SELECT review_id FROM lky_review_rows WHERE review_id=? AND reviewer=?',row.id,ctx.actor),'review_not_found',404);return row}
export const evidenceText=packageValue=>canonicalJson(['latchkey/access-review-evidence/v1',packageValue]);
