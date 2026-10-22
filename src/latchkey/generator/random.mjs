import { check } from '../items/fields.mjs';
export function uniform(limit) {
 check(typeof limit === 'bigint' && limit > 0n, 'invalid_random_range');
 const bits = (limit - 1n).toString(2).length, size = Math.ceil(bits / 8), mask = 255 >>> (size * 8 - bits);
 for (;;) {
  const bytes = crypto.getRandomValues(new Uint8Array(size)); bytes[0] &= mask;
  let value = 0n; for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  if (value < limit) return value;
 }
}
export const entropy = count => { const bits = count.toString(2).length; return Math.log2(Number(count >> BigInt(Math.max(0, bits - 52)))) + Math.max(0, bits - 52); };
