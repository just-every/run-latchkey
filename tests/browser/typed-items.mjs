import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { vaultFixture } from './fixture.mjs';
import { TypedItems } from '../../src/latchkey/items/client.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
import { digest } from '../../src/latchkey/crypto/envelope.mjs';

const output = process.env.LATCHKEY_SCREENSHOTS;
const key = number => `synthetic-latchkey-${number}\nsynthetic-latchkey-${number + 1}\n\nsynthetic-latchkey-${number + 2}\n`;
const privateKey = row => row.value.fields.find(field => field.id === 'privateKey');
const exactBytes = (actual, expected) => assert.deepEqual(Buffer.from(actual), Buffer.from(expected));

// One public-door journey: assertions at 1440, with the same changed screens
// and an overflow smoke at 390. No native client or provider execution inferred.
export async function typedItemJourney() {
 const f = await vaultFixture(), page = f.page, wire = [], secrets = [];
 let keeper, foreign;
 const typed = new TypedItems(f.owner);
 const capture = async name => {
  for (const width of [1440, 390]) {
   await page.setViewportSize({ width, height: 1000 });
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'typed item viewport overflow');
   if (output) await page.screenshot({ path: join(output, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
 };
 const masked = async (selector, value = '••••••••••••') => {
  await expect(page.locator(selector)).toHaveAttribute('type', 'password');
  await expect(page.locator(selector)).toHaveValue(value);
  await expect(page.locator(selector)).toHaveAttribute('readonly', '');
 };
 const save = async title => {
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
 };
 const edit = () => page.getByRole('button', { name: 'Edit', exact: true }).click();
 const cancel = () => page.locator('.editor').getByRole('button', { name: 'Cancel', exact: true }).first().click();
 const revealEdit = async () => {
  await page.getByRole('button', { name: 'Reveal to edit Private key', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('textarea#edit-privateKey')).toBeVisible();
 };
 try {
  if (output) await mkdir(output, { recursive: true });
  page.on('request', request => { wire.push(request.url(), request.postData() ?? ''); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const vault = (await f.owner.createVault()).vault;
  await f.owner.put(vault, { schema: 'latchkey/vault-meta/v1', title: 'Synthetic typed vault' });
  await page.goto(f.origin + '/app/vault');
  if (new URL(page.url()).pathname === '/setup') {
   await page.getByRole('checkbox').check();
   await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  }
  await page.getByLabel('Profile file').setInputFiles({ name: 'profile.json', mimeType: 'application\u002fjson', buffer: Buffer.from(JSON.stringify(f.owner.profile)) });
  await page.getByLabel('Master password', { exact: true }).fill(f.password);
  await page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New item', exact: true })).toBeEnabled();
  await f.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: f.origin });
  const records = [];
  for (const [index, type] of ['ssh-key', 'server', 'certificate'].entries()) {
   const title = `Synthetic multiline ${type}`, initial = key(8100 + index * 20), changed = key(8110 + index * 20);
   secrets.push(initial, changed);
   const attachment = Buffer.from(`synthetic-latchkey-${8200 + index}`);
   const laterAttachment = Buffer.from(`synthetic-latchkey-${8210 + index}`);
   secrets.push(attachment.toString(), laterAttachment.toString());
   await page.getByRole('button', { name: 'New item', exact: true }).click();
   await page.getByLabel('Item type').selectOption(type);
   await page.getByLabel('Title', { exact: true }).fill(title);
   await masked('#edit-privateKey', '');
   await revealEdit();
   await page.locator('#edit-privateKey').fill(initial);
   await page.getByLabel('Add attachment', { exact: true }).setInputFiles({ name: `synthetic-latchkey-${8200 + index}.txt`, mimeType: 'text\u002fplain', buffer: attachment });
   await expect(page.locator('.editor .file')).toHaveCount(1);
   await capture(`typed-${type}-entry`);
   await save(title);
   const row = (await typed.records(vault)).find(row => row.value.title === title);
   assert.ok(row); records.push(row);
   exactBytes(privateKey(row).value, initial);
   assert.equal(privateKey(row).type, 'secret'); assert.equal(privateKey(row).secret, true);
   const originalAttachment = row.value.attachments[0];
   assert.equal(originalAttachment.digest, await digest(attachment));
   // Opening never places the secret in the masked input or the history preview.
   await expect(page.locator('#view-privateKey')).toHaveAttribute('type', 'password');
   await expect(page.locator('#view-privateKey')).toHaveValue('••••••••••••');
   const reveal = page.getByRole('button', { name: 'Reveal Private key', exact: true });
   await reveal.hover(); await expect(page.getByRole('tooltip').filter({ hasText: 'Reveal field' })).toBeVisible();
   await reveal.focus(); await page.keyboard.press('Enter');
   await expect(page.locator('textarea#view-privateKey')).toHaveValue(initial);
   const copy = page.getByRole('button', { name: 'Copy Private key', exact: true });
   await copy.focus(); await expect(page.getByRole('tooltip').filter({ hasText: 'Copy field' })).toBeVisible();
   await page.keyboard.press('Enter');
   await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(initial);
   exactBytes(await page.evaluate(() => navigator.clipboard.readText()), initial);
   await page.evaluate(() => navigator.clipboard.writeText(''));
   await capture(`typed-${type}-revealed`);
   await page.getByRole('button', { name: 'Hide Private key', exact: true }).click();
   // An unrelated edit saves the untouched, masked key, including its final newline.
   await edit(); await masked('#edit-privateKey');
   await page.getByLabel('Tags (comma separated)', { exact: true }).fill('Synthetic review');
   await save(title);
   exactBytes(privateKey(await typed.current(vault, row.object)).value, initial);
   await edit(); await revealEdit();
   await expect(page.locator('#edit-privateKey')).toHaveValue(initial);
   await page.locator('#edit-privateKey').fill(changed);
   await cancel();
   assert.equal((await typed.history(vault, row.object)).length, 2);
   exactBytes(privateKey(await typed.current(vault, row.object)).value, initial);
   await edit(); await revealEdit(); await page.locator('#edit-privateKey').fill(changed);
   await page.locator('.editor .file').getByRole('button', { name: 'Remove', exact: true }).click();
   await page.getByLabel('Add attachment', { exact: true }).setInputFiles({ name: `synthetic-latchkey-${8210 + index}.txt`, mimeType: 'text\u002fplain', buffer: laterAttachment });
   await expect(page.locator('.editor .file')).toHaveCount(1);
   await page.getByRole('button', { name: 'Hide Private key', exact: true }).click(); await masked('#edit-privateKey');
   await save(title);
   const before = await typed.history(vault, row.object);
   assert.equal(before.length, 3); exactBytes(privateKey(before[2]).value, changed);
   assert.equal(before[2].value.attachments[0].digest, await digest(laterAttachment));
   assert.notEqual(before[2].value.attachments[0].digest, originalAttachment.digest);
   await page.getByRole('button', { name: 'Copy Private key', exact: true }).click();
   await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(changed);
   exactBytes(await page.evaluate(() => navigator.clipboard.readText()), changed);
   await page.evaluate(() => navigator.clipboard.writeText(''));
   await page.locator('summary').filter({ hasText: /^History · version 3$/ }).click();
   await page.getByRole('button', { name: /Version 1 ·/ }).click();
   await expect(page.locator('.restore-preview')).toContainText('Sensitive value retained in this version');
   assert.ok(!(await page.locator('.restore-preview').textContent()).includes(initial));
   await expect(page.getByRole('button', { name: 'Restore version 1', exact: true })).toBeDisabled();
   await capture(`typed-${type}-history`);
   await page.getByRole('button', { name: 'Close preview', exact: true }).click();
   assert.deepEqual(await typed.history(vault, row.object), before);
   await page.getByRole('button', { name: /Version 1 ·/ }).click();
   await page.getByLabel('Restore this version as a new current version', { exact: true }).focus();
   await page.keyboard.press('Space');
   await page.getByRole('button', { name: 'Restore version 1', exact: true }).focus(); await page.keyboard.press('Enter');
   await expect(page.locator('summary').filter({ hasText: /^History · version 4$/ })).toBeVisible();
   const after = await typed.history(vault, row.object);
   assert.equal(after.length, 4); assert.deepEqual(after.slice(0, 3), before);
   exactBytes(privateKey(after[3]).value, initial);
   await page.getByRole('button', { name: 'Copy Private key', exact: true }).click();
   await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(initial);
   exactBytes(await page.evaluate(() => navigator.clipboard.readText()), initial);
   await page.evaluate(() => navigator.clipboard.writeText(''));
   assert.equal(after[3].value.change.restoredFrom, 1);
   assert.deepEqual(after[3].value.attachments[0], originalAttachment);
   exactBytes((await typed.attachment(vault, row.object, originalAttachment.id)).data, attachment);
   const download = page.waitForEvent('download');
   await page.getByRole('button', { name: `Download ${originalAttachment.name}`, exact: true }).click();
   exactBytes(await readFile(await (await download).path()), attachment);
   // A newer saved key wins; a stale masked draft cannot overwrite it on retry.
   await edit(); await masked('#edit-privateKey');
   await page.getByLabel('Title', { exact: true }).fill(title + ' stale');
   const latest = structuredClone(after[3].value); privateKey({ value: latest }).value = changed;
   await typed.save(vault, latest, row.object);
   for (let retry = 0; retry < 2; retry++) {
    await page.getByRole('button', { name: 'Save item', exact: true }).click();
    await expect(page.locator('.editor [role="alert"]')).toContainText('Someone saved a newer version');
    await masked('#edit-privateKey');
   }
   const retained = await typed.history(vault, row.object);
   assert.equal(retained.length, 5); assert.deepEqual(retained.slice(0, 4), after);
   exactBytes(privateKey(retained[4]).value, changed);
   await cancel(); await page.getByRole('button', { name: 'Refresh', exact: true }).click();
   await expect(page.getByRole('navigation', { name: 'Vault items' }).getByRole('button').filter({ hasText: title })).toBeVisible();
   await expect(page.getByRole('status')).not.toHaveText('Working…');
   console.log(`PROBE LKY-002 ${type}: built UI entry, masked unrelated edit, copy, cancel, confirmed restore and stale save -> exact bytes, five append-only versions and attachment digest preserved`);
  }
  // Older items may omit an unfilled built-in field. Current authority still
  // allows adding it, without changing its stored secret definition.
  const legacyTitle = 'Synthetic server without key', legacyKey = key(8250);
  secrets.push(legacyKey);
  const legacy = await typed.save(vault, createItem('server', { title: legacyTitle, values: { host: 'server.example.test' } }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('navigation', { name: 'Vault items' }).getByRole('button').filter({ hasText: legacyTitle }).click();
  await edit(); await masked('#edit-privateKey', ''); await revealEdit();
  await page.locator('#edit-privateKey').fill(legacyKey); await save(legacyTitle);
  const updatedLegacy = privateKey(await typed.current(vault, legacy.object));
  exactBytes(updatedLegacy.value, legacyKey); assert.equal(updatedLegacy.type, 'secret'); assert.equal(updatedLegacy.secret, true);
  console.log('PROBE LKY-002 existing record: built UI adds a previously absent private-key field -> multiline bytes preserved and stored definition unchanged');
  // A real different account has no authority over these records.
  const response = await f.fetcher(f.origin + '/auth/invite', { method: 'POST', headers: { origin: f.origin, cookie: f.owner.cookie, 'content-type': 'application\u002fjson' }, body: JSON.stringify({ email: 'synthetic-latchkey-8300' + String.fromCharCode(64) + 'example.test', displayName: 'Synthetic foreign reader', role: 'member' }) });
  assert.equal(response.status, 202);
  const link = f.mail.at(-1).content.find(part => part.type === ['text', 'plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0];
  foreign = new VaultClient(f.origin, { fetcher: f.fetcher }); await foreign.confirmIdentity(new URL(link).searchParams.get('token'));
  const registered = await foreign.register('synthetic-latchkey-8301'); await foreign.unlock(registered.profile, 'synthetic-latchkey-8301');
  const denied = new TypedItems(foreign);
  for (const row of records) {
   const before = await typed.history(vault, row.object);
   for (const action of ['reveal', 'copy']) await assert.rejects(denied.field(vault, row.object, 'privateKey', action), error => error.status === 404 || error.status === 403);
   await assert.rejects(denied.restore(vault, row.object, 1, { confirmed: true, expectedVersion: 5 }), error => error.status === 404 || error.status === 403);
   await assert.rejects(denied.save(vault, row.value, row.object), error => error.status === 404 || error.status === 403);
   assert.deepEqual(await typed.history(vault, row.object), before);
  }
  // Keep an independently enrolled device for verification after real revocation.
  keeper = new VaultClient(f.origin, { cookie: f.owner.cookie, fetcher: f.fetcher });
  const enrollment = await keeper.beginEnrollment(f.owner.profile, f.password);
  await f.owner.approveEnrollment(enrollment.device, enrollment.fingerprint);
  const profile = await keeper.completeEnrollment(enrollment.profile, f.password); await keeper.unlock(profile, f.password);
  await page.getByRole('navigation', { name: 'Vault items' }).getByRole('button').filter({ hasText: records[0].value.title }).click();
  await edit(); await masked('#edit-privateKey');
  const keeperItems = new TypedItems(keeper), beforeRevocation = await keeperItems.history(vault, records[0].object);
  await keeper.call(['device', 'revoke'].join('/'), { device: f.owner.profile.device });
  await page.getByRole('button', { name: 'Reveal to edit Private key', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock your vault', exact: true })).toBeVisible();
  await expect(page.locator('#edit-privateKey, #view-privateKey, .restore-preview')).toHaveCount(0);
  for (const action of ['reveal', 'copy']) await assert.rejects(typed.field(vault, records[0].object, 'privateKey', action), error => error.status === 401);
  await assert.rejects(typed.restore(vault, records[0].object, 1, { confirmed: true, expectedVersion: 5 }), error => error.status === 401);
  await assert.rejects(typed.save(vault, records[0].value, records[0].object), error => error.status === 401);
  assert.deepEqual(await keeperItems.history(vault, records[0].object), beforeRevocation);
  const audit = await keeper.call(['audit', 'list'].join('/'), { filters: { vault, action: 'reveal' }, after: 0, limit: 200 });
  assert.ok(audit.entries.some(event => event.result === 'succeeded'));
  const tables = (await f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lky_%'").all()).results;
  const stored = [];
  for (const { name } of tables) { assert.match(name, /^lky_[a-z_]+$/); stored.push((await f.db.prepare('SELECT * FROM ' + name).all()).results); }
  for (const surface of [wire.join('\n'), JSON.stringify(audit), JSON.stringify(stored), f.runtimeLogs.join('\n')]) {
   for (const value of secrets.flatMap(secret => [secret, ...secret.trim().split('\n').filter(Boolean)])) assert.ok(!surface.includes(value), 'private value escaped encrypted client boundary');
  }
  console.log('PROBE LKY-002 authority and leakage: foreign and revoked reveal, copy, edit and restore -> refused, unchanged versions, cleared editor; requests, audit, storage and logs secret-free');
 } catch (error) {
  if (output) await page.screenshot({ path: join(output, 'typed-items-failure.png'), fullPage: true });
  throw error;
 } finally { keeper?.lock(); foreign?.lock(); await f.close(); }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) await typedItemJourney();
