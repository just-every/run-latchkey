import { bytes, decode, derive, digest, encode, id, itemKey, json, open, random, seal, unwrapSigned } from '../crypto/envelope.mjs';
import { binding, disclosure, need } from './common.mjs';

async function deliveryKey(secret, salt, password) {
 const material = decode(secret, 32); need(material.length === 32, 'invalid_link');
 let stretched = new Uint8Array();
 try {
  if (password !== null) {
   need(typeof password === 'string' && password.length > 0 && password.length <= 1024, 'password_required');
   const imported = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
   stretched = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: decode(salt, 32), iterations: 310000 }, imported, 256));
  }
  return await derive(new Uint8Array([...material, ...stretched]), salt, 'external-link');
 } finally { material.fill(0); stretched.fill(0); }
}
const proof = async key => digest(encode(key));

export class SharingClient {
 constructor(client) { this.client = client; }
 policy() { return this.client.call('sharing/policy', {}); }
 setPolicy(value) { return this.client.call('sharing/policy/set', value); }
 async createGroup(accounts = []) {
  const group = id(); await this.client.call('sharing/group/create', { group });
  if (accounts.length) await this.setGroup(group, accounts); return { group };
 }
 groupMembers(group) { return this.client.call('sharing/group/members', { group }); }
 setGroup(group, accounts) { return this.client.call('sharing/group/set', { group, accounts }); }
 async grant(vault, { recipients, objects = null, group = null, rights = ['read'], startsAt = null, expiresAt = null, approvalRequired = false } = {}) {
  const client = this.client, share = id(), snapshot = await client.snapshot(vault);
  try {
   const latest = new Map(); for (const row of snapshot.result.versions) latest.set(row.object_id, row.version);
   const selection = objects ?? [...latest.keys()]; need(selection.length > 0 && new Set(selection).size === selection.length, 'invalid_selection');
   const wrappedRecipients = [];
   for (const target of recipients) {
    const recipient = await client.pinAccount(target.account, target.fingerprint), items = [];
    for (const object of selection) {
     need(latest.has(object), 'not_found', 404);
     const key = await itemKey(snapshot.key, client.profile.tenant, vault, object);
     try { items.push({ object, version: latest.get(object), wrapped: await client.wrap(key, recipient.publicKey, binding(client.profile.tenant, vault, share, `share-key:${object}:${target.account}`, snapshot.result.epoch, latest.get(object))) }); } finally { key.fill(0); }
    }
    wrappedRecipients.push({ account: target.account, fingerprint: target.fingerprint, items });
   }
   return await client.call('sharing/grant', { share, vault, scope: objects === null ? 'vault' : 'items', group, rights, startsAt, expiresAt, approvalRequired, recipients: wrappedRecipients });
  } finally { snapshot.key.fill(0); }
 }
 received() { return this.client.call('sharing/received', {}); }
 approve(share) { return this.client.call('sharing/approve', { share }); }
 revoke(share) { return this.client.call('sharing/revoke', { share }); }
 async snapshot(share, object, action = 'read') {
  const result = await this.client.call('sharing/read', { share, object, action }), profile = this.client.profile;
  need(result.id === share && result.object_id === object && result.tenant === profile.tenant, 'context_mismatch');
  const sender = profile.trusted[result.source_account]; need(sender?.authorityKey, 'recipient_confirmation_required');
  const key = await unwrapSigned(result.wrapped, this.client.bundle.root.recipient.privateKey, sender.authorityKey, result.source_account, binding(profile.tenant, result.vault_id, share, `share-key:${object}:${profile.account}`, result.epoch, result.version));
  return { result, key };
 }
 async read(share, object, action = 'read') {
  const { result, key } = await this.snapshot(share, object, action);
  try { return { object, version: result.version, value: json(await open(key, result.envelope, binding(result.tenant, result.vault_id, object, 'item', result.epoch, result.version))), disclosure }; } finally { key.fill(0); }
 }
 async put(share, object, value) {
  const { result, key } = await this.snapshot(share, object);
  try { return await this.client.call('sharing/put', { share, object, version: result.version + 1, envelope: await seal(key, bytes(value), binding(result.tenant, result.vault_id, object, 'item', result.epoch, result.version + 1)) }); } finally { key.fill(0); }
 }
 history(vault, object = null) { return this.client.call('sharing/history', { vault, object }); }
 revokeLink(link) { return this.client.call('sharing/link/revoke', { link }); }
 async createLink(vault, object, { recipient, password = null, maxViews = 1, startsAt = null, expiresAt = null, attachment = null } = {}) {
  const client = this.client, snapshot = await client.snapshot(vault, 'read', { object, history: false });
  const link = id(), secret = encode(random()), passwordSalt = encode(random()); let key;
  try {
   const rows = await client.decodeVersions(snapshot), current = rows.at(-1); need(current, 'not_found', 404);
   let payload = { kind: 'item', value: current.value };
   if (attachment !== null) { const file = current.value.attachments?.find(file => file.id === attachment); need(file, 'not_found', 404); payload = { kind: 'file', attachment: file }; }
   key = await deliveryKey(secret, passwordSalt, password);
   const context = binding(client.profile.tenant, vault, link, 'external-link', snapshot.result.epoch, current.version);
   const result = await client.call('sharing/link/create', { link, vault, object, sourceVersion: current.version, verifierHash: await digest(await proof(key)), passwordSalt, passwordRequired: password !== null, recipient, envelope: await seal(key, bytes(payload), context), startsAt, expiresAt, maxViews });
   const fragment = encode(bytes({ schema: 1, key: secret, context }));
   return { ...result, url: `${client.origin}/share#${fragment}`, disclosure };
  } finally { snapshot.key.fill(0); key?.fill(0); }
 }
}

export class PublicLinkClient {
 constructor(url, { fetcher = (url, init) => globalThis.fetch(url, init) } = {}) {
  const parsed = new URL(url); need(parsed.protocol === 'https:' || parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname), 'https_required');
  need(parsed.pathname === '/share' && !parsed.search, 'invalid_link');
  let fragment; try { fragment = json(decode(parsed.hash.slice(1), 2048)); } catch { need(false, 'invalid_link'); }
  need(fragment?.schema === 1 && fragment.context?.purpose === 'external-link', 'invalid_link');
  this.origin = parsed.origin; this.fragment = fragment; this.link = fragment.context.object; this.fetcher = fetcher;
 }
 async request(route, input) {
  const response = await this.fetcher(`${this.origin}/api/latchkey/sharing/link/${route}`, { method: 'POST', headers: { origin: this.origin, 'content-type': 'application/json' }, body: JSON.stringify(input), redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  let result; try { result = await response.json(); } catch { need(false, 'service_unavailable', response.status); }
  need(response.ok, /^[a-z_]{1,64}$/.test(result.error) ? result.error : 'request_refused', response.status); return result;
 }
 preview() { return this.request('preview', { link: this.link }); }
 async prepare(password = null) {
  const preview = await this.preview(); need(!preview.passwordRequired || password !== null, 'password_required');
  this.lock(); this.key = await deliveryKey(this.fragment.key, preview.passwordSalt, preview.passwordRequired ? password : null);
 }
 async challenge(recipient, password = null) {
  await this.prepare(password);
  try { return await this.request('challenge', { link: this.link, verifier: await proof(this.key), recipient }); } catch (error) { this.lock(); throw error; }
 }
 async open(challenge, code) {
  need(this.key, 'recipient_verification_required');
  try {
   const result = await this.request('open', { link: this.link, verifier: await proof(this.key), challenge, code });
   need(result.link === this.link, 'context_mismatch');
   return { ...json(await open(this.key, result.envelope, this.fragment.context)), disclosure: result.disclosure };
  } finally { this.lock(); }
 }
 lock() { this.key?.fill(0); this.key = null; }
}
