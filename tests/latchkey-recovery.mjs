import assert from 'node:assert/strict';
import { VaultClient } from '../src/latchkey/client.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { encode, random } from '../src/latchkey/crypto/envelope.mjs';

// Called through the real emitted Worker, with both factors held by the client.
export async function recoveryPreviewJourney(f) {
 const client = new VaultClient(f.origin, { fetcher: f.fetcher });
 const vault = (await f.owner.createVault()).vault;
 await f.owner.put(vault, { value: 'synthetic-latchkey-9001' });
 const devicesBefore = await f.owner.call('devices', {});
 const preview = await client.previewRecovery(f.enrolled.kit, f.password);
 assert.equal(preview.account, f.enrolled.profile.account);
 assert.equal(preview.generation, f.enrolled.profile.generation);
 assert.equal(preview.verifiedEmail, 'synthetic-latchkey-1100@example.test');
 assert.ok(preview.vaults.some(row => row.id === vault));
 assert.ok(preview.devices.some(row => row.id === f.enrolled.profile.device));
 assert.equal(preview.offlineExposure, 'unreachable-caches-and-previous-copies-cannot-be-recalled');
 assert.equal(client.token, null);
 assert.deepEqual(await f.owner.call('devices', {}), devicesBefore);
 await assert.rejects(client.previewRecovery(f.enrolled.kit, 'synthetic-latchkey-9002'), { code: 'authentication_failed' });
 await assert.rejects(client.previewRecovery({ ...f.enrolled.kit, recoverySecret: encode(random()) }, f.password), /cannot_decrypt/);
 await assert.rejects(f.owner.call('recovery' + '/preview', {}), { code: 'recovery_required' });
 assert.equal(client.token, null);
 const directory = await mkdtemp(join(tmpdir(), 'latchkey-recovery-confirm-'));
 try {
  const kit = join(directory, 'kit.json'); await writeFile(kit, JSON.stringify(f.enrolled.kit), {mode:0o600});
  const result = spawnSync(process.execPath, ['scripts/latchkey.mjs','recover'], {input:JSON.stringify({kit,password:f.password}),encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(JSON.parse(result.stderr).error,'recovery_confirmation_required');
  assert.deepEqual(await f.owner.call('devices', {}), devicesBefore);
 } finally { await rm(directory,{recursive:true,force:true}); }
 const recovered = await client.recover(f.enrolled.kit, f.password);
 await assert.rejects(f.owner.call('vaults', {}), { code: 'authority_expired' });
 await assert.rejects(f.owner.unlock(f.enrolled.profile, f.password), { code: 'authentication_failed' });
 await assert.rejects(client.previewRecovery(f.enrolled.kit, f.password), { code: 'kit_revoked' });
 await f.owner.unlock(recovered.profile, f.password);
 assert.equal((await f.owner.readVault(vault)).versions[0].value.value, 'synthetic-latchkey-9001');
 const audit = await f.owner.call('audit', {});
 assert.ok(audit.some(row => row.action === 'account_recovered'));
 for (const value of [f.password, f.enrolled.kit.recoverySecret, recovered.kit.recoverySecret, 'synthetic-latchkey-9001']) {
  assert.ok(!JSON.stringify(preview).includes(value)); assert.ok(!JSON.stringify(audit).includes(value));
 }
}
if (process.argv[1] === import.meta.filename) {
 const { vaultFixture } = await import('./browser/fixture.mjs');
 const f = await vaultFixture({ browserEnabled: false });
 try { await recoveryPreviewJourney(f); console.log('Recovery preview, kit factors, old-authority refusal and retained decryption passed'); }
 finally { await f.close(); }
}
