import { ArchiveVerifier, ContentVerifier, checkPart } from '@runeditrun/rer/modules/portability/format';
import { readPart } from '@runeditrun/rer/modules/portability/storage';
import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { requireRecords } from './common.mjs';

// Completed Base imports retain their verified parts until transfer erasure.
// Reuse those records, not caller claims, to prove exact archive membership.
export async function importedArchive(db, plan) {
 const job = await db.prepare("SELECT id,metadata FROM rer_portability_jobs WHERE kind='import' AND phase='complete' AND json_extract(metadata,'$.contentHash')=? AND json_extract(metadata,'$.manifest.sourceIdentity')=? ORDER BY rowid DESC LIMIT 1").bind(plan.contentHash, plan.sourceIdentity).first();
 requireRecords(job, 'completed_restore_required', 409);
 const metadata = JSON.parse(job.metadata), manifest = metadata.manifest;
 const state = await db.prepare('SELECT source_identity FROM rer_portability_state WHERE id=1').first();
 requireRecords(state?.source_identity === plan.sourceIdentity, 'restore_source_changed', 409);
 const verifier = new ContentVerifier(manifest), archive = new ArchiveVerifier(manifest), vaults = [];
 let source;
 for (let index = 0; index < manifest.partCount; index++) {
  const part = await readPart(db, job.id, index); await checkPart(part, index); archive.add(part);
  for (const item of part.items) {
   verifier.add(item);
   if (item.kind !== 'row') continue;
   if (item.table === 'lky_accounts' && item.row.id === plan.source.account) source = item.row;
   if (item.table === 'lky_vaults' && item.row.owner === plan.source.account) {
    const row = item.row; vaults.push({ vault: row.id, tenant: row.tenant, owner: row.owner, epoch: row.epoch, revision: row.revision });
   }
  }
 }
 requireRecords(archive.digest() === plan.archiveHash && verifier.digest() === plan.contentHash, 'restore_archive_mismatch', 409);
 requireRecords(source?.tenant === plan.source.tenant && source.recipient_key === plan.source.recipientKey && source.authority_key === plan.source.authorityKey, 'source_owner_key_mismatch', 409);
 vaults.sort((a, b) => a.vault.localeCompare(b.vault));
 requireRecords(vaults.length > 0 && canonicalJson(vaults) === canonicalJson(plan.vaults), 'restore_vault_inventory_mismatch', 409);
 return job;
}
