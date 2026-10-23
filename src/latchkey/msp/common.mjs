import { digest, id } from '../crypto/envelope.mjs';
export class MspError extends Error { constructor(code,status=400){super(code);this.code=code;this.status=status;} }
export const need=(value,code='invalid_msp_input',status=400)=>{if(!value)throw new MspError(code,status);};
export const exact=(value,keys)=>need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===[...keys].sort().join(),'invalid_fields');
export const uuid=value=>{need(typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value),'invalid_identifier');return value;};
export function origin(value){let parsed;try{parsed=new URL(value)}catch{throw new MspError('invalid_console_origin')}need(parsed.origin===value&&(parsed.protocol==='https:'||parsed.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))&&!parsed.username&&!parsed.password,'invalid_console_origin');return value;}
export function access(ctx){const stmt=(sql,...args)=>ctx.db.prepare(sql).bind(...args);return{stmt,first:(sql,...args)=>stmt(sql,...args).first(),all:async(sql,...args)=>(await stmt(sql,...args).all()).results};}
export function policyInput(value){
 exact(value,['externalEnabled','domains','defaultDays','maxDays']);
 need(typeof value.externalEnabled==='boolean'&&Array.isArray(value.domains)&&value.domains.length<=100&&new Set(value.domains).size===value.domains.length);
 need(value.domains.every(domain=>typeof domain==='string'&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(domain)));
 need(Number.isInteger(value.maxDays)&&value.maxDays>=1&&value.maxDays<=30&&Number.isInteger(value.defaultDays)&&value.defaultDays>=1&&value.defaultDays<=Math.min(7,value.maxDays));
 need(!value.externalEnabled||value.domains.length,'approved_domains_required');
 return{externalEnabled:value.externalEnabled,domains:[...value.domains].sort(),defaultDays:value.defaultDays,maxDays:value.maxDays};
}
export async function currentPolicy(ctx){const row=await access(ctx).first('SELECT * FROM lky_sharing_policy WHERE tenant=?',ctx.tenant);return{mutation:row?.mutation??null,policy:row?{externalEnabled:!!row.external_enabled,domains:JSON.parse(row.domains).sort(),defaultDays:row.default_days,maxDays:row.max_days}:{externalEnabled:false,domains:[],defaultDays:7,maxDays:30}};}
export function restrictive(before,after){need((!after.externalEnabled||before.externalEnabled)&&after.domains.every(domain=>before.domains.includes(domain))&&after.defaultDays<=before.defaultDays&&after.maxDays<=before.maxDays,'template_would_broaden_access',403);}
// A delegation never impersonates a company operator. Its consent stays tied to
// the exact active owner identity, account generation and approving device.
export const liveSql=`d.revoked_at IS NULL AND d.expires_at>? AND EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id JOIN lky_devices v ON v.account_id=a.id WHERE a.id=d.owner AND a.tenant=d.tenant AND a.generation=d.generation AND o.version=d.operator_version AND o.status='active' AND o.role='owner' AND v.id=d.device AND v.generation=a.generation AND v.revoked_at IS NULL)`;
export const event=(ctx,action,object,guard='1',args=[])=>access(ctx).stmt(`INSERT INTO lky_events SELECT ?,?,?,?,?,? WHERE ${guard}`,id(),ctx.actor,ctx.device,action,object,ctx.now,...args);
export const previewHash=value=>digest(JSON.stringify(['latchkey/msp-template/v1',value]));
