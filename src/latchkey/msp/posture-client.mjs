import { FleetError } from './client.mjs';

function expiryEnd(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
 const start = Date.parse(`${value}T00:00:00.000Z`);
 if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== value) return null;
 return start + 86400000 - 1;
}

export async function captureExpiry(client, vault, { confirmed = false } = {}) {
 if (confirmed !== true) throw new FleetError('posture_capture_consent_required');
 const snapshot = await client.readVault(vault);
 const lifecycle = await client.call('lifecycle/list', { vault });
 if (snapshot.vault !== vault || lifecycle.vault.id !== vault || lifecycle.vault.revision !== snapshot.revision || lifecycle.vault.epoch !== snapshot.epoch) throw new FleetError('version_conflict');
 const latest = new Map();
 for (const row of snapshot.versions) if (!latest.has(row.object) || latest.get(row.object).version < row.version) latest.set(row.object, row);
 const inactive = new Set(lifecycle.items.filter(row => row.state !== 'active').map(row => row.object));
 const observedAt = Date.now();
 let totalActiveItems = 0, withExpiry = 0, expiredCount = 0;
 for (const row of latest.values()) {
  const item = row.value;
  if (inactive.has(row.object) || item?.schema !== 'latchkey/item/v1' || item.ownership !== 'company') continue;
  totalActiveItems++;
  const expiries = item.fields.filter(field => field.secret === false && field.type === 'date' && ['expiry', 'expiresAt'].includes(field.id)).map(field => expiryEnd(field.value)).filter(value => value !== null);
  if (!expiries.length) continue;
  withExpiry++;
  if (expiries.some(value => value < observedAt)) expiredCount++;
 }
 return client.call('msp/posture/capture', { vault: snapshot.vault, epoch: snapshot.epoch, revision: snapshot.revision, observedAt, totalActiveItems, withExpiry, expiredCount, confirmed: true });
}
