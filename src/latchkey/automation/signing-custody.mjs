import {bytes,derive,json,open,seal} from '../crypto/envelope.mjs';
import {need} from './common.mjs';
const binding=(tenant,subscription,revision)=>({tenant,vault:'webhooks',object:subscription,purpose:'security-webhook-signing',epoch:revision,version:1});
async function key(ctx){need(typeof ctx.env?.SESSION_SECRET==='string'&&ctx.env.SESSION_SECRET.length>=32,'webhook_signing_unavailable',503);return derive(bytes(ctx.env.SESSION_SECRET),ctx.tenant,'webhook-signing-custody/v1')}
export async function storeSigningKey(ctx,subscription,revision,secret){const material=await key(ctx);try{return JSON.stringify(await seal(material,bytes({secret}),binding(ctx.tenant,subscription,revision)))}finally{material.fill(0)}}
export async function loadSigningKey(ctx,row){const material=await key(ctx);try{return json(await open(material,JSON.parse(row.secret),binding(ctx.tenant,row.id,row.revision))).secret}finally{material.fill(0)}}
