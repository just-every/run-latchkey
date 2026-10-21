import { check } from '../items/fields.mjs';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function decodeBase32(secret) {
 check(typeof secret === 'string', 'invalid_totp_secret');
 const value = secret.toUpperCase().replace(/=+$/, '');
 check(/^[A-Z2-7]+$/.test(value) && [0, 2, 4, 5, 7].includes(value.length % 8) && value.length <= 2048, 'invalid_totp_secret');
 const result = []; let buffer = 0, bits = 0;
 for (const char of value) {
  buffer = (buffer << 5) | alphabet.indexOf(char); bits += 5;
  if (bits >= 8) { bits -= 8; result.push(buffer >>> bits & 255); buffer &= (1 << bits) - 1; }
 }
 check(buffer === 0 && result.length >= 10, 'invalid_totp_secret');
 return new Uint8Array(result);
}
export function validateTotp(input) {
 check(input && typeof input.issuer === 'string' && typeof input.account === 'string' && input.issuer.trim() && input.account.trim(), 'totp_identity_required');
 const algorithm = (input.algorithm ?? 'SHA1').toUpperCase().replaceAll('-', ''), digits = input.digits ?? 6, period = input.period ?? 30;
 check(['SHA1', 'SHA256', 'SHA512'].includes(algorithm) && [6, 8].includes(digits) && Number.isSafeInteger(period) && period >= 15 && period <= 300, 'invalid_totp_parameters');
 const key = decodeBase32(input.secret); key.fill(0);
 return { secret: input.secret.toUpperCase().replace(/=+$/, ''), issuer: input.issuer, account: input.account, algorithm, digits, period };
}
export function parseTotpUri(text, target) {
 let url; try { url = new URL(text); } catch {}
 check(url && url.protocol === 'otpauth:' && url.hostname === 'totp' && !url.username && !url.password && !url.hash, 'invalid_totp_uri');
 const params = url.searchParams;
 check([...params.keys()].every(key => ['secret', 'issuer', 'algorithm', 'digits', 'period'].includes(key)) && [...params.keys()].every(key => params.getAll(key).length === 1), 'invalid_totp_uri');
 let label; try { label = decodeURIComponent(url.pathname.slice(1)); } catch { check(false, 'invalid_totp_uri'); }
 const separator = label.indexOf(':'), labelIssuer = separator < 0 ? '' : label.slice(0, separator).trim(), account = (separator < 0 ? label : label.slice(separator + 1)).trim();
 const issuer = params.get('issuer')?.trim() || labelIssuer;
 check(!labelIssuer || labelIssuer === issuer, 'totp_issuer_mismatch');
 const input = validateTotp({ secret: params.get('secret'), issuer, account, algorithm: params.get('algorithm') || 'SHA1', digits: params.has('digits') ? Number(params.get('digits')) : 6, period: params.has('period') ? Number(params.get('period')) : 30 });
 if (target) { check(target.issuer === input.issuer, 'totp_issuer_mismatch'); check(target.account === input.account, 'totp_account_mismatch'); }
 return input;
}
export async function totp(input, time = Date.now()) {
 input = validateTotp(input);
 check(Number.isSafeInteger(time) && time >= 0, 'invalid_totp_time');
 const counter = BigInt(Math.floor(time / 1000 / input.period)), moving = new Uint8Array(8);
 new DataView(moving.buffer).setBigUint64(0, counter);
 const secret = decodeBase32(input.secret);
 let hmac;
 try {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: input.algorithm.replace('SHA', 'SHA-') }, false, ['sign']);
  hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, moving));
 } finally { secret.fill(0); }
 const offset = hmac.at(-1) & 15, binary = new DataView(hmac.buffer).getUint32(offset) & 0x7fffffff;
 const code = String(binary % 10 ** input.digits).padStart(input.digits, '0'); hmac.fill(0);
 return { code, validFrom: Number(counter) * input.period * 1000, validUntil: (Number(counter) + 1) * input.period * 1000, issuer: input.issuer, account: input.account };
}
