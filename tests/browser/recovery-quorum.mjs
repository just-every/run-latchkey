import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vaultFixture } from './fixture.mjs';
import { quorumMembers, verifiedClient } from '../latchkey-recovery.mjs';
import { TypedItems } from '../../src/latchkey/items/client.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';

export async function recoveryQuorumJourney(width,output){
 const f=await vaultFixture(),contexts=[];
 const capture=async(page,name)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Recovery screen overflows');if(output)await page.screenshot({path:join(output,`quorum-${name}-${width}.png`),fullPage:true})};
 const pageFor=async(client,password,unlock=true)=>{
  const context=await f.browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}});contexts.push(context);
  await context.addCookies(client.cookie.split('; ').filter(Boolean).map(entry=>{const i=entry.indexOf('=');return {name:entry.slice(0,i),value:entry.slice(i+1),url:f.origin}}));
  const page=await context.newPage();await page.goto(f.origin+'/app/vault');
  if(new URL(page.url()).pathname==='/setup'){await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
  if(unlock){await page.getByLabel('Profile file',{exact:true}).setInputFiles({name:'profile.json',mimeType:['application','json'].join('/'),buffer:Buffer.from(JSON.stringify(client.profile))});await page.getByLabel('Master password',{exact:true}).fill(password);await page.getByRole('button',{name:'Unlock vault',exact:true}).click();await page.getByRole('button',{name:'Lock vault',exact:true}).waitFor();await page.locator('summary').filter({hasText:/^Settings$/}).click();await page.getByRole('button',{name:'Recovery custody',exact:true}).click();await page.getByRole('heading',{name:'Two-person recovery',exact:true}).waitFor()}
  return page;
 };
 try{
  const s=await quorumMembers(f,9610),vault=(await s.person.client.createVault()).vault,secret='synthetic-latchkey-9699';
  await new TypedItems(s.person.client).save(vault,createItem('secure-note',{title:'Recovery reconciliation',values:{note:secret},ownership:'company'}));
  const member=await pageFor(s.person.client,s.person.password),owners=[await pageFor(f.owner,f.password),await pageFor(s.second.client,s.second.password)];
  await member.getByLabel('First custodian account',{exact:true}).fill(s.identities[0].account);await member.getByLabel('Second custodian account',{exact:true}).fill(s.identities[1].account);await member.getByRole('button',{name:'Request custodian change',exact:true}).click();await expect(member.getByRole('status').filter({hasText:'Change requested'})).toBeVisible();const change=await member.getByLabel('Change reference',{exact:true}).inputValue();
  for(const page of owners){await page.getByLabel('Change reference',{exact:true}).fill(change);await page.getByRole('button',{name:'Review custodian change',exact:true}).click();const review=page.getByRole('region',{name:'Custodian change review'});await review.waitFor();if(width===1440)await expect(review.getByRole('button',{name:'Approve custodian change'})).toBeDisabled();await capture(page,'policy-review');await review.getByLabel('Type the exact change reference').fill(change);await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Approve custodian change'}).click();await review.waitFor({state:'hidden'})}
  for(let i=0;i<2;i++)await member.getByLabel(`Custodian ${i+1} fingerprint`,{exact:true}).fill(s.identities[i].fingerprint);
  await member.getByLabel('I confirm both named owners and want to enroll fresh custody').check();const credentialDownload=member.waitForEvent('download');await member.getByRole('button',{name:'Enroll two-person custody',exact:true}).click();let text='';for await(const chunk of await (await credentialDownload).createReadStream())text+=chunk;const credential=JSON.parse(text);await capture(member,'enrolled');
  const verified=await verifiedClient(f,s.person.email),recover=await pageFor(verified,'',false);await recover.locator('summary').filter({hasText:'Recover with two custodians'}).click();await recover.getByLabel('Quorum credential file').setInputFiles({name:'credential.json',mimeType:['application','json'].join('/'),buffer:Buffer.from(text)});const password='synthetic-latchkey-9698';await recover.getByLabel('New master password',{exact:true}).fill(password);await recover.getByRole('button',{name:'Start two-person recovery',exact:true}).click();const pending=recover.getByRole('region',{name:'Pending two-person recovery'});await pending.waitFor();const operation=await pending.getByLabel('Recovery operation',{exact:true}).textContent();
  const exactCase=await pending.getByLabel('Exact recovery approval',{exact:true}).textContent();
  await pending.getByRole('checkbox').check();await pending.getByRole('button',{name:'Finish two-person recovery'}).click();await expect(recover.getByRole('alert')).toContainText('recovery approval required');await capture(recover,'waiting');
  for(let i=0;i<owners.length;i++){
   const page=owners[i];await page.getByLabel('Recovery case reference',{exact:true}).fill(operation);await page.getByLabel('Member fingerprint',{exact:true}).fill(s.identity.fingerprint);await page.getByRole('button',{name:'Review recovery case',exact:true}).click();const review=page.getByRole('region',{name:'Recovery case review'});await review.waitFor();
   if(width===1440){await review.getByLabel('Type the exact recovery case reference').fill(exactCase.toUpperCase());await review.getByRole('checkbox').check();await expect(review.getByRole('button',{name:'Release my recovery share'})).toBeDisabled()}
   await review.getByLabel('Type the exact recovery case reference').fill(exactCase);await review.getByRole('checkbox').check();await capture(page,'case-review');await review.getByRole('button',{name:'Release my recovery share'}).focus();await page.keyboard.press('Enter');await review.waitFor({state:'hidden'});
   if(i===0){await pending.getByRole('button',{name:'Finish two-person recovery'}).click();await expect(recover.getByRole('alert')).toContainText('recovery approval required')}
  }
  await pending.getByRole('button',{name:'Finish two-person recovery'}).click();const custody=recover.getByRole('region',{name:'Save recovered keys'});await custody.waitFor();if(width===1440)await expect(custody.getByRole('button',{name:'Commit reviewed recovery'})).toBeDisabled();
  const profileDownload=recover.waitForEvent('download');await custody.getByRole('button',{name:'Download recovered profile',exact:true}).click();await profileDownload;const kitDownload=recover.waitForEvent('download');await custody.getByRole('button',{name:'Download recovered kit',exact:true}).click();await kitDownload;await custody.getByRole('checkbox').check();await capture(recover,'retain-files');await custody.getByRole('button',{name:'Commit reviewed recovery'}).click();await expect(recover.getByRole('heading',{name:'Recovery reconciliation',exact:true})).toBeVisible();await recover.getByRole('button',{name:'Reveal Note',exact:true}).click();if(width===1440)await expect(recover.getByLabel('Note',{exact:true})).toHaveValue(secret);await capture(recover,'recovered');
  if(width===1440){await assert.rejects(s.person.client.readVault(vault),error=>error.status===401);for(const owner of s.custodians)await assert.rejects(owner.readVault(vault),error=>[403,404].includes(error.status));assert.equal(credential.kind,'quorum');assert.ok(!text.includes(secret));}
  console.log(`Two-person recovery browser: member enrollment, both human reviews, withheld-share refusal and recovered company content at ${width}`);
 }finally{for(const c of contexts)await c.close();await f.close()}
}
if(process.argv[1]===import.meta.filename){const output=process.env.LATCHKEY_SCREENSHOTS;if(output)await mkdir(output,{recursive:true});for(const width of[1440,390])await recoveryQuorumJourney(width,output)}
