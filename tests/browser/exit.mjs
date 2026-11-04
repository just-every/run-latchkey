import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { vaultFixture } from './fixture.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
import { SelectionExportClient } from '../../src/latchkey/portability/selection.mjs';
import { selectionRoutes } from '../../src/latchkey/portability/selection-common.mjs';
import { LifecycleClient } from '../../src/latchkey/lifecycle/client.mjs';
import { createAttachment } from '../../src/latchkey/items/attachments.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';
import { decode, digest, encode, random } from '../../src/latchkey/crypto/envelope.mjs';

const file = (name, value) => ({ name, mimeType: 'application\u002fjson', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
const contents = async download => { let text = ''; for await (const chunk of await download.createReadStream()) text += chunk; return text; };
const capture = async (page, name, output) => {
 if (!output) return;
 await mkdir(output, { recursive: true });
 for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow'); await page.screenshot({ path: join(output, `exit-${name}-${width}.png`), fullPage: true }); }
 await page.setViewportSize({ width: 1440, height: 1000 });
};
async function openPanel(f, page = f.page, client = f.owner, password = f.password) {
 await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(f.origin + '/app/vault');
 if (new URL(page.url()).pathname === '/setup') { await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click(); }
 await page.getByLabel('Profile file').setInputFiles(file('profile.json', client.profile));
 await page.getByLabel('Master password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
 await page.locator('summary').filter({ hasText: /^Settings$/ }).click(); await page.getByRole('button', { name: 'Export and import', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Export and import', exact: true })).toBeVisible();
}
async function member(f, suffix) {
 // Fixture identities are constructed, with no personal mailbox in source.
 const email = `synthetic-latchkey-${suffix}` + String.fromCharCode(64) + 'example.test', password = `synthetic-latchkey-${suffix + 1}`;
 const response = await f.fetcher(f.origin + '/auth/invite', { method: 'POST', headers: { origin: f.origin, cookie: f.owner.cookie, 'content-type': 'application\u002fjson' }, body: JSON.stringify({ email, displayName: 'Synthetic export reader', role: 'member' }) }); assert.equal(response.status, 202);
 const token = new URL(f.mail.at(-1).content.find(row => row.type === 'text\u002fplain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
 const client = new VaultClient(f.origin, { fetcher: f.fetcher }); await client.confirmIdentity(token); const enrollment = await client.register(password); await client.unlock(enrollment.profile, password);
 const context = await f.browser.newContext({ ignoreHTTPSErrors: true }), separator = client.cookie.indexOf('=');
 await context.addCookies([{ name: client.cookie.slice(0, separator), value: client.cookie.slice(separator + 1), url: f.origin, secure: true, httpOnly: true, sameSite: 'Lax' }]);
 return { client, context, page: await context.newPage(), password };
}
export async function selectedExitJourney(output = process.env.LATCHKEY_SCREENSHOTS) {
 const f = await vaultFixture(), destination = await vaultFixture(); let reader, destinationReader, keeper, importDevice, importContext;
 const requests = [], downloads = [], importRequests = [];
 f.page.on('request', request => { if (request.url().includes('/api/latchkey/')) requests.push({ path: new URL(request.url()).pathname, body: request.postData() ?? '' }); });
 f.page.on('download', value => downloads.push(value));
 destination.page.on('request', request => { if (request.url().includes('/api/latchkey/')) importRequests.push({ path: new URL(request.url()).pathname, body: request.postData() ?? '' }); });
 const page = f.page, to = destination.page;
 try {
  const vault = (await f.owner.createVault()).vault, other = (await f.owner.createVault({ kind: 'family' })).vault;
  const attachment = await createAttachment('synthetic-latchkey-8170.txt', new TextEncoder().encode('synthetic-latchkey-8171'), 'text\u002fplain');
  const item = await f.owner.put(vault, createItem('login', { title: 'Export login', values: { password: 'synthetic-latchkey-8172' } }));
  await f.owner.put(vault, createItem('login', { title: 'Export login revised', values: { password: 'synthetic-latchkey-8173' }, attachments: [attachment] }), item.object, 1);
  const archived = await f.owner.put(vault, createItem('secure-note', { title: 'Archived selection', values: { note: 'synthetic-latchkey-8174' } }));
  const trash = await f.owner.put(vault, createItem('secure-note', { title: 'Trashed selection', values: { note: 'synthetic-latchkey-8175' } }));
  await f.owner.put(other, createItem('secure-note', { title: 'Omitted family record', values: { note: 'synthetic-latchkey-8176' } }));
  const lifecycle = new LifecycleClient(f.owner); await lifecycle.change(vault, archived.object, 'archived', { confirmed: true }); await lifecycle.change(vault, trash.object, 'trash', { confirmed: true });
  const expected = (await f.owner.readVault(vault)).versions, expectedLifecycle = (await lifecycle.list(vault)).items;
  reader = await member(f, 8180);
  await reader.client.pinAccount(f.owner.profile.account, await f.owner.identity().fingerprint);
  await f.owner.share(vault, reader.client.profile.account, await reader.client.identity().fingerprint, ['read']);
  // Non-owners see the actual shared vault, but cannot select it for export.
  await openPanel(f, reader.page, reader.client, reader.password);
  await expect(reader.page.getByLabel(new RegExp(`Select .*${vault.slice(0, 8)}`))).toBeDisabled();
  await expect(reader.page.getByText('Not owned by this account.', { exact: false })).toBeVisible();
  await assert.rejects(new SelectionExportClient(reader.client).preview([{ vault, objects: null }]), error => error.code === 'permission_denied');
  await openPanel(f);
  const choose = page.getByLabel(new RegExp(`Select .*${vault.slice(0, 8)}`));
  await choose.focus(); await page.keyboard.press('Space');
  const selectionMode = page.getByLabel(new RegExp(`Selection for .*${vault.slice(0, 8)}`));
  await selectionMode.selectOption('items'); await page.getByLabel(new RegExp(`Export login revised`)).check();
  await page.getByLabel('Export purpose', { exact: true }).fill('synthetic-latchkey-8177'); await page.getByLabel('Intended target', { exact: true }).fill('synthetic-latchkey-8178');
  const review = page.getByRole('button', { name: 'Review encrypted export', exact: true }), exact = page.getByRole('region', { name: 'Exact selection review' });
  await review.click();
  await expect(exact).toContainText('1 items · 2 versions · 1 attachments'); await expect(exact).toContainText('2 omitted items'); await expect(exact).toContainText('1 visible vaults omitted');
  await expect(exact).toContainText('synthetic-latchkey-8177'); await expect(exact).toContainText('synthetic-latchkey-8178'); await expect(exact).toContainText('cannot be remotely recalled');
  await expect(page.getByRole('button', { name: 'Download encrypted selection', exact: true })).toBeDisabled();
  const mutations = () => requests.filter(row => [selectionRoutes.authorize, selectionRoutes.release, selectionRoutes.import].some(route => row.path.endsWith('/' + route)));
  assert.equal(mutations().length, 0);
  await capture(page, 'item-review', output);
  await page.getByRole('button', { name: 'Cancel and clear', exact: true }).click();
  await expect(exact).toHaveCount(0); assert.equal(mutations().length, 0); assert.equal(downloads.length, 0);
  await expect(page.getByLabel('Export purpose', { exact: true })).toHaveValue('Migration');
  await expect(page.getByLabel('Intended target', { exact: true })).toHaveValue('Buyer-held private file');
  console.log('PROBE LKY-017 cancellation: browser item review then Cancel -> no authorization, release, download or import');

  await choose.check();
  await page.getByLabel('Export purpose', { exact: true }).fill('synthetic-latchkey-8177'); await page.getByLabel('Intended target', { exact: true }).fill('synthetic-latchkey-8178');
  await review.click();
  const keyDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Generate and save buyer key', exact: true }).click(); const exportKey = (await contents(await keyDownload)).trim(); assert.equal(decode(exportKey).length, 32);
  await page.getByLabel('I retained the buyer key separately from the export', { exact: true }).check();
  const approval = page.getByLabel('I approve this exact encrypted selection, purpose, target and copy custody', { exact: true });
  const exportButton = page.getByRole('button', { name: 'Download encrypted selection', exact: true });
  // A policy change invalidates even an encrypted review. No stale approval travels.
  await new SelectionExportClient(f.owner).setPlaintextPolicy(vault, false, { confirmed: true }); await approval.check(); await exportButton.click();
  await expect(page.getByRole('alert')).toContainText('Source data or policy changed'); assert.equal(downloads.length, 1); await expect(exact).toHaveCount(0);
  await review.click(); await approval.check();
  // Real mutations immediately before release exercise the final live fence.
  await page.route('**/api/latchkey/selection/release', async route => { await f.owner.put(vault, createItem('secure-note', { title: 'Concurrent source change', values: { note: 'synthetic-latchkey-8179' } })); await route.continue(); }, { times: 1 });
  await exportButton.click(); await expect(page.getByRole('alert')).toContainText('Current authority, source or policy changed'); assert.equal(downloads.length, 1);
  await review.click(); await approval.check();
  await page.route('**/api/latchkey/selection/release', async route => { await new SelectionExportClient(f.owner).setPlaintextPolicy(vault, false, { confirmed: true }); await route.continue(); }, { times: 1 });
  await exportButton.click(); await expect(page.getByRole('alert')).toContainText('Current authority, source or policy changed'); assert.equal(downloads.length, 1);
  console.log('PROBE LKY-017 final fences: browser export with stale policy and source or policy changes at release -> refusal, no selection download');

  // Select whole company and family vaults explicitly; all source content is retained.
  await page.getByLabel(new RegExp(`Select .*${other.slice(0, 8)}`)).check(); await review.click();
  await expect(exact).toContainText('Complete company: no'); await expect(exact).toContainText('unknown; not inspected'); await expect(exact).toContainText('2 lifecycle observations');
  await capture(page, 'vault-review', output);
  // Fail the browser's actual download initiation after a real release. The
  // retained outcome must distinguish that failure from a delivery receipt.
  await page.evaluate(() => {
   const original = HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click = function () {
    if (this.download === 'latchkey-selection.json') { HTMLAnchorElement.prototype.click = original; throw new DOMException('Synthetic download refusal', 'NotAllowedError'); }
    return original.call(this);
   };
  });
  await approval.check(); await exportButton.click();
  await expect(page.getByRole('alert')).toContainText('browser download could not be initiated');
  assert.equal(downloads.length, 1); await expect(exact).toHaveCount(0);
  const failedOutcome = await f.owner.call(['audit', 'list'].join('/'), { filters: { action: 'selection_outcome' }, after: 0, limit: 200 });
  assert.equal(failedOutcome.entries.filter(row => row.clientOutcome === 'browser_download_failed' && row.result === 'succeeded').length, 1);
  await capture(page, 'download-refused', output);
  console.log('PROBE LKY-017 download failure: real release followed by refused browser initiation -> no selection download, distinct client-reported failure and a new review required');
  await review.click();
  await approval.focus(); await page.keyboard.press('Space');
  const selectionDownload = page.waitForEvent('download'); await exportButton.focus(); await page.keyboard.press('Enter');
  const archiveText = await contents(await selectionDownload), archive = JSON.parse(archiveText);
  await expect(page.getByRole('status').filter({ hasText: 'Browser download initiated' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No buyer key loaded.' })).toBeVisible();
  const opened = await SelectionExportClient.open(archive, exportKey);
  const sourceRows = (await f.owner.readVault(vault)).versions;
  assert.deepEqual(opened.vaults.find(row => row.vault === vault).versions, sourceRows);
  assert.deepEqual(opened.vaults.find(row => row.vault === vault).versions.filter(row => row.object !== sourceRows.find(row => row.value.title === 'Concurrent source change').object), expected);
  assert.deepEqual(opened.vaults.find(row => row.vault === vault).lifecycle, expectedLifecycle);
  assert.ok(!archiveText.includes('synthetic-latchkey-8173'));
  const sourceAudit = await f.owner.call(['audit', 'list'].join('/'), { filters: { action: 'selection_outcome' }, after: 0, limit: 200 });
  assert.equal(sourceAudit.entries.filter(row => row.clientOutcome === 'browser_download_initiated' && row.result === 'succeeded').length, 1);
  assert.match(sourceAudit.entries.find(row => row.clientOutcome === 'browser_download_initiated').exportOutcome, /not verified/);
  await capture(page, 'download-initiated', output);
  console.log('PROBE LKY-017 encrypted review: actual whole-vault browser export with independently saved key -> exact included content, counts, omissions and client-reported download outcome');

  await openPanel(destination); await to.getByRole('button', { name: 'Import selection', exact: true }).click();
  const upload = async value => to.getByLabel('Encrypted selection file', { exact: true }).setInputFiles(file('selected.json', value));
  const keyFile = async value => to.getByLabel('Buyer export key file', { exact: true }).setInputFiles(file('buyer.key', value));
  const openFile = to.getByRole('button', { name: 'Open encrypted file', exact: true });
  await upload(archive); await keyFile(encode(random())); await openFile.click();
  await expect(to.getByRole('alert')).toContainText('could not be verified'); assert.deepEqual(await destination.owner.call('vaults', {}), []);
  const tampered = structuredClone(archive); tampered.ciphertext = (tampered.ciphertext[0] === 'A' ? 'B' : 'A') + tampered.ciphertext.slice(1);
  await upload(tampered); await keyFile(exportKey); await openFile.click(); await expect(to.getByRole('alert')).toContainText('could not be verified'); assert.deepEqual(await destination.owner.call('vaults', {}), []);
  await upload(opened); await expect(to.getByRole('alert')).toContainText('Plaintext browser ceremonies are not supported');
  await upload(archive); await keyFile(exportKey);
  const beforeOfflineOpen = importRequests.length;
  await destination.context.setOffline(true); await openFile.click();
  const importReview = to.getByRole('region', { name: 'Exact selection review' }); await expect(importReview).toContainText(opened.planHash);
  assert.equal(importRequests.length, beforeOfflineOpen); await destination.context.setOffline(false);
  console.log('PROBE LKY-017 offline opening: loaded destination browser disconnected from service, buyer file and key -> verified local exact-plan review, no request');
  await capture(to, 'import-review', output);
  await to.getByRole('button', { name: 'Cancel and clear', exact: true }).click(); await expect(importReview).toHaveCount(0); assert.deepEqual(await destination.owner.call('vaults', {}), []);
  assert.equal(importRequests.filter(row => row.path.endsWith('/' + selectionRoutes.import)).length, 0);
  console.log('PROBE LKY-017 import refusals: browser wrong key, tampered ciphertext, plaintext and Cancel -> no destination writes');

  destinationReader = await member(destination, 8184); await openPanel(destination, destinationReader.page, destinationReader.client, destinationReader.password);
  const memberPage = destinationReader.page; await memberPage.getByRole('button', { name: 'Import selection', exact: true }).click();
  await memberPage.getByLabel('Encrypted selection file', { exact: true }).setInputFiles(file('selected.json', archive)); await memberPage.getByLabel('Buyer export key file', { exact: true }).setInputFiles(file('buyer.key', exportKey)); await memberPage.getByRole('button', { name: 'Open encrypted file', exact: true }).click();
  await memberPage.getByLabel('I approve this exact selection into fresh owner-only vaults', { exact: true }).check(); await memberPage.getByRole('button', { name: 'Import reviewed selection', exact: true }).click();
  await expect(memberPage.getByRole('alert')).toContainText('Only the current destination installation owner'); assert.deepEqual(await destination.owner.call('vaults', {}), []);

  // A second real owner device reviews the file, then loses authority at the
  // atomic import door. The still-enrolled owner can subsequently import it.
  importDevice = new VaultClient(destination.origin, { cookie: destination.owner.cookie, fetcher: destination.fetcher });
  const importEnrollment = await importDevice.beginEnrollment(destination.owner.profile, destination.password);
  await destination.owner.approveEnrollment(importEnrollment.device, importEnrollment.fingerprint);
  const importProfile = await importDevice.completeEnrollment(importEnrollment.profile, destination.password); await importDevice.unlock(importProfile, destination.password);
  importContext = await destination.browser.newContext({ ignoreHTTPSErrors: true });
  const separator = importDevice.cookie.indexOf('=');
  await importContext.addCookies([{ name: importDevice.cookie.slice(0, separator), value: importDevice.cookie.slice(separator + 1), url: destination.origin, secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const revokedPage = await importContext.newPage(); await openPanel(destination, revokedPage, importDevice, destination.password);
  await revokedPage.getByRole('button', { name: 'Import selection', exact: true }).click();
  await revokedPage.getByLabel('Encrypted selection file', { exact: true }).setInputFiles(file('selected.json', archive)); await revokedPage.getByLabel('Buyer export key file', { exact: true }).setInputFiles(file('buyer.key', exportKey)); await revokedPage.getByRole('button', { name: 'Open encrypted file', exact: true }).click();
  await revokedPage.getByLabel('I approve this exact selection into fresh owner-only vaults', { exact: true }).check();
  await revokedPage.route('**/api/latchkey/selection/import', async route => { await destination.owner.call(['device', 'revoke'].join('/'), { device: importDevice.profile.device }); await route.continue(); }, { times: 1 });
  await revokedPage.getByRole('button', { name: 'Import reviewed selection', exact: true }).click();
  await expect(revokedPage.getByRole('alert')).toBeVisible(); await expect(revokedPage.getByRole('region', { name: 'Exact selection review' })).toHaveCount(0);
  await expect(revokedPage.getByRole('status').filter({ hasText: 'No buyer key loaded.' })).toBeVisible(); assert.deepEqual(await destination.owner.call('vaults', {}), []);
  console.log('PROBE LKY-017 destination authority: reviewed browser import after real owner-device revocation -> refusal, cleared key and no destination vaults');

  await upload(archive); await keyFile(exportKey); await openFile.click();
  await to.route('**/api/latchkey/selection/import', route => route.abort('failed'), { times: 1 });
  await to.getByLabel('I approve this exact selection into fresh owner-only vaults', { exact: true }).check();
  await to.getByRole('button', { name: 'Import reviewed selection', exact: true }).click();
  await expect(to.getByRole('alert')).toContainText('The import outcome could not be verified');
  await expect(importReview).toHaveCount(0); assert.deepEqual(await destination.owner.call('vaults', {}), []);
  assert.equal(importRequests.filter(row => row.path.endsWith('/' + selectionRoutes.import)).length, 1);
  await capture(to, 'import-unverified', output);
  console.log('PROBE LKY-017 unavailable import: browser transport refusal -> unverified outcome, cleared review, no automatic retry or destination writes');
  await upload(archive); await keyFile(exportKey); await openFile.click();
  const importButton = to.getByRole('button', { name: 'Import reviewed selection', exact: true }); await expect(importButton).toBeDisabled();
  // Commit through the real Worker, then drop its response. The browser must
  // reconcile the exact prepared destinations without sending another import.
  await to.route('**/api/latchkey/selection/import', async route => { const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed'); }, { times: 1 });
  await to.getByLabel('I approve this exact selection into fresh owner-only vaults', { exact: true }).focus(); await to.keyboard.press('Space'); await importButton.focus(); await to.keyboard.press('Enter');
  await expect(to.getByRole('heading', { name: 'Reconciled destination', exact: true })).toBeVisible();
  await expect(to.getByRole('status').filter({ hasText: 'Import reconciled.' })).toBeVisible();
  await expect(to.getByRole('status').filter({ hasText: 'No import retry was sent.' })).toBeVisible();
  assert.equal(importRequests.filter(row => row.path.endsWith('/' + selectionRoutes.import)).length, 2);
  console.log('PROBE LKY-017 interrupted import: atomic browser import with lost response -> current reads reconcile exact content and lifecycle, one import request');
  const restored = await destination.owner.call('vaults', {}); assert.equal(restored.length, 2);
  for (const source of opened.vaults) {
   const target = restored.find(row => row.kind === source.kind); assert.equal(target.owner, destination.owner.profile.account);
   assert.deepEqual((await destination.owner.readVault(target.id)).versions, source.versions);
   assert.deepEqual((await destination.owner.call(['lifecycle', 'list'].join('/'), { vault: target.id })).items, source.lifecycle.map(row => ({ ...row, retentionActive: false })));
   assert.deepEqual(await destination.owner.call(selectionRoutes.policy, { vault: target.id }), { revision: 0, allowPlaintext: false });
   await assert.rejects(new SelectionExportClient(destination.owner).preview([{ vault: target.id, objects: null }], { format: 'plaintext' }), error => error.code === 'plaintext_export_policy_required');
   await assert.rejects(destinationReader.client.readVault(target.id), error => error.code === 'not_found');
   await assert.rejects(reader.client.readVault(target.id), error => error.code === 'not_found');
  }
  await destination.schedule(Date.now() + 60 * 86400000);
  const restoredCompany = restored.find(row => row.kind === 'company'); assert.deepEqual((await destination.owner.readItem(restoredCompany.id, trash.object, true)).versions.map(row => row.version), [1]);
  assert.deepEqual(await destinationReader.client.call('vaults', {}), []);
  await capture(to, 'import-reconciled', output);
  await to.getByRole('button', { name: 'Open imported vaults', exact: true }).click(); await expect(to.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
  console.log('PROBE LKY-017 fresh import: actual destination browser confirmation -> exact histories, attachment digests and lifecycle; fresh owner-only access, inactive retention and plaintext denied');

  // Revoke the reviewed source device at the final release boundary, using an
  // independently enrolled owner device, rather than returning a fake response.
  keeper = new VaultClient(f.origin, { cookie: f.owner.cookie, fetcher: f.fetcher });
  const enrollment = await keeper.beginEnrollment(f.owner.profile, f.password); await f.owner.approveEnrollment(enrollment.device, enrollment.fingerprint); const keeperProfile = await keeper.completeEnrollment(enrollment.profile, f.password); await keeper.unlock(keeperProfile, f.password);
  await page.getByLabel('Buyer export key file', { exact: true }).setInputFiles(file('buyer.key', exportKey)); await page.getByLabel('I retained the buyer key separately from the export', { exact: true }).check(); await review.click(); await approval.check();
  const downloadCount = downloads.length;
  await page.route('**/api/latchkey/selection/release', async route => { await keeper.call(['device', 'revoke'].join('/'), { device: f.owner.profile.device }); await route.continue(); }, { times: 1 });
  await exportButton.click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(exact).toHaveCount(0); assert.equal(downloads.length, downloadCount); await expect(page.getByRole('status').filter({ hasText: 'No buyer key loaded.' })).toBeVisible();
  const audit = await keeper.call(['audit', 'list'].join('/'), { filters: {}, after: 0, limit: 200 });
  const leakText = JSON.stringify({ requests, importRequests, audit, runtime: [...f.runtimeLogs, ...destination.runtimeLogs] });
  for (const secret of ['synthetic-latchkey-8171', 'synthetic-latchkey-8172', 'synthetic-latchkey-8173', 'synthetic-latchkey-8174', 'synthetic-latchkey-8175', 'synthetic-latchkey-8176', 'synthetic-latchkey-8177', 'synthetic-latchkey-8178', exportKey, attachment.name]) assert.ok(!leakText.includes(secret), 'export material leaked to service requests or audit');
  console.log('PROBE LKY-017 authority and leakage: real non-owner export/import and final device revocation -> refusal without download; file, key, review and secret values absent from requests and audit');
  console.log('PASS selectedExitJourney: source and destination browser flow at 1440; changed screens and overflow smoke at 390');
 } finally { keeper?.lock(); importDevice?.lock(); reader?.client.lock(); destinationReader?.client.lock(); await importContext?.close(); await reader?.context.close(); await destinationReader?.context.close(); await destination.close(); await f.close(); }
}
if (process.argv[1] === import.meta.filename) await selectedExitJourney();
