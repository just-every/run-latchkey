import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { expect } from '@playwright/test';
import { vaultFixture } from './fixture.mjs';
import { passboltFixture } from '../fixtures/passbolt.mjs';
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
if (process.argv[1] === import.meta.filename) for (const width of [1440, 390]) await passboltJourney(width);
