import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { vaultFixture } from './fixture.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';

const file = (name, text) => ({ name, mimeType: 'application\u002fjson', buffer: Buffer.from(text) });
async function activate(page, button) { await expect(button).toBeEnabled(); await button.focus(); await expect(button).toBeFocused(); await page.keyboard.press('Enter'); }
async function contents(download) { let text = ''; for await (const chunk of await download.createReadStream()) text += chunk; return text; }
async function captures(page, name, output) {
 if (!output) return;
 await mkdir(output, { recursive: true });
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 });
  const payload = page.getByRole('textbox', { name: 'Exact diagnostic payload', exact: true });
  if (await payload.count()) { await payload.focus(); await page.keyboard.press('Tab'); }
  await page.screenshot({ path: join(output, `diagnostics-${name}-${width}.png`), fullPage: true });
 }
 await page.setViewportSize({ width: 1440, height: 1000 });
}
async function openDiagnostics(page) {
 const settings = page.locator('summary').filter({ hasText: /^Settings$/ });
 if (!(await settings.evaluate(element => element.parentElement.open))) await activate(page, settings);
 await activate(page, page.getByRole('button', { name: 'Support diagnostics', exact: true }));
 await expect(page.getByRole('heading', { name: 'Support diagnostics', exact: true })).toBeFocused();
}
export async function diagnosticsJourney(output = process.env.LATCHKEY_SCREENSHOTS) {
 const f = await vaultFixture(), page = f.page;
 const requests = [], downloads = [];
 const canaries = ['synthetic-latchkey-9010', 'synthetic-latchkey-9011', 'synthetic-latchkey-9012', 'synthetic_latchkey_private_error'];
 try {
  const vault = (await f.owner.createVault()).vault;
  await f.owner.put(vault, createItem('login', { title: canaries[0], values: { password: canaries[1], username: canaries[2] } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(f.origin + '/app/vault');
  if (new URL(page.url()).pathname === '/setup') { await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click(); }
  await page.getByLabel('Profile file').setInputFiles(file('profile.json', JSON.stringify(f.owner.profile)));
  await page.getByLabel('Master password', { exact: true }).fill(f.password);
  await activate(page, page.getByRole('button', { name: 'Unlock vault', exact: true }));
  await expect(page.getByRole('heading', { name: canaries[0], exact: true })).toBeVisible();
  canaries.push(f.owner.profile.deviceSecret, f.owner.profile.account, f.owner.profile.device, f.owner.profile.tenant, f.owner.token, f.owner.cookie.split('=').slice(1).join('='), f.enrolled.kit.recoverySecret, f.mail[0]?.personalizations?.[0]?.to?.[0]?.email ?? 'synthetic-latchkey-9013');
  await page.evaluate(values => {
   localStorage.setItem('diagnostic-canary', values[0]); sessionStorage.setItem('diagnostic-canary', values[1]);
   history.replaceState(null, '', '?private=' + values[2] + '#' + values[0]);
   console.error(values[1]);
  }, canaries);
  await page.waitForLoadState('networkidle');
  page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '', headers: request.headers() }));
  page.on('download', download => downloads.push(download));
  await openDiagnostics(page);
  const preview = page.getByRole('button', { name: 'Preview diagnostic bundle', exact: true });
  const payload = page.getByRole('textbox', { name: 'Exact diagnostic payload', exact: true });
  const consent = page.getByRole('checkbox', { name: 'I allow downloading this exact diagnostic payload', exact: true });
  const save = page.getByRole('button', { name: 'Download diagnostic bundle', exact: true });
  await captures(page, 'help', output);
  await activate(page, preview);
  await expect(page.getByRole('heading', { name: 'Exact download preview', exact: true })).toBeFocused();
  await expect(payload).toHaveAttribute('readonly', ''); await expect(save).toBeDisabled();
  await page.keyboard.press('Tab'); await expect(payload).toBeFocused();
  await page.keyboard.press('Tab'); await expect(consent).toBeFocused();
  assert.ok(await consent.evaluate(element => { const style = getComputedStyle(element); return style.outlineStyle !== 'none' || style.boxShadow !== 'none'; }), 'visible keyboard focus');
  await page.keyboard.press('Space'); await expect(save).toBeEnabled();
  await captures(page, 'review', output);
  await activate(page, page.getByRole('button', { name: 'Cancel preview', exact: true }));
  await expect(preview).toBeFocused(); await expect(payload).toHaveCount(0);
  assert.equal(downloads.length, 0); assert.equal(requests.length, 0, JSON.stringify(requests.map(row => new URL(row.url).pathname)));
  console.log('PROBE LKY-039 consent: Settings keyboard preview and cancellation -> no download or network request, named fields and visible focus');

  // A loaded page stays useful when the service, rather than the browser, fails.
  await activate(page, page.getByRole('button', { name: 'Close diagnostics', exact: true }));
  await expect(page.locator('summary').filter({ hasText: /^Settings$/ })).toBeFocused();
  await page.route('**/api/latchkey/**', route => route.fulfill({ status: 503, contentType: 'application\u002fjson', body: JSON.stringify({ error: canaries[3], detail: canaries[1], token: canaries[4] }) }));
  await activate(page, page.getByRole('button', { name: 'Refresh', exact: true }));
  await expect(page.getByRole('alert')).toBeVisible();
  await openDiagnostics(page); await activate(page, preview);
  let value = JSON.parse(await payload.inputValue());
  assert.deepEqual(value.errors, ['operation_failed']); assert.equal(value.serviceStatus, 'unknown');
  assert.equal(value.capabilities.browserOnline, true);
  await activate(page, page.getByRole('button', { name: 'Cancel preview', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Close diagnostics', exact: true }));
  await page.unroute('**/api/latchkey/**');
  await page.route('**/api/latchkey/**', route => route.abort('connectionrefused'));
  await activate(page, page.getByRole('button', { name: 'Refresh', exact: true }));
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  await openDiagnostics(page); await activate(page, preview);
  value = JSON.parse(await payload.inputValue());
  assert.deepEqual(value.errors, ['network_unavailable']); assert.equal(value.serviceStatus, 'unknown');
  const requestsBeforeConsent = requests.length;
  await consent.check(); await f.context.setOffline(true);
  await expect(consent).not.toBeChecked(); await expect(save).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Diagnostics changed' })).toBeVisible();
  value = JSON.parse(await payload.inputValue()); assert.equal(value.capabilities.browserOnline, false); assert.equal(value.serviceStatus, 'unknown');
  await captures(page, 'outage', output);
  assert.equal(requests.length, requestsBeforeConsent); assert.equal(downloads.length, 0);
  console.log('PROBE LKY-039 outage: loaded page with 503, refused connection and offline browser -> allowlisted errors, help retained, service status unknown, no diagnostic request');

  // A change with no connectivity event still meets the final exact-byte fence.
  await consent.check();
  await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));
  await activate(page, save);
  await expect(consent).not.toBeChecked(); await expect(save).toBeDisabled();
  assert.equal(JSON.parse(await payload.inputValue()).capabilities.browserOnline, true); assert.equal(downloads.length, 0);
  await consent.focus(); await page.keyboard.press('Space'); await page.keyboard.press('Tab'); await expect(save).toBeFocused();
  const expected = await payload.inputValue(), downloaded = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const artifact = await downloaded, text = await contents(artifact);
  assert.equal(text, expected); assert.equal(artifact.suggestedFilename(), 'latchkey-diagnostics.json');
  await expect(preview).toBeFocused(); await expect(payload).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Browser download initiated' })).toBeVisible();
  assert.equal(requests.length, requestsBeforeConsent);
  const bundle = JSON.parse(text);
  assert.deepEqual(Object.keys(bundle).sort(), ['build', 'capabilities', 'errors', 'schema', 'serviceStatus']);
  assert.deepEqual(Object.keys(bundle.build).sort(), ['foundation', 'web']);
  for (const version of Object.values(bundle.build)) assert.match(version, /^\d+\.\d+\.\d+$|^unknown$/);
  assert.deepEqual(Object.keys(bundle.capabilities).sort(), ['browserOnline', 'clipboardWrite', 'fileRead', 'localDownload', 'secureContext', 'webCrypto']);
  assert.ok(Object.values(bundle.capabilities).every(value => typeof value === 'boolean'));
  for (const canary of [...canaries, f.origin, JSON.stringify(f.owner.profile)]) assert.ok(!text.includes(canary), 'private canary in artifact');
  const diagnosticRequests = JSON.stringify(requests.slice(requestsBeforeConsent));
  for (const canary of canaries) assert.ok(!diagnosticRequests.includes(canary), 'private canary in diagnostic request');
  assert.equal(requests.slice(requestsBeforeConsent).length, 0);
  console.log('PROBE LKY-039 exact payload: changed metadata without an event -> reconfirmation; explicit keyboard confirmation -> exact allowlisted JSON download, no secret, profile, token or identity canary and no outbound request');

  // Browser refusal discards approval, and retry needs a new preview.
  await activate(page, preview); await consent.check();
  await page.evaluate(() => { const original = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { HTMLAnchorElement.prototype.click = original; throw new DOMException('synthetic-latchkey-9020', 'NotAllowedError'); }; });
  await activate(page, save);
  await expect(page.getByRole('alert').filter({ hasText: 'could not start the download' })).toBeVisible();
  await expect(payload).toHaveCount(0); assert.equal(downloads.length, 1);
  await activate(page, preview); await consent.check();
  await activate(page, page.getByRole('button', { name: 'Lock vault', exact: true }));
  await expect(page.getByRole('heading', { name: 'Unlock your vault', exact: true })).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: /^Settings$/ })).toBeFocused();
  await openDiagnostics(page); await expect(payload).toHaveCount(0); await activate(page, preview); await expect(consent).not.toBeChecked();
  assert.deepEqual(JSON.parse(await payload.inputValue()).errors, []);
  await captures(page, 'locked', output);
  await activate(page, page.getByRole('button', { name: 'Cancel preview', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Close diagnostics', exact: true }));
  await f.context.setOffline(false); await page.unroute('**/api/latchkey/**');
  await page.getByLabel('Profile file').setInputFiles(file('latchkey-diagnostics.json', text));
  await page.getByLabel('Master password', { exact: true }).fill(f.password);
  await activate(page, page.getByRole('button', { name: 'Unlock vault', exact: true }));
  await expect(page.getByRole('alert')).toContainText('profile mismatch');
  await expect(page.getByRole('heading', { name: 'Unlock your vault', exact: true })).toBeVisible();
  const support = await f.browser.newContext({ ignoreHTTPSErrors: true });
  try {
   const refused = await support.request.post(f.origin + '/api/latchkey/vault/read', { headers: { origin: f.origin, 'x-latchkey-grant': JSON.stringify(bundle) }, data: { vault } });
   assert.ok([400, 401, 403].includes(refused.status()));
   const response = await refused.text(); assert.ok(!response.includes(canaries[1])); assert.ok(!response.includes('versions'));
  } finally { await support.close(); }
  assert.equal(downloads.length, 1);
  console.log('PROBE LKY-039 authority: lock with pending consent -> discarded; diagnostic file used as unlock profile and support read authority -> refused, vault remains locked');
 } catch (error) { if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: join(output, 'diagnostics-failure.png'), fullPage: true }); } throw error; }
 finally { await f.close(); }
}
if (process.argv[1] === new URL(import.meta.url).pathname) await diagnosticsJourney();
