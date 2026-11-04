import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { bytes, decode, encode, random } from '../../src/latchkey/crypto/envelope.mjs';
import { join, dirname } from 'node:path';
import { expect } from '@playwright/test';
import { vaultFixture } from './fixture.mjs';
import { passboltFixture } from '../fixtures/passbolt.mjs';
import { ApiClient } from '../../src/latchkey/api/client.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
import { openMigrationPreview } from '../../src/latchkey/migration/plan.mjs';
import { previewPassbolt, importPassboltItem } from '../../src/latchkey/migration/passbolt.mjs';

export async function passboltJourney(width, output = process.env.LATCHKEY_SCREENSHOTS) {
 const source = await passboltFixture(), { plan, hash } = await previewPassbolt(source), f = await vaultFixture();
 try {
  const vault = (await f.owner.createVault({ kind: 'family' })).vault;
  await importPassboltItem(f.owner, plan, { approvedHash: hash, entry: source.entries[0], vault, confirmed: true, ownership: 'personal' });
  await f.page.setViewportSize({ width, height: 1000 });
  await f.page.goto(f.origin + '/app/vault');
  if (new URL(f.page.url()).pathname === '/setup') { await f.page.getByRole('checkbox').check(); await f.page.getByRole('button', { name: 'Finish setup', exact: true }).click(); }
  const profilePath = join(dirname(f.caFile), 'profile.json');
  await writeFile(profilePath, JSON.stringify(f.owner.profile), { mode: 0o600 });
  await f.page.getByLabel('Profile file').setInputFiles(profilePath);
  await f.page.getByLabel('Master password', { exact: true }).fill(f.password);
  await f.page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
  await f.page.getByRole('navigation', { name: 'Vault items' }).getByRole('button').filter({ hasText: 'synthetic-latchkey-1410' }).click();
  await expect(f.page.getByLabel('Source description', { exact: true })).toHaveValue('synthetic-latchkey-1450');
  const reveal = f.page.getByRole('button', { name: 'Reveal Secret note', exact: true });
  await reveal.hover(); await expect(f.page.getByRole('tooltip', { name: 'Reveal field' })).toBeVisible();
  await f.page.mouse.move(0, 0); await expect(f.page.getByRole('tooltip', { name: 'Reveal field' })).toBeHidden();
  await reveal.focus(); await expect(f.page.getByRole('tooltip', { name: 'Reveal field' })).toBeVisible();
  await reveal.click(); await expect(f.page.getByLabel('Secret note', { exact: true })).toHaveValue('synthetic-latchkey-1440\nsecond line');
  await f.page.getByRole('button', { name: 'Reveal Password', exact: true }).click();
  await expect(f.page.getByLabel('Password', { exact: true })).toHaveValue('synthetic-latchkey-1430');
  assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal viewport overflow');
  if (output) { await mkdir(output, { recursive: true }); await f.page.screenshot({ path: join(output, `passbolt-item-${width}.png`), fullPage: true }); }
 } finally { await f.close(); }
}
if (process.argv[1] === import.meta.filename) for (const width of [1440, 390]) { await passboltJourney(width); await migrationJourney(width); }

export async function migrationJourney(width, output = process.env.LATCHKEY_SCREENSHOTS) {
 const f = await vaultFixture(), directory = await mkdtemp(join(tmpdir(), 'latchkey-preview-'));
 const member = new VaultClient(f.origin, { fetcher: f.fetcher });
 const previewKey = encode(random()), sourceOwner = 'synthetic-latchkey-1600';
 const prepare = async (source, input, suffix, mapping) => {
  const sourcePath = join(directory, `source-${suffix}.json`), preview = join(directory, `preview-${suffix}.json`);
  await writeFile(sourcePath, input, { mode: 0o600 });
  const child = spawnSync(process.execPath, ['scripts/latchkey.mjs', 'migration-preview'], { input: JSON.stringify({ source, input: sourcePath, output: preview, sourceOrigin: 'https://vault.bitwarden.example.test', sourceOwner, previewKey, passphrase: 'synthetic-latchkey-1607', mapping }), encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const data = new Uint8Array(await readFile(preview));
  return { preview, data, ...(await openMigrationPreview(data, previewKey)) };
 };
 const capture = async name => { assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal viewport overflow'); if (output) { await mkdir(output, { recursive: true }); await f.page.screenshot({ path: join(output, `${name}-${width}.png`), fullPage: true }); } };
 try {
  const first = await prepare('bitwarden', await readFile(new URL('../fixtures/migration/bitwarden-portable.json', import.meta.url)), 'portable');
  const vault = (await f.owner.createVault({ kind: 'family' })).vault;
  await f.owner.put(vault, { schema: 'latchkey/vault-meta/v1', title: 'Personal import' });
  const company = (await f.owner.createVault()).vault;
  const lastpassVault = (await f.owner.createVault({ kind: 'family' })).vault;
  let sharedVault, foreignVault, browserProfile = f.owner.profile;
  if (width === 1440) {
   await new ApiClient(f.owner).inviteUser({ email: ['synthetic-latchkey-1672', 'example.test'].join('@'), displayName: 'Migration recipient', role: 'member' });
   const link = f.mail.at(-1).content.find(row => row.type.endsWith('plain')).value.match(/https:\/\/[^\s<>]+/)[0];
   await member.confirmIdentity(new URL(link).searchParams.get('token'));
   const enrolled = await member.register('synthetic-latchkey-1673'); await member.unlock(enrolled.profile, 'synthetic-latchkey-1673');
   sharedVault = (await f.owner.createVault({ kind: 'family' })).vault;
   await f.owner.share(sharedVault, member.profile.account, await member.identity().fingerprint, ['read']);
   foreignVault = (await member.createVault({ kind: 'family' })).vault;
   await member.share(foreignVault, f.owner.profile.account, await f.owner.identity().fingerprint, ['read']);
   const device = new VaultClient(f.origin, { fetcher: f.fetcher });
   const pending = await device.beginEnrollment(f.owner.profile, f.password);
   await f.owner.approveEnrollment(pending.device, pending.fingerprint);
   browserProfile = await device.completeEnrollment(pending.profile, f.password); browserProfile.trusted = structuredClone(f.owner.profile.trusted); device.lock();
  }
  const requests = [];
  f.page.on('request', request => { if (request.method() === 'POST') requests.push({ url: request.url(), body: request.postData() }); });
  await f.page.setViewportSize({ width, height: 1000 });
  await f.page.goto(f.origin + '/app/vault');
  if (new URL(f.page.url()).pathname === '/setup') { await f.page.getByRole('checkbox').check(); await f.page.getByRole('button', { name: 'Finish setup', exact: true }).click(); }
  await f.page.getByLabel('Profile file').setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(browserProfile)) });
  await f.page.getByLabel('Master password', { exact: true }).fill(f.password);
  await f.page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
  const settings = f.page.locator('summary').filter({ hasText: /^Settings$/ });
  const openPanel = async () => { await settings.click(); await f.page.getByRole('button', { name: 'Import encrypted preview', exact: true }).click(); };
  await openPanel();
  const panel = f.page.getByRole('region', { name: 'Import encrypted preview', exact: true });
  const upload = async (file, key = previewKey) => { await panel.getByLabel('Encrypted preview file', { exact: true }).setInputFiles(file); await panel.getByLabel('Preview key', { exact: true }).fill(key); await panel.getByRole('button', { name: 'Review preview', exact: true }).click(); };
  const approve = async (review, destination = vault) => {
   await panel.getByLabel('Destination vault', { exact: true }).selectOption(destination);
   await panel.getByLabel('Confirm preview hash', { exact: true }).fill(review.hash);
   await panel.getByLabel('Confirm personal source owner', { exact: true }).fill(sourceOwner);
   await panel.getByRole('checkbox').check();
  };
  const apply = () => panel.getByRole('button', { name: 'Import reviewed personal items', exact: true });
  const native = async () => (await f.owner.readVault(vault)).versions.filter(row => row.value.migration);
  if (width === 1440) {
   await upload(first.preview, encode(random()));
   await expect(panel.getByRole('alert')).toHaveText(/preview key is wrong/);
   assert.equal((await native()).length, 0);
   const tampered = JSON.parse(new TextDecoder().decode(first.data)), ciphertext = decode(tampered.envelope.ciphertext); ciphertext[0] ^= 1; tampered.envelope.ciphertext = encode(ciphertext);
   await upload({ name: 'tampered.json', mimeType: 'application/json', buffer: Buffer.from(bytes(tampered)) });
   await expect(panel.getByRole('alert')).toHaveText(/preview key is wrong/);
   assert.equal((await native()).length, 0);
  }
  await upload(first.preview);
  await expect(panel.getByRole('table', { name: 'Class reconciliation' })).toContainText('Unknown');
  await expect(panel.getByText('Unresolved source tasks', { exact: true })).toBeVisible();
  if (width === 1440) {
   const table = panel.getByRole('table', { name: 'Class reconciliation' });
   for (const [name, exported] of [['records', '1'], ['totp', '1'], ['attachments', '0'], ['history', '0'], ['passkeys', '0'], ['permissions', 'Unknown']]) {
    const row = table.getByRole('row').filter({ has: f.page.getByRole('rowheader', { name, exact: true }) });
    assert.deepEqual(await row.getByRole('cell').allTextContents(), [exported, 'Unknown']);
   }
  }
  await panel.getByText('synthetic-latchkey-1601 · Ready', { exact: true }).focus(); await f.page.keyboard.press('Enter');
  await expect(panel.getByLabel('Source note', { exact: true })).toHaveValue('synthetic-latchkey-1602\n日本語');
  await capture('migration-review');
  if (width === 1440) {
   await panel.getByRole('button', { name: 'Cancel preview', exact: true }).focus(); await f.page.keyboard.press('Enter');
   assert.equal((await native()).length, 0);
   await expect(panel.getByRole('heading', { name: 'Review before import' })).toHaveCount(0);
   assert.equal(await panel.getByLabel('Preview key', { exact: true }).inputValue(), '');
   await upload(first.preview);
   await approve(first, company); await apply().click();
   await expect(panel.getByRole('alert')).toContainText('personal destination required');
   assert.equal((await f.owner.readVault(company)).versions.length, 0);
   await approve(first, sharedVault); await apply().click();
   await expect(panel.getByRole('alert')).toContainText('private destination required');
   assert.equal((await f.owner.readVault(sharedVault)).versions.length, 0);
   await approve(first, foreignVault); await apply().click();
   await expect(panel.getByRole('alert')).toContainText('private destination required');
   assert.equal((await member.readVault(foreignVault)).versions.length, 0);
   await approve(first);
   await panel.getByLabel('Confirm personal source owner', { exact: true }).fill('synthetic-latchkey-1661'); await panel.getByRole('checkbox').check();
   await expect(apply()).toBeDisabled();
   await approve(first); await panel.getByLabel('Confirm preview hash', { exact: true }).fill('synthetic-latchkey-1662'); await panel.getByRole('checkbox').check(); await expect(apply()).toBeDisabled();
  }
  await approve(first); await apply().focus(); await f.page.keyboard.press('Enter');
  await expect(panel.getByRole('status').filter({ hasText: 'Imported 1;' })).toBeVisible();
  assert.equal((await native()).length, 1);
  assert.equal((await native())[0].value.fields.find(field => field.id === 'password').value, 'synthetic-latchkey-1604');
  await capture('migration-result');
  if (width === 1440) {
   await apply().click(); await expect(panel.getByRole('status').filter({ hasText: 'Imported 0; unchanged 1;' })).toBeVisible(); assert.equal((await native()).length, 1);
   const source = JSON.parse(await readFile(new URL('../fixtures/migration/bitwarden-plain.json', import.meta.url)));
   source.items[0].login.password = 'synthetic-latchkey-1663';
   const delta = await prepare('bitwarden', JSON.stringify(source), 'delta');
   await upload(delta.preview); await expect(apply()).toBeDisabled();
   await approve(delta); await apply().click(); await expect(panel.getByRole('status').filter({ hasText: 'Imported 1;' })).toBeVisible();
   const latest = (await native()).find(row => row.version === 2); latest.value.fields.find(field => field.id === 'password').value = 'synthetic-latchkey-1664';
   await f.owner.put(vault, latest.value, latest.object, 2);
   await apply().click(); await expect(panel.getByRole('status').filter({ hasText: 'Imported 0; unchanged 1;' })).toBeVisible();
   await upload(first.preview); await approve(first); await apply().click();
   await expect(panel.getByRole('alert')).toContainText('migration destination changed');
   assert.equal((await native()).length, 3); assert.equal((await native()).find(row => row.version === 3).value.fields.find(field => field.id === 'password').value, 'synthetic-latchkey-1664');
   // A second batch really crosses the browser transport, fails after one write,
   // then resumes through the same confirmation without duplicate identities.
   source.items.push({ ...source.items[0], id: 'synthetic-latchkey-1665', name: 'synthetic-latchkey-1666' });
   const batch = await prepare('bitwarden', JSON.stringify(source), 'batch'), batchVault = (await f.owner.createVault({ kind: 'family' })).vault;
   // Refresh discovers the new vault and clears the old review.
   await f.page.getByRole('button', { name: 'Vault', exact: true }).click();
   await f.page.getByRole('button', { name: 'Refresh', exact: true }).click(); await openPanel();
   await upload(batch.preview); await approve(batch, batchVault);
   let writes = 0;
   await f.page.route('**/api/latchkey/item/put', route => ++writes === 2 ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'service_unavailable' }) }) : route.continue());
   await apply().click(); await expect(panel.getByRole('alert')).toContainText('service unavailable');
   assert.equal((await f.owner.readVault(batchVault)).versions.length, 1);
   await f.page.unroute('**/api/latchkey/item/put'); await apply().click();
   await expect(panel.getByRole('status').filter({ hasText: 'Imported 1; unchanged 1;' })).toBeVisible();
   assert.equal((await f.owner.readVault(batchVault)).versions.length, 2);
   const Papa = (await import('papaparse')).default;
   const lp = { url: 'https://synthetic-latchkey.example.test', username: 'synthetic-latchkey-1667', password: 'synthetic-latchkey-1668', extra: '日本語\nsecond line', name: 'synthetic-latchkey-1669', grouping: '', fav: '0' };
   const lastpass = await prepare('lastpass', Papa.unparse([lp]), 'lastpass', [{ row: 1, id: 'synthetic-latchkey-1670' }]);
   await upload(lastpass.preview); await approve(lastpass, lastpassVault); await apply().click();
   await expect(panel.getByRole('status').filter({ hasText: 'Imported 1;' })).toBeVisible();
   const lpRows = (await f.owner.readVault(lastpassVault)).versions; assert.equal(lpRows.length, 1); assert.equal(lpRows[0].value.fields.find(field => field.id === 'password').value, lp.password);
   await apply().click(); await expect(panel.getByRole('status').filter({ hasText: 'Imported 0; unchanged 1;' })).toBeVisible();
   assert.equal((await f.owner.readVault(lastpassVault)).versions.length, 1);
   const shared = await prepare('lastpass', Papa.unparse([{ ...lp, grouping: 'synthetic-latchkey-1671' }]), 'shared', [{ row: 1, id: 'synthetic-latchkey-1670' }]);
   await upload(shared.preview); await approve(shared); await expect(apply()).toBeDisabled(); await expect(panel.getByRole('status').filter({ hasText: 'Resolve blocked rows' })).toBeVisible();
   await upload(first.preview);
  }
  // Existing native-item and tooltip assertions remain exercised at both widths.
  await f.page.getByRole('button', { name: 'Vault', exact: true }).click();
  await f.page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await f.page.getByLabel('Vault', { exact: true }).selectOption(vault);
  await f.page.getByRole('navigation', { name: 'Vault items' }).getByRole('button').filter({ hasText: 'synthetic-latchkey-1601' }).click();
  const reveal = f.page.getByRole('button', { name: 'Reveal Source note', exact: true });
  await reveal.hover(); await expect(f.page.getByRole('tooltip', { name: 'Reveal field' })).toBeVisible();
  await f.page.mouse.move(0, 0); await expect(f.page.getByRole('tooltip', { name: 'Reveal field' })).toBeHidden();
  await reveal.focus(); await expect(f.page.getByRole('tooltip', { name: 'Reveal field' })).toBeVisible();
  await reveal.click(); await expect(f.page.getByLabel('Source note', { exact: true })).toHaveValue('synthetic-latchkey-1602\n日本語');
  await f.page.getByRole('button', { name: 'Reveal Password', exact: true }).click();
  await expect(f.page.getByLabel('Password', { exact: true })).toHaveValue(width === 1440 ? 'synthetic-latchkey-1664' : 'synthetic-latchkey-1604');
  await capture('migration-item');
  const exposed = JSON.stringify(requests.filter(row => !row.url.endsWith('/auth/bootstrap')));
  const stored = JSON.stringify((await f.db.prepare('SELECT envelope FROM lky_versions').all()).results);
  const audit = JSON.stringify(await f.owner.call('audit', {}));
  for (const value of ['synthetic-latchkey-1601', 'synthetic-latchkey-1602', 'synthetic-latchkey-1604', 'synthetic-latchkey-1663', 'synthetic-latchkey-1664', 'synthetic-latchkey-1668', previewKey, 'synthetic-latchkey-1607']) { assert.ok(!exposed.includes(value)); assert.ok(!stored.includes(value)); assert.ok(!audit.includes(value)); }
  if (width === 1440) {
   await openPanel(); await upload(first.preview); await approve(first);
   const before = (await native()).length;
   await f.owner.call('device/revoke', { device: browserProfile.device });
   await apply().click(); await expect(f.page.getByRole('button', { name: 'Unlock vault', exact: true })).toBeVisible();
   await expect(f.page.getByRole('region', { name: 'Import encrypted preview', exact: true })).toHaveCount(0);
   assert.equal((await native()).length, before);
  }
 } catch (error) { if (output) await f.page.screenshot({ path: join(output, `migration-failure-${width}.png`), fullPage: true }); throw error; } finally { member.lock(); await f.close(); await rm(directory, { recursive: true, force: true }); }
}
