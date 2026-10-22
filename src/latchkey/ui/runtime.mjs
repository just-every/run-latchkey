// All plaintext operations stay at the browser boundary.
export { VaultClient } from '../client.mjs';
export * from '../items/index.mjs';
export * from '../generator/index.mjs';
export { totp, parseTotpUri, validateTotp } from '../totp/index.mjs';
export { captureTotp } from '../../../clients/shared/capture/totp.mjs';
export { createPasskey, usePasskey } from '../../../clients/shared/passkeys/platform.mjs';
