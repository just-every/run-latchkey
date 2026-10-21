import { VaultClient, ClientError } from './client.mjs';
import { bytes, decode, derive, digest, encode, id, json, keypair, open, random, seal, unwrapSigned } from './crypto/envelope.mjs';
function material(value) { const key = decode(value, 32); if (key.length !== 32) throw new ClientError('invalid_key'); return key; }
const profileContext = machine => ({ tenant: 'local', vault: 'machine', object: machine, purpose: 'runtime-profile', epoch: 1, version: 1 });
export class MachineClient {
 static async create(origin, runtimeKey) {
  new VaultClient(origin);
  const machine = id(), signing = await keypair('sign'), recipient = await keypair('wrap');
  const key = await derive(material(runtimeKey), machine, 'runtime-profile');
  try { return { schema: 1, origin, machine, deviceKey: signing.publicKey, recipientKey: recipient.publicKey, bundle: await seal(key, bytes({ signing, recipient }), profileContext(machine)) }; } finally { key.fill(0); }
 }
 static async identity(profile) { return { machine: profile.machine, deviceKey: profile.deviceKey, recipientKey: profile.recipientKey, fingerprint: await digest(JSON.stringify([profile.machine, profile.deviceKey, profile.recipientKey])) }; }
 static async read(profile, grant, runtimeKey, { fetcher = fetch } = {}) {
  if (profile.origin !== grant.origin || profile.machine !== grant.machine) throw new ClientError('profile_mismatch');
  const key = await derive(material(runtimeKey), profile.machine, 'runtime-profile');
  let local;
  try { local = json(await open(key, profile.bundle, profileContext(profile.machine))); } finally { key.fill(0); }
  const client = new VaultClient(profile.origin, { fetcher }); client.token = grant.token;
  try {
   const result = await client.request('runtime/read', { machine: profile.machine }, local.signing.privateKey);
   if (result.tenant !== grant.tenant || result.vault !== grant.vault || result.object !== grant.object || result.epoch !== grant.epoch) throw new ClientError('context_mismatch');
   const itemContext = { tenant: result.tenant, vault: result.vault, object: result.object, purpose: 'item', epoch: result.epoch, version: result.version };
   const wrappedContext = { tenant: result.tenant, vault: result.vault, object: profile.machine, purpose: `machine-key:${result.object}`, epoch: result.epoch, version: 1 };
   const itemKey = await unwrapSigned(result.wrapped, local.recipient.privateKey, grant.authorityKey, grant.account, wrappedContext);
   try { return json(await open(itemKey, result.envelope, itemContext)); } finally { itemKey.fill(0); }
  } finally { client.lock(); }
 }
}
