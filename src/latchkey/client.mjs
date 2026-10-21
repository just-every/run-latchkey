import * as opaque from '@serenity-kit/opaque';
import { bytes, decode, digest, encode, id, itemKey, json, keypair, open, random, seal, sign, signingText, unlockKey, unwrapRecipient, wrapRecipient } from './crypto/envelope.mjs';

const binding = (tenant, vault, object, purpose, epoch, version = 1) => ({ tenant, vault, object, purpose, epoch, version });
export class ClientError extends Error { constructor(code, status = 0) { super(code); this.code = code; this.status = status; } }
const requireValue = (condition, code) => { if (!condition) throw new ClientError(code); };
export class VaultClient {
 constructor(origin, { cookie = '', fetcher = fetch } = {}) {
  const url = new URL(origin);
  requireValue(url.origin === origin && (url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)), 'https_required');
  this.origin = origin; this.cookie = cookie; this.fetcher = fetcher;
 }
 async request(route, input, signer) {
  const path = `/api/latchkey/${route}`, body = JSON.stringify(input);
  const headers = { origin: this.origin, 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) };
  if (signer) {
   requireValue(this.token, 'locked');
   const nonce = id(), time = String(Date.now());
   Object.assign(headers, { 'x-latchkey-grant': this.token, 'x-latchkey-nonce': nonce, 'x-latchkey-time': time, 'x-latchkey-signature': await sign(signer, signingText('POST', path, this.token, nonce, time, await digest(body))) });
  }
  const response = await this.fetcher(this.origin + path, { method: 'POST', headers, body, redirect: 'error' });
  const cookie = response.headers.get('set-cookie'); if (cookie) this.cookie = cookie.split(';')[0];
  let result; try { result = await response.json(); } catch { throw new ClientError('service_unavailable', response.status); }
  if (!response.ok) throw new ClientError(typeof result.error === 'string' && /^[a-z_]{1,64}$/.test(result.error) ? result.error : 'request_refused', response.status);
  return result;
 }
 async confirmIdentity(token) {
  const response = await this.fetcher(this.origin + '/auth/confirm', { method: 'POST', headers: { origin: this.origin, 'content-type': 'application/json' }, body: JSON.stringify({ token }), redirect: 'manual' });
  const cookie = response.headers.get('set-cookie');
  requireValue(response.status === 303 && cookie, 'identity_confirmation_failed');
  this.cookie = cookie.split(';')[0];
 }
 async register(password, { beforeCommit } = {}) {
  requireValue(typeof password === 'string' && password.length >= 1, 'password_required');
  await opaque.ready;
  const started = opaque.client.startRegistration({ password });
  const registration = await this.request('register/start', { request: started.registrationRequest });
  const result = opaque.client.finishRegistration({ clientRegistrationState: started.clientRegistrationState, registrationResponse: registration.response, password, identifiers: { client: registration.account, server: registration.tenant }, keyStretching: 'memory-constrained' });
  requireValue(result.serverStaticPublicKey === registration.serverKey, 'server_key_changed');
  const profile = { schema: 1, origin: this.origin, account: registration.account, tenant: registration.tenant, device: id(), deviceSecret: encode(random()), serverKey: result.serverStaticPublicKey, generation: 1, seen: {}, trusted: {} };
  const root = { recipient: await keypair('wrap'), recovery: await keypair('sign') }, signing = await keypair('sign');
  profile.recipientKey = root.recipient.publicKey; profile.trusted[profile.account] = root.recipient.publicKey;
  const kit = { schema: 1, origin: this.origin, account: profile.account, tenant: profile.tenant, serverKey: profile.serverKey, recoverySecret: encode(random()), generation: 1 };
  const bundle = await seal(await unlockKey(result.exportKey, profile.deviceSecret, profile.account), bytes({ root, signing }), binding(profile.tenant, 'account', profile.device, 'device', 1));
  const recoveryWrap = await seal(await unlockKey(result.exportKey, kit.recoverySecret, profile.account), bytes({ root }), binding(profile.tenant, 'account', profile.account, 'recovery', 1));
  const input = { account: profile.account, record: result.registrationRecord, recipientKey: profile.recipientKey, recoveryKey: root.recovery.publicKey, recoveryWrap, device: profile.device, deviceKey: signing.publicKey, bundle };
  if (beforeCommit) await beforeCommit({ profile, kit });
  await this.request('register/finish', { ...input, signature: await sign(signing.privateKey, JSON.stringify(input)) });
  return { profile, kit };
 }
 async exchange(profile, password, device = profile.device) {
  requireValue(profile.schema === 1 && profile.origin === this.origin, 'profile_mismatch');
  await opaque.ready;
  const started = opaque.client.startLogin({ password });
  const exchange = await this.request('login/start', { account: profile.account, device, request: started.startLoginRequest });
  let result;
  try { result = opaque.client.finishLogin({ clientLoginState: started.clientLoginState, loginResponse: exchange.response, password, identifiers: { client: profile.account, server: profile.tenant }, keyStretching: 'memory-constrained' }); } catch {}
  requireValue(result && result.serverStaticPublicKey === profile.serverKey, 'authentication_failed');
  const admitted = await this.request('login/finish', { exchange: exchange.exchange, request: result.finishLoginRequest });
  requireValue(admitted.account === profile.account && admitted.tenant === profile.tenant, 'account_mismatch');
  this.token = admitted.token; this.expires = admitted.expires;
  return { result, admitted };
 }
 async unlock(profile, password) {
  const { result, admitted } = await this.exchange(profile, password);
  requireValue(admitted.generation === profile.generation, 'device_revoked');
  const key = await unlockKey(result.exportKey, profile.deviceSecret, profile.account);
  try { this.bundle = json(await open(key, admitted.bundle, binding(profile.tenant, 'account', profile.device, 'device', profile.generation))); } finally { key.fill(0); }
  requireValue(this.bundle.root.recipient.publicKey === profile.recipientKey && admitted.recipientKey === profile.recipientKey && this.bundle.root.recovery.publicKey === admitted.recoveryKey, 'account_key_changed');
  this.profile = profile;
  return this;
 }
 call(route, input) { requireValue(this.bundle && this.profile, 'locked'); return this.request(route, input, this.bundle.signing.privateKey); }
 lock() { this.bundle = null; this.token = null; this.cookie = ''; this.profile = null; }
 identity() { requireValue(this.profile, 'locked'); return { account: this.profile.account, tenant: this.profile.tenant, recipientKey: this.profile.recipientKey, fingerprint: digest(this.profile.recipientKey) }; }
 async createVault() {
  const vault = id(), key = random(), profile = this.profile;
  requireValue(profile, 'locked');
  try { return await this.call('vault/create', { vault, wrapped: await wrapRecipient(key, profile.recipientKey, binding(profile.tenant, vault, profile.account, 'vault-key', 1)) }); } finally { key.fill(0); }
 }
 async snapshot(vault, mode = 'read') {
  const result = await this.call(`vault/${mode}`, { vault }), profile = this.profile;
  requireValue(result.vault === vault && result.tenant === profile.tenant, 'context_mismatch');
  const seen = profile.seen[vault];
  requireValue(!seen || result.epoch >= seen.epoch && result.revision >= seen.revision, 'server_rollback');
  const key = await unwrapRecipient(result.wrapped, this.bundle.root.recipient.privateKey, binding(profile.tenant, vault, profile.account, 'vault-key', result.epoch));
  requireValue(key.length === 32, 'invalid_key');
  profile.seen[vault] = { epoch: result.epoch, revision: result.revision };
  return { result, key };
 }
 async decodeVersions(snapshot) {
  const { result, key } = snapshot;
  const versions = [];
  for (const row of result.versions) {
   const derived = await itemKey(key, result.tenant, result.vault, row.object_id);
   try { versions.push({ object: row.object_id, version: row.version, value: json(await open(derived, JSON.parse(row.envelope), binding(result.tenant, result.vault, row.object_id, 'item', result.epoch, row.version))) }); } finally { derived.fill(0); }
  }
  return versions;
 }
 async readVault(vault) {
  const snapshot = await this.snapshot(vault);
  try { return { vault, epoch: snapshot.result.epoch, revision: snapshot.result.revision, versions: await this.decodeVersions(snapshot) }; } finally { snapshot.key.fill(0); }
 }
 async put(vault, value, object = id()) {
  const snapshot = await this.snapshot(vault);
  const { key, result } = snapshot;
  const version = Math.max(0, ...result.versions.filter(row => row.object_id === object).map(row => row.version)) + 1;
  const derived = await itemKey(key, result.tenant, vault, object);
  try {
   const envelope = await seal(derived, bytes(value), binding(result.tenant, vault, object, 'item', result.epoch, version));
   const written = await this.call('item/put', { vault, object, version, revision: result.revision, envelope });
   this.profile.seen[vault] = { epoch: result.epoch, revision: written.revision };
   return written;
  } finally { key.fill(0); derived.fill(0); }
 }
 async share(vault, account, fingerprint, rights) {
  const recipient = await this.call('directory', { account });
  requireValue(recipient.fingerprint === fingerprint && await digest(recipient.publicKey) === fingerprint, 'recipient_mismatch');
  const snapshot = await this.snapshot(vault);
  try {
   const wrapped = await wrapRecipient(snapshot.key, recipient.publicKey, binding(this.profile.tenant, vault, account, 'vault-key', snapshot.result.epoch));
   const result = await this.call('vault/share', { vault, account, fingerprint, rights, wrapped, revision: snapshot.result.revision });
   this.profile.trusted[account] = recipient.publicKey;
   return result;
  } finally { snapshot.key.fill(0); }
 }
 async rotate(vault, remove = null, confirmedKeys = {}) {
  const snapshot = await this.snapshot(vault), nextKey = random(), { result } = snapshot;
  try {
   const plain = await this.decodeVersions(snapshot), epoch = result.epoch + 1;
   const versions = [];
   for (const row of plain) {
    const derived = await itemKey(nextKey, result.tenant, vault, row.object);
    try { versions.push({ object: row.object, version: row.version, envelope: await seal(derived, bytes(row.value), binding(result.tenant, vault, row.object, 'item', epoch, row.version)) }); } finally { derived.fill(0); }
   }
   const recipients = [];
   for (const recipient of result.recipients.filter(row => row.account_id !== remove)) {
    const pinned = this.profile.trusted[recipient.account_id] ?? confirmedKeys[recipient.account_id];
    requireValue(pinned && pinned === recipient.recipient_key, 'recipient_confirmation_required');
    recipients.push({ account: recipient.account_id, wrapped: await wrapRecipient(nextKey, pinned, binding(result.tenant, vault, recipient.account_id, 'vault-key', epoch)) });
   }
   const rotated = await this.call('vault/rotate', { vault, remove, revision: result.revision, versions, recipients });
   this.profile.seen[vault] = { epoch, revision: result.revision + 1 };
   return rotated;
  } finally { snapshot.key.fill(0); nextKey.fill(0); }
 }
 async exportVault(vault, exportKey) {
  const key = decode(exportKey, 32); requireValue(key.length === 32, 'invalid_key');
  const snapshot = await this.snapshot(vault, 'export');
  try {
   const archive = { schema: 1, sourceTenant: this.profile.tenant, vault, versions: await this.decodeVersions(snapshot), activeAuthority: false };
   return await seal(key, bytes(archive), binding('portable', 'archive', id(), 'export', 1));
  } finally { snapshot.key.fill(0); key.fill(0); }
 }
 static async openExport(archive, exportKey) {
  requireValue(archive.context?.tenant === 'portable' && archive.context?.purpose === 'export', 'context_mismatch');
  const key = decode(exportKey, 32);
  try { return json(await open(key, archive, archive.context)); } finally { key.fill(0); }
 }
 async beginEnrollment(locator, password) {
  const { result, admitted } = await this.exchange(locator, password, 'enrollment');
  const profile = { ...locator, device: id(), deviceSecret: encode(random()), generation: admitted.generation, seen: {}, trusted: { [locator.account]: admitted.recipientKey }, recipientKey: admitted.recipientKey };
  const signing = await keypair('sign'), transfer = await keypair('wrap');
  const key = await unlockKey(result.exportKey, profile.deviceSecret, profile.account);
  try { profile.pending = await seal(key, bytes({ signing, transfer }), binding(profile.tenant, 'account', profile.device, 'pending', profile.generation)); } finally { key.fill(0); }
  const requested = await this.request('enrollment/request', { device: profile.device, deviceKey: signing.publicKey, transferKey: transfer.publicKey }, signing.privateKey);
  return { profile, fingerprint: requested.fingerprint, device: profile.device };
 }
 async approveEnrollment(device, fingerprint) {
  const pending = await this.call('enrollment/status', { device });
  requireValue(await digest(JSON.stringify([this.profile.account, device, pending.public_key, pending.transfer_key, this.profile.generation])) === fingerprint, 'enrollment_mismatch');
  const wrapped = await wrapRecipient(bytes({ root: this.bundle.root }), pending.transfer_key, binding(this.profile.tenant, 'account', device, 'enrollment', this.profile.generation));
  return this.call('enrollment/approve', { device, fingerprint, wrapped });
 }
 async completeEnrollment(profile, password) {
  const { result, admitted } = await this.exchange(profile, password, 'enrollment');
  requireValue(admitted.generation === profile.generation, 'device_revoked');
  const key = await unlockKey(result.exportKey, profile.deviceSecret, profile.account);
  try {
   const local = json(await open(key, profile.pending, binding(profile.tenant, 'account', profile.device, 'pending', profile.generation)));
   const pending = await this.request('enrollment/status', { device: profile.device }, local.signing.privateKey);
   requireValue(pending.approved_wrap, 'approval_pending');
   const transferred = json(await unwrapRecipient(JSON.parse(pending.approved_wrap), local.transfer.privateKey, binding(profile.tenant, 'account', profile.device, 'enrollment', profile.generation)));
   requireValue(transferred.root.recipient.publicKey === profile.recipientKey && transferred.root.recovery.publicKey === admitted.recoveryKey, 'account_key_changed');
   const bundle = await seal(key, bytes({ root: transferred.root, signing: local.signing }), binding(profile.tenant, 'account', profile.device, 'device', profile.generation));
   await this.request('enrollment/complete', { device: profile.device, bundle, signature: await sign(local.signing.privateKey, JSON.stringify([profile.device, bundle])) }, local.signing.privateKey);
   delete profile.pending;
   return profile;
  } finally { key.fill(0); }
 }
 async recover(kit, password, { beforeCommit } = {}) {
  const { result, admitted } = await this.exchange(kit, password, 'recovery');
  requireValue(kit.generation === admitted.generation, 'kit_revoked');
  const key = await unlockKey(result.exportKey, kit.recoverySecret, kit.account);
  let root;
  try { root = json(await open(key, admitted.bundle, binding(kit.tenant, 'account', kit.account, 'recovery', kit.generation))).root; } finally { key.fill(0); }
  requireValue(root.recovery.publicKey === admitted.recoveryKey, 'kit_revoked');
  const oldRecovery = root.recovery.privateKey;
  root.recovery = await keypair('sign');
  const profile = { schema: 1, origin: this.origin, account: kit.account, tenant: kit.tenant, serverKey: kit.serverKey, device: id(), deviceSecret: encode(random()), generation: kit.generation + 1, recipientKey: root.recipient.publicKey, trusted: { [kit.account]: root.recipient.publicKey }, seen: {} };
  const newKit = { ...kit, generation: profile.generation, recoverySecret: encode(random()) }, signing = await keypair('sign');
  const bundle = await seal(await unlockKey(result.exportKey, profile.deviceSecret, profile.account), bytes({ root, signing }), binding(profile.tenant, 'account', profile.device, 'device', profile.generation));
  const recoveryWrap = await seal(await unlockKey(result.exportKey, newKit.recoverySecret, profile.account), bytes({ root }), binding(profile.tenant, 'account', profile.account, 'recovery', profile.generation));
  if (beforeCommit) await beforeCommit({ profile, kit: newKit });
  await this.request('recover', { generation: kit.generation, device: profile.device, deviceKey: signing.publicKey, bundle, recoveryKey: root.recovery.publicKey, recoveryWrap }, oldRecovery);
  this.lock();
  return { profile, kit: newKit };
 }
}
