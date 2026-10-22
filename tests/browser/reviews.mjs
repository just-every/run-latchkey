import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vaultFixture } from './fixture.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
import { SharingClient,PublicLinkClient } from '../../src/latchkey/sharing/client.mjs';
import { ReviewClient } from '../../src/latchkey/reviews/client.mjs';
import { digest,id } from '../../src/latchkey/crypto/envelope.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';
const output=process.env.LATCHKEY_SCREENSHOTS;
if(output)await mkdir(output,{recursive:true});
const refused=async(promise,code)=>assert.rejects(promise,error=>error.code===code);
async function enroll(f,n,name){
 const response=await f.context.request.post(f.origin+'/auth/invite',{headers:{origin:f.origin},data:{email:`synthetic-latchkey-${n}@example.test`,displayName:name,role:'member'}});assert.equal(response.status(),202);
 const token=new URL(f.mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
 const client=new VaultClient(f.origin,{fetcher:f.fetcher});await client.confirmIdentity(token);const enrollment=await client.register(`synthetic-latchkey-${n+1}`);await client.unlock(enrollment.profile,`synthetic-latchkey-${n+1}`);return client;
}
export async function reviewCampaignJourney(f,width){
 const owner=f.owner,member=await enroll(f,2000,'Northstar Finance analyst'),reviewer=await enroll(f,2010,'Northstar independent reviewer'),later=await enroll(f,2020,'Northstar temporary auditor');
 try{
 const vault=(await owner.createVault()).vault;await owner.put(vault,{schema:'latchkey/vault-meta/v1',title:'Finance quarterly review'});
 const value=createItem('login',{title:'Treasury portal',fields:[{id:'username',label:'Username',kind:'text',secret:false,value:'finance@example.test'},{id:'password',label:'Password',kind:'password',secret:true,value:'synthetic-latchkey-2030'}]});const object=(await owner.put(vault,value)).object;
 await owner.share(vault,member.profile.account,await member.identity().fingerprint,['read']);await member.pinAccount(owner.profile.account,await owner.identity().fingerprint);
 const sharing=new SharingClient(owner);const group=(await sharing.createGroup([member.profile.account])).group;
 const inherited=await sharing.grant(vault,{recipients:[{account:member.profile.account,fingerprint:await member.identity().fingerprint}],objects:[object],group});
 await sharing.setPolicy({externalEnabled:true,domains:['example.test'],defaultDays:7,maxDays:30});
 const external=await sharing.createLink(vault,object,{recipient:'finance-auditor@example.test',expiresAt:Date.now()+86400000,maxViews:10});
 const expired=await sharing.createLink(vault,object,{recipient:'finance-expired@example.test',maxViews:1});await f.db.prepare('UPDATE lky_links SET expires_at=? WHERE id=?').bind(Date.now()-1,expired.link).run();
 const created=await owner.call('reviews/create',{vault,reviewer:owner.profile.account,scheduleAt:Date.now(),dueAt:Date.now()+86400000,period:'Quarterly finance access review'}),review=created.id;
 let state=await owner.call('reviews/get',{review});assert.ok(state.rows.some(r=>r.kind==='direct'&&r.subject===member.profile.account));assert.ok(state.rows.some(r=>r.kind==='inherited'&&r.group===group));assert.ok(state.rows.some(r=>r.kind==='external'&&r.status==='active'));assert.ok(state.rows.some(r=>r.status==='expired'));assert.equal(state.enforcement.mfa,'unknown-not-implemented');
 const own=state.rows.find(r=>r.kind==='direct'&&r.subject===owner.profile.account);
 await refused(owner.call('reviews/decide',{review,key:own.key,decision:'confirm',reason:'Own access'}),'independent_reviewer_required');
 await owner.call('reviews/assign',{review,key:own.key,reviewer:reviewer.profile.account});await reviewer.call('reviews/decide',{review,key:own.key,decision:'confirm',reason:'Independent owner access verification'});
 await refused(later.call('reviews/get',{review}),'review_not_found');await refused(owner.call('reviews/get',{review:id()}),'review_not_found');
 const direct=state.rows.find(r=>r.kind==='direct'&&r.subject===member.profile.account);
 await owner.call('reviews/decide',{review,key:direct.key,decision:'remove',reason:'Finance rotation complete; remove former analyst'});
 await refused(owner.call('reviews/close',{review}),'review_incomplete');
 await new ReviewClient(owner).applyRemoval(review,direct.key);await refused(member.readVault(vault),'not_found');await refused(new SharingClient(member).read(inherited.share,object),'share_unavailable');await refused(new PublicLinkClient(external.url,{fetcher:f.fetcher}).preview(),'link_unavailable');
 await owner.share(vault,later.profile.account,await later.identity().fingerprint,['read']);
 state=await owner.call('reviews/get',{review});assert.ok(state.changes.some(r=>r.subject===later.profile.account));await refused(owner.call('reviews/close',{review}),'review_incomplete');
 await owner.call('reviews/reconcile',{review,reviewer:owner.profile.account});state=await owner.call('reviews/get',{review});assert.equal(state.completeness.unreconciled,0);
 await f.page.setViewportSize({width,height:1000});await f.page.goto(f.origin+'/app/vault');await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(owner.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await expect(f.page.getByRole('button',{name:'Access reviews',exact:true})).toBeVisible();await f.page.getByLabel('Vault',{exact:true}).selectOption(vault);await f.page.getByRole('button',{name:'Access reviews',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Review in progress'})).toBeVisible();
 const laterRow=state.rows.find(r=>r.subject===later.profile.account&&!r.decision);const article=f.page.getByRole('article',{name:`Grant ${laterRow.key}`,exact:true});await article.getByLabel(`Decision reason for ${laterRow.key}`).fill('Temporary audit access remains required this quarter');await article.getByRole('button',{name:'Record decision',exact:true}).click();await expect(article.getByText('Decision: confirm.',{exact:false})).toBeVisible();
 // The browser owns decisions on desktop and phone; API loops finish the other
 // independently assigned grants, without bypassing the public review door.
 state=await owner.call('reviews/get',{review});for(const grant of state.rows.filter(r=>!r.decision))await owner.call('reviews/decide',{review,key:grant.key,decision:'confirm',reason:'Reviewed as-of rights and expiry evidence'});
 await f.page.getByRole('button',{name:'Refresh reviews',exact:true}).click();await expect(f.page.getByRole('button',{name:'Close review',exact:true})).toBeEnabled();
 if(output)await f.page.screenshot({path:join(output,`reviews-decisions-${width}.png`),fullPage:true});
 await f.page.getByRole('button',{name:'Close review',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Completed review'})).toBeVisible();
 assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'review horizontal overflow');
 if(output)await f.page.screenshot({path:join(output,`reviews-completed-${width}.png`),fullPage:true});
 const exporter=new ReviewClient(owner);for(const destination of ['evidence','vanta','drata','secureframe']){const signed=await exporter.export(review,destination);assert.ok(await ReviewClient.verify(signed,owner.profile.authorityKey));assert.equal(signed.package.completeness.decided,signed.package.completeness.total);assert.ok(!JSON.stringify(signed).includes('synthetic-latchkey-2030'));const altered=structuredClone(signed);altered.package.period+=' changed';assert.equal(await ReviewClient.verify(altered,owner.profile.authorityKey),false)}
 // Scheduled public campaign activation and due-state reminders are controlled
 // by persisted dates rather than an application clock or fake scheduler.
 const scheduled=(await owner.call('reviews/create',{vault,reviewer:reviewer.profile.account,scheduleAt:Date.now()+60000,dueAt:Date.now()+120000,period:'Next quarterly review'})).id;
 assert.equal((await owner.call('reviews/get',{review:scheduled})).phase,'scheduled');await f.db.prepare('UPDATE lky_reviews SET scheduled_at=?,due_at=? WHERE id=?').bind(Date.now()-2000,Date.now()-1000,scheduled).run();const overdue=await owner.call('reviews/get',{review:scheduled});assert.equal(overdue.phase,'open');assert.equal(overdue.overdue,true);const reminder=await owner.call('reviews/remind',{review:scheduled});const replay=await owner.call('reviews/remind',{review:scheduled});assert.equal(reminder.reminders.length,replay.reminders.length);assert.ok(reminder.reminders.length);
 const audit=await owner.call('audit',{});assert.ok(audit.some(r=>r.action==='review_closed'&&r.object_id===review));
 return {review,vault,object};
 }finally{member.lock();reviewer.lock();later.lock()}
}
if(import.meta.url===new URL(process.argv[1],'file:').href){for(const width of [1440,390]){const f=await vaultFixture();try{await reviewCampaignJourney(f,width);console.log(`Review campaign public-door journey ${width} passed`)}catch(error){if(output)await f.page.screenshot({path:join(output,`reviews-failure-${width}.png`),fullPage:true});throw error}finally{await f.close()}}}
