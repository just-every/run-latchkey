import { classes, effectivePolicy } from './policy.mjs';
import { uniform, entropy } from './random.mjs';
import { check } from '../items/fields.mjs';
import { effWords } from './eff.mjs';
// Inclusion/exclusion counts every valid suffix exactly. Unranking a uniform
// integer gives a uniform password over policy-compliant strings, without
// forcing characters into predictable positions or weakening its entropy.
function count(length, missing, allowed) {
 let total = 0n;
 for (let subset = 0; subset < 1 << missing.length; subset++) {
  let alphabet = 0, parity = 0;
  for (const name of allowed) { const index = missing.indexOf(name); if (index < 0 || !(subset & 1 << index)) alphabet += classes[name].length; }
  for (let value = subset; value; value &= value - 1) parity++;
  const ways = BigInt(alphabet) ** BigInt(length); total += parity % 2 ? -ways : ways;
 }
 return total;
}
export function generatePassword({ length = 24, policy = {} } = {}) {
 policy = effectivePolicy(policy);
 check(Number.isSafeInteger(length) && length >= policy.minLength && length <= policy.maxLength, 'password_length_policy');
 const possibilities = count(length, policy.requiredClasses, policy.allowedClasses);
 check(possibilities > 0n && entropy(possibilities) >= policy.minEntropyBits, 'password_entropy_policy');
 let rank = uniform(possibilities), missing = [...policy.requiredClasses], value = '';
 for (let remaining = length - 1; remaining >= 0; remaining--) {
  let chosen = false;
  for (const name of policy.allowedClasses) {
   const nextMissing = missing.filter(required => required !== name), suffixes = count(remaining, nextMissing, policy.allowedClasses), block = suffixes * BigInt(classes[name].length);
   if (rank >= block) { rank -= block; continue; }
   value += classes[name][Number(rank / suffixes)]; rank %= suffixes; missing = nextMissing; chosen = true; break;
  }
  check(chosen, 'generator_failed');
 }
 return { value, entropyBits: entropy(possibilities), policy, kind: 'password' };
}
export function generatePassphrase({ words = 7, dictionary = effWords, separator = '-', policy = {} } = {}) {
 policy = effectivePolicy(policy);
 check(Array.isArray(dictionary) && dictionary.length >= 2048 && new Set(dictionary).size === dictionary.length && dictionary.every(word => typeof word === 'string' && /^[a-z]{2,30}$/.test(word)), 'invalid_passphrase_dictionary');
 check(Number.isSafeInteger(words) && words >= 1 && words <= 100 && typeof separator === 'string' && separator.length <= 8, 'invalid_passphrase_options');
 const entropyBits = words * Math.log2(dictionary.length);
 check(entropyBits >= policy.minEntropyBits, 'passphrase_entropy_policy');
 // Password character-class constraints also apply to passphrases. A policy
 // requiring symbols/digits/uppercase cannot be silently relaxed for a phrase.
 check(separator.length > 0 && !/[a-z]/.test(separator), 'ambiguous_passphrase_separator');
 const suffixClasses = policy.requiredClasses.filter(name => name !== 'lower' && ![...separator].some(char => classes[name].includes(char)));
 // Refuse an incompatible length policy before generating. Filtering outputs
 // after generation would condition the distribution and overstate entropy.
 check(words * Math.min(...dictionary.map(word => word.length)) + (words - 1) * separator.length + suffixClasses.length >= policy.minLength && words * Math.max(...dictionary.map(word => word.length)) + (words - 1) * separator.length + suffixClasses.length <= policy.maxLength, 'passphrase_length_policy');
 let value = Array.from({ length: words }, () => dictionary[Number(uniform(BigInt(dictionary.length)))]).join(separator);
 for (const name of policy.requiredClasses) if (![...value].some(char => classes[name].includes(char))) value += classes[name][Number(uniform(BigInt(classes[name].length)))];
 check(value.length >= policy.minLength && value.length <= policy.maxLength, 'passphrase_length_policy');
 for (const name of policy.requiredClasses) check([...value].some(char => classes[name].includes(char)), 'passphrase_character_policy');
 check([...value].every(char => policy.allowedClasses.some(name => classes[name].includes(char)) || separator.includes(char)), 'passphrase_character_policy');
 return { value, entropyBits, policy, kind: 'passphrase' };
}
