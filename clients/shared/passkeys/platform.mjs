import { encode, decode } from '../../../src/latchkey/crypto/envelope.mjs';
import { check } from '../../../src/latchkey/items/fields.mjs';
const raw = value => typeof value === 'string' ? decode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
const encoded = value => value == null ? null : encode(new Uint8Array(value));
function relyingParty(rpId) {
 check(globalThis.isSecureContext && navigator.credentials && typeof PublicKeyCredential === 'function', 'webauthn_unavailable');
 // This helper deliberately requires an exact relying party host. Broader
 // parent-domain enrollment belongs to a reviewed per-item RP association.
 check(rpId === location.hostname, 'passkey_rp_mismatch');
}
function challengeBytes(challenge) { const value = raw(challenge); check(value.length >= 32 && value.length <= 1024, 'invalid_passkey_challenge'); return value; }
export function serializeCredential(credential) {
 check(credential?.type === 'public-key', 'passkey_cancelled');
 const response = credential.response;
 const result = { id: credential.id, rawId: encoded(credential.rawId), type: credential.type, authenticatorAttachment: credential.authenticatorAttachment, clientExtensionResults: credential.getClientExtensionResults(), response: { clientDataJSON: encoded(response.clientDataJSON) } };
 for (const key of ['attestationObject', 'authenticatorData', 'signature', 'userHandle']) if (response[key] != null) result.response[key] = encoded(response[key]);
 if (typeof response.getTransports === 'function') result.response.transports = response.getTransports();
 if (typeof response.getPublicKey === 'function') result.response.publicKey = encoded(response.getPublicKey());
 if (typeof response.getPublicKeyAlgorithm === 'function') result.response.publicKeyAlgorithm = response.getPublicKeyAlgorithm();
 return result;
}
export async function createPasskey({ rp, user, challenge, excludeCredentials = [], signal }) {
 relyingParty(rp?.id);
 check(user && typeof user.name === 'string' && user.name && typeof user.displayName === 'string', 'invalid_passkey_user');
 const userId = raw(user.id); check(userId.length > 0 && userId.length <= 64, 'invalid_passkey_user');
 const credential = await navigator.credentials.create({ publicKey: {
  rp, user: { ...user, id: userId }, challenge: challengeBytes(challenge), timeout: 60000,
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
  authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
  attestation: 'none', excludeCredentials: excludeCredentials.map(value => ({ type: 'public-key', id: raw(value.credentialId), transports: value.transports })),
 }, signal });
 const registration = serializeCredential(credential);
 return { registration, field: { credentialId: registration.rawId, rpId: rp.id, userHandle: encode(userId), account: user.name, transports: registration.response.transports ?? [], custody: 'platform', privateMaterial: 'non-exportable' } };
}
export async function usePasskey({ passkey, challenge, signal }) {
 relyingParty(passkey?.rpId);
 check(typeof passkey.credentialId === 'string' && passkey.credentialId, 'invalid_passkey');
 const credential = await navigator.credentials.get({ publicKey: {
  rpId: passkey.rpId, challenge: challengeBytes(challenge), timeout: 60000, userVerification: 'required',
  allowCredentials: [{ type: 'public-key', id: raw(passkey.credentialId), transports: passkey.transports }],
 }, signal });
 const assertion = serializeCredential(credential);
 check(assertion.rawId === passkey.credentialId, 'passkey_credential_mismatch');
 // The relying party must verify this assertion and its one-time challenge.
 // A successful local ceremony alone is not a provider sign-in receipt.
 return assertion;
}
