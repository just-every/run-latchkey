import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { vaultFixture } from './fixture.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';
import { TypedItems } from '../../src/latchkey/items/client.mjs';
import { aliasApiJourney, aliasToken } from '../latchkey-aliases.mjs';
import { cloudflareEdge, zoneId, accountId } from '../fixtures/cloudflare-routing.mjs';
import { signupSite } from '../fixtures/signup-site.mjs';
const output = process.env.LATCHKEY_SCREENSHOTS;
if (output) await mkdir(output, { recursive: true });
async function enroll(f, n, name) {
 const response = await f.context.request.post(f.origin + '/auth/invite', { headers: { origin: f.origin }, data: { email: `synthetic-latchkey-${n}@example.test`, displayName: name, role: 'member' } }); assert.equal(response.status(), 202);
 const token = new URL(f.mail.at(-1).content.find(c => c.type === 'text/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
 const client = new VaultClient(f.origin, { fetcher: f.fetcher }); await client.confirmIdentity(token); const enrollment = await client.register(`synthetic-latchkey-${n + 1}`); await client.unlock(enrollment.profile, `synthetic-latchkey-${n + 1}`); return client;
}
// The browser reaches Cloudflare only through the Email Routing fake; its answers are the provider's published envelope.
async function routeProvider(page, edge) {
 const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE' };
 await page.route('https://api.cloudflare.com/**', async route => {
  const request = route.request(); if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  try { const answer = await edge.fetch(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined, redirect: 'error', credentials: 'omit' }); await route.fulfill({ status: answer.status, headers: { ...cors, 'content-type': 'application/json' }, body: await answer.text() }); }
  catch { await route.abort('connectionreset'); }
 });
}
for (const width of [1440, 390]) {
 const f = await vaultFixture(), edge = cloudflareEdge({ token: aliasToken });
 const capture = async name => { assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal viewport overflow'); if (output) await f.page.screenshot({ path: join(output, `${name}-${width}.png`), fullPage: true }); };
 const site = await signupSite({ forward: edge.deliver });
 try {
  await routeProvider(f.page, edge);
  const member = await enroll(f, 2100, 'Northstar Finance analyst'), outsider = await enroll(f, 2110, 'Northstar contractor');
  const owner = f.owner, company = (await owner.createVault({ kind: 'company' })).vault; await owner.put(company, { schema: 'latchkey/vault-meta/v1', title: 'Northstar Finance' });
  const typed = new TypedItems(owner), saved = await typed.save(company, createItem('login', { title: 'Fabrikam Marketplace', values: { username: 'placeholder@example.test', password: 'synthetic-latchkey-2066' }, ownership: 'company' }));
  await f.page.setViewportSize({ width, height: 1000 }); await f.page.goto(f.origin + '/app/vault');
  if (new URL(f.page.url()).pathname === '/setup') { await f.page.getByRole('checkbox').check(); await f.page.getByRole('button', { name: 'Finish setup', exact: true }).click(); }
  await expect(f.page.getByLabel('Profile file')).toBeEnabled();
  await f.page.getByLabel('Profile file').setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(owner.profile)) });
  await f.page.getByLabel('Master password', { exact: true }).fill(f.password); await f.page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
  await expect(f.page.getByRole('button', { name: 'New item', exact: true })).toBeEnabled();
  const openAliases = async () => { await f.page.locator('summary', { hasText: 'Settings' }).click(); await f.page.getByRole('button', { name: 'Email aliases', exact: true }).click(); await expect(f.page.getByRole('heading', { name: 'Email aliases', exact: true })).toBeVisible(); };
  const token = async () => f.page.getByLabel('Cloudflare API token').fill(aliasToken);
  // Approve a company forwarding domain and mailbox against the provider's own state.
  await openAliases(); await token();
  await f.page.getByLabel('Ownership').selectOption('company'); await f.page.getByLabel('Cloudflare zone ID').fill(zoneId); await f.page.getByRole('button', { name: 'Add forwarding domain' }).click();
  await expect(f.page.getByText('mail.northstar-finance.test added.')).toBeVisible(); await expect(f.page.getByText(/Provider reports routing enabled, status ready/)).toBeVisible();
  await f.page.getByLabel('Cloudflare account ID').fill(accountId); await f.page.getByLabel('Mailbox address').fill('finance@northstar-finance.test'); await f.page.getByRole('button', { name: 'Add mailbox' }).click();
  await expect(f.page.getByText(/stays unusable until you open the provider’s verification message/)).toBeVisible(); await expect(f.page.getByText('Not verified by the provider yet')).toBeVisible(); await capture('aliases-unverified');
  edge.verify('finance@northstar-finance.test');
  await f.page.getByRole('button', { name: 'Check finance@northstar-finance.test again' }).click(); await expect(f.page.getByText(/Verified by the provider/)).toBeVisible(); await capture('aliases-settings');
  // From the login: create the alias, then use it on a real signup form.
  await f.page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Vault', exact: true }).click(); await expect(f.page.getByRole('button', { name: 'New item', exact: true })).toBeEnabled();
  await f.page.getByRole('button', { name: /Fabrikam Marketplace/ }).first().click();
  const section = f.page.getByRole('region', { name: 'Hide my email' }); await expect(section).toBeVisible(); await section.getByText('Hide my email', { exact: true }).click(); await section.getByLabel('Cloudflare API token').fill(aliasToken);
  await section.getByRole('button', { name: 'Create alias and use as username' }).click();
  await expect(f.page.getByLabel('Username', { exact: true })).toHaveText(/^lk-/); const address = await f.page.getByLabel('Username', { exact: true }).textContent(); assert.match(address, /^lk-[a-z2-9]{14}@mail\.northstar-finance\.test$/); await expect(section.getByText(/forwarding configured at the provider/)).toBeVisible(); await expect(section.getByText(/Mail arrival not confirmed/)).toBeVisible(); await capture('aliases-login');
  const signup = await f.context.newPage(); await signup.setViewportSize({ width, height: 800 }); await signup.goto(site.origin + '/signup');
  await signup.getByLabel('Email').fill(address); await signup.getByLabel('Password').fill('synthetic-latchkey-2066'); await signup.getByRole('button', { name: 'Sign up' }).click(); await expect(signup.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  // The verification message reaches the approved mailbox, through the provider, addressed to the alias.
  const message = edge.inbox.at(-1); assert.equal(message.mailbox, 'finance@northstar-finance.test'); assert.equal(message.alias, address); const code = message.text.match(/code is (\d{6})/)[1];
  await signup.getByLabel('Email').fill(address); await signup.getByLabel('Verification code').fill(code); await signup.getByRole('button', { name: 'Verify' }).click(); await expect(signup.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  await signup.getByLabel('Email').fill(address); await signup.getByLabel('Password').fill('synthetic-latchkey-2066'); await signup.getByRole('button', { name: 'Sign in' }).click(); await expect(signup.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await f.page.bringToFront(); await openAliases(); const row = f.page.getByRole('article').filter({ hasText: address });
  await expect(row).toContainText('Forwarding: configured'); await expect(row).toContainText('Mail arrival not confirmed');
  await row.getByRole('button', { name: 'Mail arrived' }).click(); await expect(row).toContainText('Arrival reported by you'); await capture('aliases-list');
  // Disabling stops forwarding at the provider; the login and its site account remain.
  await token(); await row.getByRole('button', { name: `Disable ${address}` }).click(); await expect(f.page.getByText('Forwarding stopped at the provider. The login is unchanged.')).toBeVisible();
  assert.equal([...edge.rules.values()].find(rule => rule.matchers[0].value === address).enabled, false); await expect(row).toContainText('Forwarding stopped at the provider');
  const before = edge.inbox.length; await site.resend(address); assert.equal(edge.inbox.length, before); assert.equal(edge.dropped.at(-1).reason, 'rule-disabled');
  assert.equal((await owner.readItem(company, saved.object)).versions.at(-1).value.fields.find(field => field.id === 'username').value, address);
  const again = await fetch(site.origin + '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: address, password: 'synthetic-latchkey-2066' }) }); assert.equal(again.status, 200);
  await capture('aliases-disabled');
  // A provider outage is shown as unknown, never as success, and settles against the provider on request.
  await f.page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Vault', exact: true }).click(); await f.page.getByRole('button', { name: /Fabrikam Marketplace/ }).first().click();
  const next = f.page.getByRole('region', { name: 'Hide my email' }); await next.getByText('Hide my email', { exact: true }).click(); await next.getByLabel('Cloudflare API token').fill(aliasToken); edge.fault('POST /zones', 503);
  await next.getByRole('button', { name: 'Create alias and use as username' }).click(); await expect(next.getByRole('alert')).toContainText('may or may not have been made'); await capture('aliases-outage');
  await openAliases(); await token(); const unsettled = f.page.getByRole('article').filter({ hasText: 'Forwarding: reconcile' }); await expect(unsettled).toContainText('may or may not have been made'); await expect(unsettled).not.toContainText('Arrival reported');
  await unsettled.getByRole('button', { name: 'Check at the provider' }).click(); await expect(f.page.getByText('Checked at the provider.')).toBeVisible(); await expect(f.page.getByRole('article').filter({ hasText: 'Forwarding: failed' })).toContainText('The provider has no rule for this alias.');
  if (width === 1440) await aliasApiJourney({ owner, member, outsider, edge: cloudflareEdge({ token: aliasToken, domain: 'alias.northstar-finance.test', zone: '1234567890abcdef1234567890abcdef', account: 'fedcba0987654321fedcba0987654321' }) });
  console.log(`Alias journey ${width}: provider-backed create, signup verification through the approved mailbox, disable, outage and denial passed.`);
 } finally { await site.close(); await f.close(); }
}
