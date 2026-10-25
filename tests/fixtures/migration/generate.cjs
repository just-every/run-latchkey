// Regenerate synthetic exports using an externally installed official SDK.
// Usage: node ./tests/fixtures/migration/generate.cjs ABSOLUTE_SDK_PACKAGE_PATH
const { PasswordManagerClient, ManagedSettingsClient, PureCrypto, init_sdk } = require(process.argv[2]);
const fs = require('node:fs');
(async () => {
 init_sdk();
 const client = new PasswordManagerClient({}, null, new ManagedSettingsClient());
 const userKey = PureCrypto.make_user_key_aes256_cbc_hmac(), privateKey = PureCrypto.rsa_generate_keypair();
 try {
  await client.crypto().initialize_user_crypto({ userId: '00000000-0000-4000-8000-000000001600', email: 'synthetic-latchkey-1600@example.test', kdfParams: { pBKDF2: { iterations: 600000 } }, accountCryptographicState: { V1: { private_key: PureCrypto.symmetric_encrypt_bytes(privateKey, userKey) } }, method: { decryptedKey: { decrypted_user_key: Buffer.from(userKey).toString('base64') } } });
  const view = { id: '00000000-0000-4000-8000-000000001601', collectionIds: [], name: 'synthetic-latchkey-1601', notes: 'synthetic-latchkey-1602\n日本語', type: 1, login: { username: 'synthetic-latchkey-1603', password: 'synthetic-latchkey-1604', uris: [{ uri: 'https://synthetic-latchkey.example.test', match: 0 }], totp: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' }, favorite: false, reprompt: 0, organizationUseTotp: false, edit: true, viewPassword: true, creationDate: '2026-01-01T00:00:00Z', revisionDate: '2026-01-01T00:00:00Z', fields: [{ name: 'synthetic-latchkey-1605', value: 'synthetic-latchkey-1606', type: 1 }] };
  const { cipher } = await client.vault().ciphers().encrypt(view);
  for (const [name, format] of [['bitwarden-plain.json', 'Json'], ['bitwarden-portable.json', { EncryptedJson: { password: 'synthetic-latchkey-1607' } }]]) fs.writeFileSync(`${__dirname}/${name}`, await client.exporters().export_vault([], [cipher], format));
 } finally { userKey.fill(0); privateKey.fill(0); client.free(); }
})().catch(() => { console.error('Synthetic fixture generation failed'); process.exitCode = 1; });
