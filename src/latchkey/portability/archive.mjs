// Node-side buyer custody. Base remains the archive format and verifier; this
// envelope encrypts its exact bytes, including identity metadata and journals.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readArchive, archiveLines, canonicalJson } from '@runeditrun/rer/modules/portability';
import { fileStream, privateInput, privateOutput, requireRecords, RecordsError, writeAll } from './private-files.mjs';

const encoder = new TextEncoder();
const FORMAT = 'latchkey-records-encrypted';
const CHUNK_BYTES = 64 * 1024;
const LINE_BYTES = 128 * 1024;
const b64 = bytes => Buffer.from(bytes).toString('base64url');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function unb64(value, maximum) {
 requireRecords(typeof value === 'string' && value.length <= Math.ceil(maximum * 4 / 3) && /^[A-Za-z0-9_-]*$/.test(value), 'records_encoding');
 const bytes = Buffer.from(value, 'base64url');
 requireRecords(bytes.length <= maximum && b64(bytes) === value, 'records_encoding');
 return bytes;
}
function exact(value, keys) {
 requireRecords(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === keys.sort().join(), 'records_envelope');
}
function exportKey(value) {
 const key = value instanceof Uint8Array ? Uint8Array.from(value) : unb64(value, 32);
 requireRecords(key.length === 32, 'invalid_export_key');
 return key;
}
async function aes(key, usage, headerHash) {
 const material = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveKey']);
 return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(headerHash), info: encoder.encode('latchkey/records-envelope/v1') }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
function nonce(prefix, index) {
 requireRecords(Number.isSafeInteger(index) && index >= 0 && index < 0xffffffff, 'records_chunk_limit');
 const value = Buffer.alloc(12); prefix.copy(value); value.writeUInt32BE(index, 8); return value;
}
const aad = (headerHash, index, kind) => encoder.encode(canonicalJson([FORMAT, 1, headerHash, index, kind]));
async function encrypt(key, headerHash, prefix, index, kind, bytes) {
 return b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce(prefix, index), additionalData: aad(headerHash, index, kind) }, key, bytes)));
}
async function decrypt(key, headerHash, prefix, index, kind, ciphertext) {
 try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce(prefix, index), additionalData: aad(headerHash, index, kind) }, key, unb64(ciphertext, CHUNK_BYTES + 16))); }
 catch { throw new RecordsError('records_authentication_failed'); }
}
async function record(handle, value) { await writeAll(handle, encoder.encode(JSON.stringify(value) + '\n')); }
async function* chunks(handle) {
 let position = 0;
 for (;;) {
  const chunk = Buffer.alloc(CHUNK_BYTES), { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
  if (!bytesRead) return;
  position += bytesRead; yield chunk.subarray(0, bytesRead);
 }
}
export async function inspectRecordsHandle(handle) {
 let manifest, closing;
 for await (const value of readArchive(fileStream(handle))) {
  if (value.kind === 'manifest') manifest = value;
  if (value.kind === 'closing') closing = value;
 }
 return { manifest, closing };
}
export async function inspectRecordsArchive(input) {
 const handle = await privateInput(input);
 try { return await inspectRecordsHandle(handle); } finally { await handle.close(); }
}
function receipt({ manifest, closing }, later) {
 return {
  sourceIdentity: manifest.sourceIdentity, product: manifest.product,
  archiveHash: closing.archiveHash, contentHash: closing.contentHash, epoch: manifest.epoch,
  tables: manifest.tables.map(({ name, count }) => ({ name, count })),
  objects: manifest.objects.length, payloads: manifest.payloads.length,
  // No offline archive can prove that erasure did not occur after its date.
  erasure: { laterJournalSupplied: !!later, latestKnownEpoch: later?.manifest.epoch ?? manifest.epoch,
   warning: 'Later erasure cannot be established without a trusted later journal. The supplied journal may itself have been superseded.' },
  authority: 'Base policy preserved; opening does not activate grants or authorize restore',
 };
}
export async function sealRecordsArchive({ input, output, exportKey: suppliedKey }) {
 const material = exportKey(suppliedKey), source = await privateInput(input);
 try {
  const base = await inspectRecordsHandle(source);
  return await privateOutput(output, async target => {
   const header = { kind: 'header', format: FORMAT, version: 1, algorithm: 'A256GCM', id: randomUUID(), noncePrefix: b64(randomBytes(8)), chunkBytes: CHUNK_BYTES };
   const headerHash = hash(canonicalJson(header)), prefix = unb64(header.noncePrefix, 8), key = await aes(material, 'encrypt', headerHash);
   await record(target, header);
   const digest = createHash('sha256'); let index = 0, size = 0;
   for await (const bytes of chunks(source)) {
    digest.update(bytes); size += bytes.length;
    await record(target, { kind: 'chunk', index, ciphertext: await encrypt(key, headerHash, prefix, index, 'chunk', bytes) }); index++;
   }
   const commitment = { chunks: index, bytes: size, sha256: digest.digest('hex'), archiveHash: base.closing.archiveHash };
   await record(target, { kind: 'closing', index, ciphertext: await encrypt(key, headerHash, prefix, index, 'closing', encoder.encode(JSON.stringify(commitment))) });
   // Re-read the encrypted bytes and Base verifier: mutation of the raw source
   // during encryption cannot promote an archive inconsistent with its receipt.
   await privateOutputScratch(target, material, base.closing.archiveHash);
   return receipt(base);
  });
 } finally { material.fill(0); await source.close(); }
}

async function decryptRecords(source, target, material) {
 let header, prefix, headerHash, key, index = 0, size = 0, closed = false, commitment;
 const digest = createHash('sha256');
 for await (const line of archiveLines(fileStream(source), LINE_BYTES)) {
  requireRecords(!closed, 'records_trailing_data');
  let value; try { value = JSON.parse(line); } catch { throw new RecordsError('records_json'); }
  if (!header) {
   exact(value, ['kind', 'format', 'version', 'algorithm', 'id', 'noncePrefix', 'chunkBytes']);
   requireRecords(value.kind === 'header' && value.format === FORMAT && value.version === 1 && value.algorithm === 'A256GCM' && typeof value.id === 'string' && /^[0-9a-f-]{36}$/.test(value.id) && value.chunkBytes === CHUNK_BYTES, 'records_envelope');
   header = value; prefix = unb64(value.noncePrefix, 8); requireRecords(prefix.length === 8, 'records_envelope');
   headerHash = hash(canonicalJson(header)); key = await aes(material, 'decrypt', headerHash); continue;
  }
  exact(value, ['kind', 'index', 'ciphertext']);
  requireRecords(value.index === index && ['chunk', 'closing'].includes(value.kind), 'records_chunk_order');
  const plain = await decrypt(key, headerHash, prefix, index, value.kind, value.ciphertext);
  try {
   if (value.kind === 'chunk') {
    requireRecords(plain.length > 0 && plain.length <= CHUNK_BYTES, 'records_chunk_size');
    await writeAll(target, plain); digest.update(plain); size += plain.length; index++;
   } else {
    try { commitment = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)); } catch { throw new RecordsError('records_commitment'); }
    exact(commitment, ['chunks', 'bytes', 'sha256', 'archiveHash']);
    const actual = digest.digest('hex');
    requireRecords(commitment.chunks === index && commitment.bytes === size && typeof commitment.sha256 === 'string' && /^[a-f0-9]{64}$/.test(commitment.sha256) && timingSafeEqual(Buffer.from(actual), Buffer.from(commitment.sha256)), 'records_commitment');
    closed = true;
   }
  } finally { plain.fill(0); }
 }
 requireRecords(closed, 'records_incomplete');
 const base = await inspectRecordsHandle(target);
 requireRecords(base.closing.archiveHash === commitment.archiveHash, 'records_archive_mismatch');
 return base;
}

// Verify encryption without exposing plaintext to a caller. Use a separate
// owner-only temporary file, deleted after the full Base digest check.
async function privateOutputScratch(encrypted, material, expectedHash) {
 const { open, unlink } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const path = join(tmpdir(), `latchkey-records-${randomUUID()}`), scratch = await open(path, 'wx+', 0o600);
 try { requireRecords((await decryptRecords(encrypted, scratch, material)).closing.archiveHash === expectedHash, 'records_archive_mismatch'); }
 finally { await scratch.close(); await unlink(path); }
}
export async function openRecordsArchive({ input, output, exportKey: suppliedKey, laterJournal }) {
 const material = exportKey(suppliedKey), source = await privateInput(input);
 try {
  return await privateOutput(output, async target => {
   const base = await decryptRecords(source, target, material);
   const later = laterJournal ? await inspectRecordsArchive(laterJournal) : undefined;
   if (later) requireRecords(later.manifest.sourceIdentity === base.manifest.sourceIdentity && later.manifest.epoch >= base.manifest.epoch, 'later_journal');
   // Base import performs row/checkpoint fencing. Opening an archive grants no
   // restore authority and must never claim that it already applied the fence.
   return receipt(base, later);
  });
 } finally { material.fill(0); await source.close(); }
}
