import { pbkdf2, createHmac, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { check } from '../items/fields.mjs';
const derive = promisify(pbkdf2);
const utf8 = new TextDecoder('utf-8', { fatal: true });
const base64 = value => {
 check(typeof value === 'string' && value.length <= 12000000 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), 'invalid_bitwarden_encoding');
 return Buffer.from(value, 'base64');
};
// Portable exports use the base64 salt TEXT, then HKDF expand (no extract).
// Only authenticated type-2 ciphertext is accepted; no account key is requested.
export async function readBitwarden(data, passphrase) {
 let source; try { source = JSON.parse(utf8.decode(data)); } catch { check(false, 'invalid_bitwarden_json'); }
 check(source && typeof source === 'object' && !Array.isArray(source), 'invalid_bitwarden_json');
 if (source.encrypted === true) {
  check(source.passwordProtected === true, 'bitwarden_account_restricted_export');
  check(source.kdfType === 0, 'unsupported_bitwarden_kdf');
  check(Number.isSafeInteger(source.kdfIterations) && source.kdfIterations >= 5000 && source.kdfIterations <= 2000000, 'invalid_bitwarden_kdf');
  check(typeof passphrase === 'string' && passphrase.length > 0 && passphrase.length <= 1024, 'bitwarden_export_password_required');
  check(base64(source.salt).length >= 16 && source.salt.length <= 128, 'invalid_bitwarden_salt');
  const master = await derive(passphrase, source.salt, source.kdfIterations, 32, 'sha256');
  const enc = createHmac('sha256', master).update(Buffer.from('enc\x01')).digest();
  const mac = createHmac('sha256', master).update(Buffer.from('mac\x01')).digest();
  const decrypt = value => {
   let plain;
   try {
    check(typeof value === 'string' && value.startsWith('2.'), 'bitwarden_cannot_decrypt');
    const parts = value.slice(2).split('|'); check(parts.length === 3, 'bitwarden_cannot_decrypt');
    const [iv, ciphertext, signature] = parts.map(base64);
    check(iv.length === 16 && ciphertext.length > 0 && ciphertext.length % 16 === 0 && signature.length === 32, 'bitwarden_cannot_decrypt');
    const expected = createHmac('sha256', mac).update(iv).update(ciphertext).digest();
    check(timingSafeEqual(expected, signature), 'bitwarden_cannot_decrypt');
    const decipher = createDecipheriv('aes-256-cbc', enc, iv);
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return utf8.decode(plain);
   } catch { check(false, 'bitwarden_cannot_decrypt'); }
   finally { plain?.fill(0); }
  };
  try {
   check(/^[a-f0-9-]{36}$/i.test(decrypt(source.encKeyValidation_DO_NOT_EDIT)), 'bitwarden_cannot_decrypt');
   source = JSON.parse(decrypt(source.data));
  } finally { master.fill(0); enc.fill(0); mac.fill(0); }
 }
 check(source.encrypted === false && Array.isArray(source.items) && source.items.length <= 1000, 'invalid_bitwarden_export');
 return source;
}
