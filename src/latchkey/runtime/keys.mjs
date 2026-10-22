import { decode, derive, itemKey, json, open } from '../crypto/envelope.mjs';
import { binding, need } from './common.mjs';

export async function projectResourceKey(client, vault, object) {
 const snapshot = await client.snapshot(vault, 'read', { object, history: false });
 try { return await itemKey(snapshot.key, client.profile.tenant, vault, object); }
 finally { snapshot.key.fill(0); }
}
export async function machineKeys(profile, runtimeKey) {
 need(profile?.schema === 1, 'invalid_runtime_profile');
 const material = decode(runtimeKey, 32); need(material.length === 32, 'invalid_key');
 let key;
 try {
  key = await derive(material, profile.machine, 'runtime-profile');
  return json(await open(key, profile.bundle, binding('local', 'machine', profile.machine, 'runtime-profile', 1)));
 } finally { material.fill(0); key?.fill(0); }
}
