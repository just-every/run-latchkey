import { check } from '../items/fields.mjs';
import { entropy } from './random.mjs';
export const classes = Object.freeze({ lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', symbol: '!@#$%^&*()-_=+[]{};:,.?/' });
// Inclusion and exclusion counts every valid suffix exactly. Unranking a uniform
// integer gives a uniform password over policy-compliant strings, without
// forcing characters into predictable positions or weakening its entropy.
export function passwordCombinations(length, missing, allowed) {
 let total = 0n;
 for (let subset = 0; subset < 1 << missing.length; subset++) {
  let alphabet = 0, parity = 0;
  for (const name of allowed) { const index = missing.indexOf(name); if (index < 0 || !(subset & 1 << index)) alphabet += classes[name].length; }
  for (let value = subset; value; value &= value - 1) parity++;
  const ways = BigInt(alphabet) ** BigInt(length); total += parity % 2 ? -ways : ways;
 }
 return total;
}
export function resolvePolicy(policies = [], { allowConflict = false } = {}) {
 const result = { minLength: 16, maxLength: 256, minEntropyBits: 80, requiredClasses: ['lower', 'upper', 'digit', 'symbol'], allowedClasses: Object.keys(classes), historyDays: 30 };
 for (const policy of policies) {
  for (const key of ['minLength', 'minEntropyBits']) if (policy[key] != null) { check(Number.isSafeInteger(policy[key]) && policy[key] > 0, 'invalid_generator_policy'); result[key] = Math.max(result[key], policy[key]); }
  if (policy.maxLength != null) { check(Number.isSafeInteger(policy.maxLength) && policy.maxLength > 0, 'invalid_generator_policy'); result.maxLength = Math.min(result.maxLength, policy.maxLength); }
  if (policy.historyDays != null) { check(Number.isFinite(policy.historyDays) && policy.historyDays >= 0 && policy.historyDays <= 30, 'invalid_generator_policy'); result.historyDays = Math.min(result.historyDays, policy.historyDays); }
  if (policy.allowedClasses) { check(Array.isArray(policy.allowedClasses) && policy.allowedClasses.every(name => Object.hasOwn(classes, name)), 'invalid_generator_policy'); result.allowedClasses = result.allowedClasses.filter(name => policy.allowedClasses.includes(name)); }
  if (policy.requiredClasses) { check(Array.isArray(policy.requiredClasses) && policy.requiredClasses.every(name => Object.hasOwn(classes, name)), 'invalid_generator_policy'); result.requiredClasses = [...new Set([...result.requiredClasses, ...policy.requiredClasses])]; }
 }
 if (!allowConflict) check(result.minLength <= result.maxLength && result.allowedClasses.length && result.requiredClasses.every(name => result.allowedClasses.includes(name)), 'conflicting_generator_policy');
 return result;
}
export function effectivePolicy(policy = {}) { return resolvePolicy(Array.isArray(policy) ? policy : [policy]); }

export function explainPolicy(sources) {
 const policy = resolvePolicy(sources.map(source => source.policy), { allowConflict: true });
 const reasons = [];
 if (policy.minLength > policy.maxLength) reasons.push(`Minimum length ${policy.minLength} exceeds maximum length ${policy.maxLength}.`);
 const excluded = policy.requiredClasses.filter(name => !policy.allowedClasses.includes(name));
 if (excluded.length) reasons.push(`Required character classes are prohibited: ${excluded.join(', ')}.`);
 if (!policy.allowedClasses.length) reasons.push('No character class is allowed.');
 if (!reasons.length) {
  const maximumEntropy = entropy(passwordCombinations(policy.maxLength, policy.requiredClasses, policy.allowedClasses));
  if (maximumEntropy < policy.minEntropyBits) reasons.push(`Minimum entropy ${policy.minEntropyBits} bits exceeds the ${Math.floor(maximumEntropy)} bits available within maximum length ${policy.maxLength}.`);
 }
 return { policy, sources, conflicts: reasons.map(reason => ({ code: 'conflicting_generator_policy', reason, sources: sources.map(({ policy, ...source }) => source) })) };
}
