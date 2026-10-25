import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vaultFixture } from './fixture.mjs';
import { SharingClient } from '../../src/latchkey/sharing/client.mjs';
import { ProjectClient } from '../../src/latchkey/projects/client.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';
const output=process.env.LATCHKEY_SCREENSHOTS,route=name=>['rules',name].join('/');
if(output)await mkdir(output,{recursive:true});
export async function rulesConsoleJourney(width) {
 const f=await vaultFixture();
 try {
  const owner=f.owner,page=f.page,vault=(await owner.createVault()).vault;
  await owner.put(vault,{schema:['latchkey','vault-meta','v1'].join('/'),title:'Finance'});
  await owner.put(vault,createItem('login',{title:'Finance shared credential',values:{password:'synthetic-latchkey-7996'}}));
  const group=(await new SharingClient(owner).createGroup([owner.profile.account])).group,project=await new ProjectClient(owner).create({name:'Finance project',vault}),environment=await new ProjectClient(owner).createEnvironment(project.project,{name:'Production'}),resource=await new ProjectClient(owner).set(environment.environment,'QUARTERLY_SECRET','synthetic-latchkey-8172');
  await page.setViewportSize({width,height:1000});await page.goto(f.origin+'/app/vault');
  if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('I confirm this owner account is ready to use.').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.goto(f.origin+'/app/vault')}
  await page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(owner.profile))});await page.getByLabel('Master password',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Unlock vault',exact:true}).click();
  await page.getByText('Settings',{exact:true}).click();await page.getByRole('button',{name:'Security rules',exact:true}).click();
  const panel=page.getByRole('region',{name:'Security rules',exact:true});await expect(panel).toBeVisible();
  await panel.getByLabel('First run (UTC)',{exact:true}).fill('2033-05-18T03:33');await panel.getByLabel('Observed expiry or anomaly time (UTC)',{exact:true}).fill('2033-05-18T03:33');
  const scheduledAt=Date.parse('2033-05-18T03:33:00Z');
  await panel.getByRole('button',{name:'Preview exact targets',exact:true}).click();await expect(panel.getByRole('region',{name:'Rule preview'})).toContainText('External effects: 0');
  await expect(panel.getByRole('button',{name:'Activate saved version',exact:true})).toBeDisabled();
  if(output)await page.screenshot({path:join(output,`rules-preview-${width}.png`),fullPage:true});
  await panel.getByRole('button',{name:'Save inactive version',exact:true}).click();await expect(panel.getByRole('heading',{name:'Version 1 · Inactive',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Preview exact targets',exact:true}).click();await panel.getByLabel('I approve this exact saved version and preview.').check();await panel.getByRole('button',{name:'Activate saved version',exact:true}).click();await expect(panel.getByRole('heading',{name:'Version 1 · Active',exact:true})).toBeVisible();
  await f.schedule(scheduledAt);await panel.getByRole('button',{name:'Refresh rules',exact:true}).click();await expect(panel.getByRole('region',{name:'Rule history'})).toContainText('Runs retained: 1');
  await panel.getByLabel('Rule type',{exact:true}).selectOption('rotation');await panel.getByLabel('Template name',{exact:true}).fill('Finance rotation approval');await panel.getByRole('button',{name:'Preview exact targets',exact:true}).click();await panel.getByRole('button',{name:'Save inactive version',exact:true}).click();await expect(panel.getByRole('heading',{name:'Version 2 · Inactive',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Preview exact targets',exact:true}).click();await panel.getByLabel('I approve this exact saved version and preview.').check();await panel.getByRole('button',{name:'Activate saved version',exact:true}).click();await expect(panel.getByRole('heading',{name:'Version 2 · Active',exact:true})).toBeVisible();await f.schedule(scheduledAt);await panel.getByRole('button',{name:'Refresh rules',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Approve exact rotation proposal',exact:true})).toBeVisible();await panel.getByRole('button',{name:'Approve exact rotation proposal',exact:true}).click();await expect(panel.getByRole('region',{name:'Rule history'})).toContainText('Historical decisions: 1');
  await panel.getByLabel('Severity',{exact:true}).selectOption('warning');await panel.getByRole('button',{name:'Preview exact targets',exact:true}).click();await panel.getByRole('button',{name:'Save inactive version',exact:true}).click();await expect(panel.getByRole('heading',{name:'Version 3 · Inactive',exact:true})).toBeVisible();await expect(panel.getByRole('region',{name:'Rule history'})).toContainText('superseded');
  if(output)await page.screenshot({path:join(output,`rules-history-${width}.png`),fullPage:true});
  await panel.getByRole('button',{name:'New template',exact:true}).click();await panel.getByLabel('Template name',{exact:true}).fill('Quarterly finance review');await panel.getByLabel('Rule type',{exact:true}).selectOption('review');await panel.getByLabel('Recipient group',{exact:true}).selectOption(group);await panel.getByLabel('Project scope',{exact:true}).selectOption(project.project);await panel.getByLabel('Target item',{exact:true}).selectOption(resource.object);await panel.getByLabel('Recurrence',{exact:true}).selectOption('calendar-quarter');await panel.getByLabel('First run (UTC)',{exact:true}).fill('2032-01-01T00:00');await panel.getByRole('button',{name:'Preview exact targets',exact:true}).click();await expect(panel.getByRole('region',{name:'Rule preview'})).toContainText('calendar-quarter');await panel.getByRole('button',{name:'Save inactive version',exact:true}).click();await expect(panel.getByRole('heading',{name:'Version 1 · Inactive',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Preview exact targets',exact:true}).click();await panel.getByLabel('I approve this exact saved version and preview.').check();await panel.getByRole('button',{name:'Activate saved version',exact:true}).click();
  await f.schedule(Date.parse('2032-01-01T00:00:00Z'));await f.schedule(Date.parse('2032-04-01T00:00:00Z'));await panel.getByRole('button',{name:'Refresh rules',exact:true}).click();await expect(panel.getByRole('region',{name:'Rule history'})).toContainText('Runs retained: 2');
  await new SharingClient(owner).setGroup(group,[]);await f.schedule(Date.parse('2032-07-01T00:00:00Z'));await panel.getByRole('button',{name:'Refresh rules',exact:true}).click();await expect(panel.getByRole('region',{name:'Rule history'})).toContainText('suspended-scope-changed');
  assert.equal((await owner.call(route('list'),{})).length,2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'rules horizontal overflow');
  const iconOnly=await panel.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.textContent.trim()).length);assert.equal(iconOnly,0);
  if(output)await page.screenshot({path:join(output,`rules-template-${width}.png`),fullPage:true});
  console.log(`PASS rulesConsoleJourney ${width}: console preview, activation, scheduled obligations, approval invalidation and reusable review template`);
 }catch(error){if(output)await f.page.screenshot({path:join(output,`rules-failure-${width}.png`),fullPage:true});throw error}finally{await f.close()}
}
for(const width of [1440,390])await rulesConsoleJourney(width);
