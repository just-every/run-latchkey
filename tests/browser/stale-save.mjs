import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { vaultFixture } from './fixture.mjs';
import { TypedItems } from '../../src/latchkey/items/client.mjs';

// Both editors save through the UI in independent contexts. A refused draft must
// never acquire the newer version as its base, even when the person retries.
export async function staleSaveJourney(width = 1440, output) {
 const height = width === 390 ? 844 : 1000;
 const f = await vaultFixture();
 let other;
 try {
  const vault = (await f.owner.createVault()).vault;
  await f.owner.put(vault, { schema: 'latchkey/vault-meta/v1', title: 'Northstar Finance' });
  other = await f.browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height } });
  await other.addCookies(await f.context.cookies());
  const a = f.page, b = await other.newPage();
  await a.setViewportSize({ width, height });
  const unlock = async page => {
   await page.goto(f.origin + '/app/vault');
   if (new URL(page.url()).pathname === '/setup') {
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
   }
   await expect(page.getByLabel('Profile file')).toBeEnabled();
   await page.getByLabel('Profile file').setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(f.owner.profile)) });
   await page.getByLabel('Master password', { exact: true }).fill(f.password);
   await page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
   await expect(page.getByRole('button', { name: 'New item', exact: true })).toBeEnabled();
  };
  await unlock(a);
  await unlock(b);
  const typed = new TypedItems(f.owner);
  for (const scenario of ['password', 'title', 'different-field']) {
   const title = `Treasury ${scenario}`;
   const original = 'synthetic-stale-original', mine = 'synthetic-stale-mine', theirs = 'synthetic-stale-theirs';
   await b.getByRole('button', { name: 'New item', exact: true }).click();
   await b.getByLabel('Title', { exact: true }).fill(title);
   await b.locator('#edit-username').fill('finance@example.test');
   await b.locator('#edit-password').fill(original);
   await b.getByRole('button', { name: 'Save item', exact: true }).click();
   await expect(b.getByRole('heading', { name: title, exact: true })).toBeVisible();
   await a.getByRole('button', { name: 'Refresh', exact: true }).click();
   await a.getByRole('navigation', { name: 'Vault items' }).getByRole('button').filter({ hasText: title }).click();
   await a.getByRole('button', { name: 'Edit', exact: true }).click();
   if (scenario === 'password') await a.locator('#edit-password').fill(mine);
   else await a.getByLabel('Title', { exact: true }).fill(title + ' mine');
   const draft = await a.locator('.editor input, .editor textarea, .editor select').evaluateAll(nodes => nodes.map(n => ({ id: n.id, value: n.value, checked: n.checked })));
   await b.getByRole('button', { name: 'Edit', exact: true }).click();
   if (scenario === 'title') await b.getByLabel('Title', { exact: true }).fill(title + ' theirs');
   else await b.locator('#edit-password').fill(theirs);
   await b.getByRole('button', { name: 'Save item', exact: true }).click();
   const latestTitle = scenario === 'title' ? title + ' theirs' : title;
   await expect(b.getByRole('heading', { name: latestTitle, exact: true })).toBeVisible();
   for (let retry = 0; retry < 2; retry++) {
    await a.getByRole('button', { name: 'Save item', exact: true }).click();
    const alert = a.locator('.editor [role="alert"]');
    await expect(alert).toContainText('Someone saved a newer version');
    await expect(alert).toContainText('Copy your edits before reloading');
    await expect(alert).toBeFocused();
    await expect(a.getByRole('button', { name: 'Load the latest version and keep my changes', exact: true })).toHaveCount(0);
    assert.deepEqual(await a.locator('.editor input, .editor textarea, .editor select').evaluateAll(nodes => nodes.map(n => ({ id: n.id, value: n.value, checked: n.checked }))), draft);
    await expect.poll(() => alert.evaluate(element => {
     const rect = element.getBoundingClientRect(), save = document.querySelector('.editor button[type="submit"]').getBoundingClientRect();
     return { focused: document.activeElement === element, visible: rect.top >= 0 && rect.bottom <= innerHeight, saveVisible: save.top >= rect.bottom && save.bottom <= innerHeight };
    })).toEqual({ focused: true, visible: true, saveVisible: true });
   }
   if (output) {
    await mkdir(output, { recursive: true });
    await a.screenshot({ path: join(output, `stale-${scenario}-refused-${width}.png`) });
   }
   // Read the colleague's value back from the second UI and its History door.
   await b.getByRole('button', { name: 'Refresh', exact: true }).click();
   await expect(b.getByRole('heading', { name: latestTitle, exact: true })).toBeVisible();
   await b.getByRole('button', { name: 'Reveal Password', exact: true }).click();
   await expect(b.getByLabel('Password', { exact: true })).toHaveValue(scenario === 'title' ? original : theirs);
   await b.locator('summary').filter({ hasText: /^History · version 2$/ }).click();
   await expect(b.locator('.history-row')).toHaveCount(2);
   await b.getByRole('button', { name: /Version 2 ·/ }).click();
   await expect(b.getByRole('heading', { name: 'Preview version 2', exact: true })).toBeVisible();
   await expect(b.locator('.restore-preview strong')).toHaveText(latestTitle);
   // History masks secrets in the UI; its public client read verifies the actual
   // retained password and that neither refused attempt appended a version.
   const record = (await typed.records(vault)).find(row => row.value.title === latestTitle);
   const history = await typed.history(vault, record.object);
   assert.equal(history.length, 2);
   const latest = history.find(row => row.version === 2);
   assert.equal(latest.value.title, latestTitle);
   assert.equal(latest.value.fields.find(field => field.id === 'password').value, scenario === 'title' ? original : theirs);
   if (output) await b.screenshot({ path: join(output, `stale-${scenario}-history-${width}.png`), fullPage: true });
   console.log(`Stale save ${width} ${scenario}: 2/2 attempts refused; 0 appended versions; 2 retained history versions; colleague value intact; draft unchanged; refusal and Save visible, refusal focused; merge buttons=0`);
   await a.locator('.editor').getByRole('button', { name: 'Cancel', exact: true }).first().click();
  }
 } finally { await other?.close(); await f.close(); }
}
