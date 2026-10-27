import { privateInput, privateOutput, writeAll } from '../../src/latchkey/portability/private-files.mjs';
import { bytes, decode, digest, json, open, seal } from '../../src/latchkey/crypto/envelope.mjs';
import { check } from '../../src/latchkey/items/fields.mjs';
import { previewMigration, importMigration } from '../../src/latchkey/migration/core.mjs';
const binding = { tenant: 'local', vault: 'migration', object: 'preview', purpose: 'migration', epoch: 1, version: 1 };
async function read(path) {
 const handle = await privateInput(path);
 try { check((await handle.stat()).size <= 8388608, 'migration_input_too_large'); return new Uint8Array(await handle.readFile()); }
 finally { await handle.close(); }
}
const write = (path, value) => privateOutput(path, handle => writeAll(handle, bytes(value)));
export async function migrationCommand(command, input, client) {
 const key = decode(input.previewKey, 32); check(key.length === 32, 'preview_key_required');
 let data;
 try {
  if (command === 'migration-preview') {
   data = await read(input.input);
   const { plan, hash } = await previewMigration({ ...input, data });
   const plain = bytes(plan);
   try { await write(input.output, { schema: 'latchkey-migration-envelope-v1', envelope: await seal(key, plain, binding) }); }
   finally { plain.fill(0); }
   return { written: true, hash, counts: plan.counts, folders: plan.folders.length, unresolvedClasses: plan.tasks.length, cutoverComplete: false };
  }
  data = await read(input.preview);
  const stored = json(data); check(stored.schema === 'latchkey-migration-envelope-v1', 'invalid_migration_preview');
  const plain = await open(key, stored.envelope, binding);
  let plan; try { plan = json(plain); } finally { plain.fill(0); }
  if (command === 'migration-review') {
   check(input.confirmed === true, 'plaintext_review_confirmation_required');
   await write(input.output, { plan, hash: await digest(bytes(plan)) });
   return { written: true, plaintext: true, cutoverComplete: false };
  }
  check(command === 'migration-import', 'unknown_migration_command');
  return await importMigration(client, plan, input);
 } finally { key.fill(0); data?.fill(0); }
}
