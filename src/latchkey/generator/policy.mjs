import { check } from '../items/fields.mjs';
export const classes = Object.freeze({ lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', symbol: '!@#$%^&*()-_=+[]{};:,.?/' });
export function resolvePolicy(policies = []) {
 const result = { minLength: 16, maxLength: 256, minEntropyBits: 80, requiredClasses: ['lower', 'upper', 'digit', 'symbol'], allowedClasses: Object.keys(classes), historyDays: 30 };
 for (const policy of policies) {
  for (const key of ['minLength', 'minEntropyBits']) if (policy[key] != null) { check(Number.isSafeInteger(policy[key]) && policy[key] > 0, 'invalid_generator_policy'); result[key] = Math.max(result[key], policy[key]); }
  if (policy.maxLength != null) { check(Number.isSafeInteger(policy.maxLength) && policy.maxLength > 0, 'invalid_generator_policy'); result.maxLength = Math.min(result.maxLength, policy.maxLength); }
  if (policy.historyDays != null) { check(Number.isFinite(policy.historyDays) && policy.historyDays >= 0 && policy.historyDays <= 30, 'invalid_generator_policy'); result.historyDays = Math.min(result.historyDays, policy.historyDays); }
  if (policy.allowedClasses) { check(Array.isArray(policy.allowedClasses) && policy.allowedClasses.every(name => Object.hasOwn(classes, name)), 'invalid_generator_policy'); result.allowedClasses = result.allowedClasses.filter(name => policy.allowedClasses.includes(name)); }
  if (policy.requiredClasses) { check(Array.isArray(policy.requiredClasses) && policy.requiredClasses.every(name => Object.hasOwn(classes, name)), 'invalid_generator_policy'); result.requiredClasses = [...new Set([...result.requiredClasses, ...policy.requiredClasses])]; }
 }
 check(result.minLength <= result.maxLength && result.allowedClasses.length && result.requiredClasses.every(name => result.allowedClasses.includes(name)), 'conflicting_generator_policy');
 return result;
}
export function effectivePolicy(policy = {}) { return resolvePolicy(Array.isArray(policy) ? policy : [policy]); }
