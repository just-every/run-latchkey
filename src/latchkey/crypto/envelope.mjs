// This module runs in the buyer's client. The service imports validation and
// signature verification only; no service path calls open(), derive() or seal().
const utf8 = new TextEncoder();
const text = new TextDecoder('utf-8', { fatal: true });
export const encode = value => btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export function decode(value, maximum = 1048576) {
 if (typeof value !== 'string' || value.length > Math.ceil(maximum * 4 / 3) || !/^[A-Za-z0-9_-]*$/.test(value)) throw Error('invalid_encoding');
 const raw = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
 const result = Uint8Array.from(raw, c => c.charCodeAt(0));
 if (result.length > maximum || encode(result) !== value) throw Error('invalid_encoding');
 return result;
}
export const random = (size = 32) => crypto.getRandomValues(new Uint8Array(size));
export const id = () => crypto.randomUUID();
export const digest = async value => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? utf8.encode(value) : value)));
export const bytes = value => utf8.encode(JSON.stringify(value));
export const json = value => JSON.parse(text.decode(value));
export function context(value) {
 const keys = ['tenant', 'vault', 'object', 'purpose', 'epoch', 'version'];
 if (!value || Object.keys(value).sort().join() !== [...keys].sort().join()) throw Error('invalid_context');
 for (const key of keys.slice(0, 4)) if (typeof value[key] !== 'string' || !/^[A-Za-z0-9:/._-]{1,200}$/.test(value[key])) throw Error('invalid_context');
 for (const key of keys.slice(4)) if (!Number.isSafeInteger(value[key]) || value[key] < 1) throw Error('invalid_context');
 return bytes(keys.map(key => value[key]));
}
export function validateEnvelope(value, expected) {
 if (!value || Object.keys(value).sort().join() !== ['algorithm', 'ciphertext', 'context', 'nonce', 'schema'].sort().join() || value.schema !== 1 || value.algorithm !== 'A256GCM') throw Error('invalid_envelope');
 const actual = context(value.context);
 if (expected && encode(actual) !== encode(context(expected))) throw Error('context_mismatch');
 if (decode(value.nonce, 12).length !== 12 || decode(value.ciphertext).length < 16) throw Error('invalid_envelope');
 return value;
}
async function aes(key, usages) {
 if (!(key instanceof Uint8Array) || key.length !== 32) throw Error('invalid_key');
 return crypto.subtle.importKey('raw', key, 'AES-GCM', false, usages);
}
export async function seal(key, plaintext, binding) {
 const nonce = random(12), aad = context(binding);
 const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, await aes(key, ['encrypt']), plaintext));
 return { schema: 1, algorithm: 'A256GCM', context: binding, nonce: encode(nonce), ciphertext: encode(ciphertext) };
}
export async function open(key, envelope, expected) {
 validateEnvelope(envelope, expected);
 try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.nonce), additionalData: context(expected), tagLength: 128 }, await aes(key, ['decrypt']), decode(envelope.ciphertext))); }
 catch { throw Error('cannot_decrypt'); }
}
export async function derive(material, salt, purpose) {
 const key = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: utf8.encode(salt), info: utf8.encode(`latchkey/v1/${purpose}`) }, key, 256));
}
export async function unlockKey(exportKey, deviceSecret, account) {
 const secret = decode(deviceSecret, 32);
 if (secret.length !== 32) throw Error('invalid_device_secret');
 // The OPAQUE export key is client-only. The PAKE session key is server-known
 // and MUST NOT be substituted here. Device entropy remains a separate factor.
 const material = new Uint8Array([...decode(exportKey, 64), ...secret]);
 try { return await derive(material, account, 'account-unlock'); } finally { material.fill(0); secret.fill(0); }
}
export const itemKey = (vaultKey, tenant, vault, object) => derive(vaultKey, `${tenant}/${vault}/${object}`, 'item');
export async function keypair(use) {
 const algorithm = use === 'sign' ? 'ECDSA' : 'ECDH';
 const pair = await crypto.subtle.generateKey({ name: algorithm, namedCurve: 'P-256' }, true, use === 'sign' ? ['sign', 'verify'] : ['deriveBits']);
 return { publicKey: encode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateKey: encode(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))) };
}
export async function publicKey(value, use) {
 const raw = decode(value, 65);
 if (raw.length !== 65 || raw[0] !== 4) throw Error('invalid_public_key');
 return crypto.subtle.importKey('raw', raw, { name: use === 'sign' ? 'ECDSA' : 'ECDH', namedCurve: 'P-256' }, false, use === 'sign' ? ['verify'] : []);
}
async function shared(privateValue, publicValue, binding) {
 const key = await crypto.subtle.importKey('pkcs8', decode(privateValue, 200), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
 const material = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await publicKey(publicValue, 'wrap') }, key, 256));
 try { return await derive(material, encode(context(binding)), 'recipient-wrap'); } finally { material.fill(0); }
}
export async function wrapRecipient(value, recipient, binding) {
 const ephemeral = await keypair('wrap');
 const key = await shared(ephemeral.privateKey, recipient, binding);
 try { return { publicKey: ephemeral.publicKey, envelope: await seal(key, value, binding) }; } finally { key.fill(0); }
}
export async function unwrapRecipient(wrapped, privateValue, binding) {
 const key = await shared(privateValue, wrapped.publicKey, binding);
 try { return await open(key, wrapped.envelope, binding); } finally { key.fill(0); }
}
export async function sign(privateValue, value) {
 const key = await crypto.subtle.importKey('pkcs8', decode(privateValue, 200), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
 return encode(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8.encode(value))));
}
export async function verify(publicValue, signature, value) {
 try { return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(publicValue, 'sign'), decode(signature, 64), utf8.encode(value)); } catch { return false; }
}
export const signingText = (method, path, token, nonce, time, bodyHash) => JSON.stringify(['latchkey/v1', method, path, token, nonce, time, bodyHash]);
// A recipient public key alone authenticates no sender. Pin the account's
// separate signing key before accepting a wrapped vault key from storage.
export const wrappedText = value => JSON.stringify(['latchkey/wrapped-key/v1', value.signer, value.publicKey, encode(context(value.envelope.context)), value.envelope.schema, value.envelope.algorithm, value.envelope.nonce, value.envelope.ciphertext]);
export async function wrapSigned(value, recipient, binding, signer, privateValue) {
 const wrapped = { ...await wrapRecipient(value, recipient, binding), signer };
 return { ...wrapped, signature: await sign(privateValue, wrappedText(wrapped)) };
}
export async function verifyWrapped(value, authorityKey, signer, binding) {
 try {
  if (Object.keys(value).sort().join() !== ['publicKey', 'envelope', 'signer', 'signature'].sort().join() || value.signer !== signer) return false;
  validateEnvelope(value.envelope, binding);
  await publicKey(value.publicKey, 'wrap');
  return await verify(authorityKey, value.signature, wrappedText(value));
 } catch { return false; }
}
export async function unwrapSigned(value, privateValue, authorityKey, signer, binding) {
 if (!await verifyWrapped(value, authorityKey, signer, binding)) throw Error('invalid_key_signature');
 return unwrapRecipient(value, privateValue, binding);
}
