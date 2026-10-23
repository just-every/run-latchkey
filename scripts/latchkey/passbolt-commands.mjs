import { privateInput, privateOutput, writeAll } from '../../src/latchkey/portability/private-files.mjs';
import { check } from '../../src/latchkey/items/fields.mjs';
import { bytes, decode, digest, json, open, seal } from '../../src/latchkey/crypto/envelope.mjs';
import { previewPassbolt, importPassboltItem } from '../../src/latchkey/migration/passbolt.mjs';
const binding = { tenant: 'local', vault: 'passbolt', object: 'preview', purpose: 'migration', epoch: 1, version: 1 };
async function read(path, maximum = 1500000) {
 const handle = await privateInput(path);
 try { check((await handle.stat()).size <= maximum, 'migration_input_too_large'); return await handle.readFile(); }
 finally { await handle.close(); }
}
async function write(path, value) { return privateOutput(path, async handle => writeAll(handle, bytes(value))); }
export async function passboltCommand(command, input, client) {
 const key = decode(input.previewKey, 32); check(key.length === 32, 'preview_key_required');
 try {
  if (command === 'passbolt-preview') {
   check(input.format === 'csv-kdbx' ? input.csv && !input.kdbx : input.kdbx && !input.csv, 'one_source_file_required');
   const data = new Uint8Array(await read(input.format === 'csv-kdbx' ? input.csv : input.kdbx, 8388608));
   const metadata = input.metadata ? JSON.parse(await read(input.metadata)) : undefined;
   const keyfile = input.keyfile ? new Uint8Array(await read(input.keyfile, 1048576)) : undefined;
   let preview;
   try { preview = await previewPassbolt({ ...input, data, metadata, keyfile }); } finally { keyfile?.fill(0); data.fill(0); }
   const { plan, hash } = preview;
   await write(input.output, { schema: 'latchkey-passbolt-envelope-v1', envelope: await seal(key, bytes(plan), binding) });
   return { written: true, hash, items: plan.rows.length, blocked: plan.rows.filter(row => row.gaps.length).length, unmatchedResources: plan.unmatchedResources.length, cutoverComplete: false };
  }
  const stored = JSON.parse(await read(input.preview));
  check(stored.schema === 'latchkey-passbolt-envelope-v1', 'invalid_migration_preview');
  const plaintext = await open(key, stored.envelope, binding);
  let plan; try { plan = json(plaintext); } finally { plaintext.fill(0); }
  if (command === 'passbolt-review') {
   check(input.confirmed === true, 'plaintext_review_confirmation_required');
   await write(input.output, { plan, hash: await digest(bytes(plan)) });
   return { written: true, plaintext: true, cutoverComplete: false };
  }
  check(command === 'passbolt-import', 'unknown_migration_command');
  return importPassboltItem(client, plan, input);
 } finally { key.fill(0); }
}
