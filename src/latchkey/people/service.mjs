import { custodyAuthenticated } from './custody.mjs';
import { offboardingAuthenticated } from './offboarding.mjs';
import Papa from 'papaparse';
import { normalizeEmail } from '../../modules/operator-auth/index.mjs';
import { displayName } from '../../modules/operator-auth/accounts/admin.mjs';
import { digest } from '../crypto/envelope.mjs';
import { canonicalJson, access, exact, need } from '../lifecycle/common.mjs';
import { requirePeople } from './permissions.mjs';
async function preview(csv,ctx){
 need(typeof csv==='string'&&new TextEncoder().encode(csv).length<=100000,'invalid_people_csv');
 const parsed=Papa.parse(csv,{header:true,skipEmptyLines:'greedy'});
 need(!parsed.errors.length&&parsed.meta.fields?.length===2&&parsed.meta.fields.includes('email')&&parsed.meta.fields.includes('displayName'),'invalid_people_csv');
 need(parsed.data.length>0&&parsed.data.length<=100,'people_batch_limit');
 const existing=await ctx.auth.listOperators(ctx.request),seen=new Set(),rows=[];
 for(const [index,row]of parsed.data.entries()){
  let email,name,status='ready';
  try{email=normalizeEmail(row.email);name=displayName(row.displayName)}catch{status='invalid'}
  if(status==='ready'){
   if(seen.has(email))status='duplicate';else if(existing.some(person=>person.email.toLowerCase()===email))status='existing';
   seen.add(email);
  }
  rows.push({row:index+1,email:email??null,displayName:name??null,status});
 }
 return {rows,previewHash:await digest(canonicalJson(rows)),effect:'Only ready rows receive a member invitation. No vault keys or grants are created.'};
}
export async function peopleAuthenticated(route,input,ctx){
 if(!route.startsWith('people/'))return null;
 const custody=await custodyAuthenticated(route,input,ctx);if(custody!==null)return custody;
 const offboard=await offboardingAuthenticated(route,input,ctx);if(offboard!==null)return offboard;
 // CSV previews include roster information, so require both independent rights.
 await requirePeople(ctx,'people.read');await requirePeople(ctx,'people.invite');
 if(route==='people' + '/preview'){exact(input,['csv']);return preview(input.csv,ctx)}
 if(route==='people' + '/invite'){
  exact(input,['csv','previewHash','confirmed']);need(input.confirmed===true,'people_confirmation_required',403);
  const plan=await preview(input.csv,ctx);need(plan.previewHash===input.previewHash,'people_preview_changed',409);
  const {first,stmt}=access(ctx),batch=await digest(canonicalJson([ctx.tenant,ctx.actor,input.previewHash]));
  const claimed=await first(`INSERT INTO lky_people_batches SELECT ?,?,?,?,NULL WHERE ${ctx.fence} ON CONFLICT(id) DO NOTHING RETURNING id`,batch,ctx.tenant,ctx.actor,input.previewHash,...ctx.fenceArgs);
  need(claimed,'people_batch_already_started',409);
  const rows=[];
  for(const row of plan.rows){
   if(row.status!=='ready'){rows.push(row);continue}
   try{
    await requirePeople(ctx,'people.invite');
    await ctx.auth.invite(new Request(ctx.request.url,{method:'POST',headers:ctx.request.headers}),{email:row.email,displayName:row.displayName,role:'member',returnTo:'/app/vault'});
    rows.push({...row,status:'accepted'});
   }catch(error){rows.push({...row,status:'refused',reason:typeof error.code==='string'&&/^[a-z_]{1,64}$/.test(error.code)?error.code:'invitation_refused'})}
   // Per-row durable outcomes; an interrupted batch is never automatically retried.
   await stmt('UPDATE lky_people_batches SET result=? WHERE id=?',canonicalJson(rows),batch).run();
  }
  await stmt('UPDATE lky_people_batches SET result=? WHERE id=?',canonicalJson(rows),batch).run();
  return {batch,rows,effect:plan.effect,delivery:'Accepted means the invitation request completed, not mailbox delivery.'};
 }
 need(false,'people_route_not_found',404);
}
