import manifest from '../../../package.json' with { type: 'json' };

// Only public release identifiers and local feature availability enter this file.
// No client instance, profile, storage, request, response or log is accepted.
const errorCodes = new Set(['authentication_failed', 'device_revoked', 'account_key_changed', 'authority_expired', 'locked', 'permission_denied', 'not_found', 'version_conflict', 'restore_conflict', 'service_unavailable', 'request_refused', 'network_unavailable', 'action_cancelled', 'operation_failed']);
export function diagnosticErrorCode(error) {
 if (error == null) return null;
 const code = typeof error === 'string' ? error : error.code;
 if (errorCodes.has(code)) return code;
 if (error.name === 'TypeError') return 'network_unavailable';
 if (['AbortError', 'NotAllowedError'].includes(error.name)) return 'action_cancelled';
 return 'operation_failed';
}
const publicVersion = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value : 'unknown';
export function diagnosticPayload(error = null) {
 const code = diagnosticErrorCode(error);
 return {
  schema: 'latchkey-diagnostics-v1',
  build: { web: publicVersion(manifest.version), foundation: publicVersion(manifest.devDependencies['@runeditrun/rer']) },
  capabilities: {
   secureContext: globalThis.isSecureContext === true,
   webCrypto: typeof globalThis.crypto?.subtle?.decrypt === 'function',
   fileRead: typeof globalThis.File?.prototype?.text === 'function',
   localDownload: typeof globalThis.Blob === 'function' && typeof globalThis.URL?.createObjectURL === 'function',
   clipboardWrite: typeof globalThis.navigator?.clipboard?.writeText === 'function',
   browserOnline: globalThis.navigator?.onLine === true,
  },
  serviceStatus: 'unknown',
  errors: code === null ? [] : [code],
 };
}
export const diagnosticPreview = error => JSON.stringify(diagnosticPayload(error), null, 2) + '\n';
