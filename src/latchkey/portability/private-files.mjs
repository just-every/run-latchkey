import { constants } from 'node:fs';
import { open, link, unlink } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { requireRecords } from './common.mjs';
export { requireRecords, RecordsError } from './common.mjs';
export async function privateInput(path) {
 requireRecords(typeof path === 'string' && path.length > 0, 'records_path_required');
 const handle = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = await handle.stat();
  requireRecords(stat.isFile() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid(), 'private_file_required');
  return handle;
 } catch (error) { await handle.close(); throw error; }
}
export function fileStream(handle) {
 return Readable.toWeb(handle.createReadStream({ autoClose: false, start: 0 }));
}
export async function writeAll(handle, bytes) {
 let offset = 0;
 while (offset < bytes.length) offset += (await handle.write(bytes, offset, bytes.length - offset)).bytesWritten;
}
// Unverified plaintext stays in an owner-only scratch file. Only a complete,
// verified result is published, without replacing any existing output.
export async function privateOutput(path, produce) {
 requireRecords(typeof path === 'string' && path.length > 0, 'records_path_required');
 const target = resolve(path), scratch = join(dirname(target), `.${basename(target)}.${randomUUID()}.partial`);
 const handle = await open(scratch, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
 try {
  const result = await produce(handle);
  await handle.sync();
  await link(scratch, target);
  return result;
 } finally { await handle.close(); await unlink(scratch); }
}
