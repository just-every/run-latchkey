import { digest, id, sign, signingText } from '../crypto/envelope.mjs';
import { RuntimeError, need } from './common.mjs';

// Runtime authentication is a machine signature, independent of human PAKE.
export class RuntimeTransport {
 constructor(origin, token, { fetcher = fetch } = {}) {
  const url = new URL(origin);
  need(url.origin === origin && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'https_required');
  this.origin = origin; this.token = token; this.fetcher = fetcher;
 }
 async request(route, input, privateKey) {
  const path = `/api/latchkey/${route}`, body = JSON.stringify(input), nonce = id(), time = String(Date.now());
  const response = await this.fetcher(this.origin + path, { method: 'POST', redirect: 'error', body, headers: {
   origin: this.origin, 'content-type': 'application/json', 'x-latchkey-grant': this.token,
   'x-latchkey-nonce': nonce, 'x-latchkey-time': time,
   'x-latchkey-signature': await sign(privateKey, signingText('POST', path, this.token, nonce, time, await digest(body))),
  } });
  const reader = response.body?.getReader(); need(reader, 'service_unavailable', response.status);
  let length = 0; const chunks = [];
  while (true) {
   const part = await reader.read(); if (part.done) break;
   length += part.value.length;
   if (length > 5000000) { await reader.cancel(); throw new RuntimeError('response_too_large'); }
   chunks.push(part.value);
  }
  const raw = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
  let result; try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new RuntimeError('service_unavailable', response.status); }
  if (!response.ok) throw new RuntimeError(typeof result?.error === 'string' && /^[a-z_]{1,64}$/.test(result.error) ? result.error : 'request_refused', response.status);
  return result;
 }
 lock() { this.token = ''; }
}
