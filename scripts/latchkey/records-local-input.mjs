import { createHash, randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, basename, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { readArchive } from '@runeditrun/rer/modules/portability';
import { ledgerReader } from '@runeditrun/rer/internal/modules/portability/ledgers.mjs';
import { privateInput, privateOutput, fileStream, writeAll } from '../../src/latchkey/portability/private-files.mjs';
import { requireRecords as need } from '../../src/latchkey/portability/common.mjs';

export const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifiedInput(path) {
 const handle = await privateInput(path), hash = createHash('sha256'), ledger = ledgerReader();
 let manifest, closing;
 try {
  const measured = fileStream(handle).pipeThrough(new TransformStream({ transform(bytes, controller) { hash.update(bytes); controller.enqueue(bytes); } }));
  for await (const record of readArchive(measured)) {
   ledger.add(record);
   if (record.kind === 'manifest') manifest = record;
   if (record.kind === 'closing') closing = record;
  }
  return { manifest, closing, ledgers: ledger.ledgers(), sha256: hash.digest('hex') };
 } finally { await handle.close(); }
}
export async function* inputParts(path) {
 const handle = await privateInput(path);
 try { for await (const record of readArchive(fileStream(handle))) if (record.kind === 'part') yield record; }
 finally { await handle.close(); }
}
export function checkpointPath(root, path) {
 need(typeof path === 'string' && path.length > 0, 'records_checkpoint_required');
 const absolute = resolve(root, path), within = relative(root, absolute);
 need(isAbsolute(path) || !within.split(sep).includes('..'), 'records_checkpoint_path');
 if (!within.startsWith('..' + sep) && !isAbsolute(within)) need(['exports', '.wrangler'].includes(within.split(sep)[0]), 'records_checkpoint_path');
 return absolute;
}
export async function readCheckpoint(path) {
 let handle;
 try { handle = await privateInput(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
 try {
  const stat = await handle.stat(); need(stat.nlink === 1 && stat.size <= 65536, 'records_checkpoint_invalid');
  const raw = await handle.readFile('utf8'); let value;
  try { value = JSON.parse(raw); } catch { need(false, 'records_checkpoint_invalid'); }
  need(value?.schema === 1 && value.kind === 'latchkey-records-local-checkpoint' && typeof value.root === 'string' && typeof value.destinationIdentity === 'string'
   && typeof value.configurationHash === 'string' && typeof value.archive?.sha256 === 'string' && typeof value.actor === 'string'
   && /^[0-9a-f-]{36}$/.test(value.actor) && (value.job === null || typeof value.job === 'string' && /^[0-9a-f-]{36}$/.test(value.job)), 'records_checkpoint_invalid');
  return { value, rawHash: fingerprint(raw) };
 } finally { await handle.close(); }
}
export async function saveCheckpoint(path, value, previous) {
 const content = JSON.stringify(value) + '\n';
 if (!previous) {
  await privateOutput(path, async handle => { await writeAll(handle, Buffer.from(content)); });
 } else {
  const current = await readCheckpoint(path); need(current?.rawHash === previous.rawHash, 'records_checkpoint_changed');
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.partial`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
   await handle.writeFile(content); await handle.sync();
   need((await readCheckpoint(path))?.rawHash === previous.rawHash, 'records_checkpoint_changed');
   await rename(temporary, path);
  } finally { await handle.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
 }
 return { value, rawHash: fingerprint(content) };
}
