import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPortability, canonicalJson, PortabilityError } from '@runeditrun/rer/modules/portability';
import { state } from '@runeditrun/rer/modules/portability/storage';
import { loadPolicy } from '@runeditrun/rer/internal/cli/portability-policy.mjs';
import { localOperation } from '@runeditrun/rer/local/operation';
import { RecordsError, requireRecords as need } from '../../src/latchkey/portability/common.mjs';
import { verifiedInput, inputParts, checkpointPath, readCheckpoint, saveCheckpoint } from './records-local-input.mjs';
import { configuration, localBindings } from './records-local-bindings.mjs';

const warning = 'Offline archives cannot prove later erasure; supply a trusted later journal. Base requires an unexpired five-minute import lease to resume the same job.';
const archiveIdentity = file => ({ sha256: file.sha256, archiveHash: file.closing.archiveHash, contentHash: file.closing.contentHash, sourceIdentity: file.manifest.sourceIdentity });
function fixedError(error) {
 if (error instanceof RecordsError) return error;
 if (error instanceof PortabilityError) {
  const code = error.code.split(':')[0];
  return new RecordsError(/^[a-z][a-z0-9_]{0,80}$/.test(code) ? code : 'records_restore_failed', error.status);
 }
 const code = { ENOENT: 'records_file_missing', EEXIST: 'records_checkpoint_exists', ELOOP: 'private_file_required', LOCAL_OPERATION_BUSY: 'records_local_operation_busy' }[error?.code];
 return new RecordsError(code ?? 'records_restore_failed', code ? 400 : 500);
}
export async function restoreLocalRecords(input) {
 let operation, bindings;
 try {
  need(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(key => ['input', 'checkpoint', 'confirmed', 'partsPerRun', 'finalize', 'journal'].includes(key)), 'invalid_records_restore');
  need(input.confirmed === true, 'records_confirmation_required');
  need(typeof input.input === 'string' && input.input.length > 0, 'records_input_required');
  need(input.finalize === undefined || typeof input.finalize === 'boolean', 'invalid_records_finalize');
  need(input.journal === undefined || typeof input.journal === 'string' && input.journal.length > 0, 'invalid_records_journal');
  const partsPerRun = input.partsPerRun ?? 16;
  need(Number.isSafeInteger(partsPerRun) && partsPerRun >= 1 && partsPerRun <= 128, 'invalid_records_part_limit');
  const root = await realpath(process.cwd()), path = resolve(root, input.input), checkpoint = checkpointPath(root, input.checkpoint);
  need(checkpoint !== path && (!input.journal || checkpoint !== resolve(root, input.journal)), 'records_checkpoint_path');
  // Both complete files are verified before locks, destination bindings or
  // migrations. Nothing private is read from ambient app configuration.
  const archive = await verifiedInput(path), journalPath = input.journal ? resolve(root, input.journal) : undefined;
  const later = journalPath ? await verifiedInput(journalPath) : null;
  if (later) need(later.manifest.sourceIdentity === archive.manifest.sourceIdentity && later.manifest.epoch >= archive.manifest.epoch, 'later_journal');
  let saved = await readCheckpoint(checkpoint);
  const policy = await loadPolicy(root, undefined, 'scripts/latchkey/archive-policy.mjs');
  const config = await configuration(root, policy), source = archiveIdentity(archive), journal = later ? archiveIdentity(later) : null;
  if (saved) need(saved.value.root === root && saved.value.configurationHash === config.hash
   && canonicalJson(saved.value.archive) === canonicalJson(source) && canonicalJson(saved.value.journal) === canonicalJson(journal), 'records_checkpoint_mismatch', 409);
  operation = await localOperation(root);
  // Re-read under the shared checkout lock: another command may have made a
  // checkpoint while this invocation was validating its complete source file.
  const locked = await readCheckpoint(checkpoint);
  need((locked?.rawHash ?? null) === (saved?.rawHash ?? null), 'records_checkpoint_changed', 409);
  bindings = await localBindings(root, config, policy, operation.token, !!saved);
  const service = await createPortability({ db: bindings.db, buckets: bindings.buckets, migrations: bindings.migrations, policy });
  const destination = await state(bindings.db);
  if (!saved) {
   // Base create auto-cleans stale jobs; this wrapper deliberately refuses
   // unknown unfinished work, rather than triggering that destructive branch.
   need(!destination.import_job, 'records_existing_import', 409);
   saved = await saveCheckpoint(checkpoint, { schema: 1, kind: 'latchkey-records-local-checkpoint', root, configurationHash: config.hash,
    archive: source, journal, destinationIdentity: destination.source_identity, actor: randomUUID(), job: null }, null);
  }
  let value = saved.value, job = value.job;
  if (!job) {
   need(destination.source_identity === value.destinationIdentity, 'records_destination_changed', 409);
   if (destination.import_job) {
    const pending = await service.imports.active(value.actor);
    need(pending?.id === destination.import_job, 'records_existing_import', 409); job = pending.id;
   } else job = await service.imports.create(archive.manifest, value.actor, archive.ledgers ? { ledgers: archive.ledgers } : {});
   value = { ...value, job }; saved = await saveCheckpoint(checkpoint, value, saved);
  }
  need(await service.actor(job) === value.actor, 'records_checkpoint_actor_mismatch', 409);
  let status = await service.imports.status(job);
  need(status.phase !== 'aborted', 'records_import_aborted', 409);
  const currentDestination = await state(bindings.db);
  need(currentDestination.source_identity === value.destinationIdentity || status.phase === 'complete' && currentDestination.source_identity === source.sourceIdentity, 'records_destination_changed', 409);
  // The destination's actual job metadata must match the verified source, even
  // when a checkpoint was copied or edited by its local file owner.
  const actual = await bindings.db.prepare('SELECT metadata FROM rer_portability_jobs WHERE id=?').bind(job).first();
  const metadata = JSON.parse(actual.metadata), manifest = metadata.manifest;
  need(canonicalJson(manifest) === canonicalJson(archive.manifest), 'records_checkpoint_archive_mismatch', 409);
  if (status.phase === 'complete') need(metadata.contentHash === source.contentHash, 'records_checkpoint_archive_mismatch', 409);
  if (status.phase !== 'complete') {
   need(!status.stale, 'import_lease_expired', 409);
   need(currentDestination.import_job === job, 'records_destination_changed', 409);
   let staged = 0;
   for await (const part of inputParts(path)) {
    if (part.index < status.completed) continue;
    status = await service.imports.uploadPart(job, part.index, part); staged++;
    if (staged >= partsPerRun) break;
   }
   if (input.finalize === true && status.completed === archive.manifest.partCount) {
    status = await service.imports.finalize(job, { archiveHash: archive.closing.archiveHash, contentHash: archive.closing.contentHash,
     ...(later ? { laterJournal: { sourceIdentity: later.manifest.sourceIdentity, epoch: later.manifest.epoch, journal: later.manifest.journal } } : {}) });
   }
  }
  return { job, phase: status.phase, completed: status.completed, total: status.total, inactive: true, warning };
 } catch (error) { throw fixedError(error); }
 finally {
  try { await bindings?.close(); } catch (error) { throw fixedError(error); }
  finally { try { await operation?.release(); } catch (error) { throw fixedError(error); } }
 }
}
