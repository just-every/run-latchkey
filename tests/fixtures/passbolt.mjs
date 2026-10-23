import kdbx from 'kdbxweb';
import Papa from 'papaparse';

// Source-format fixture produced by the codec Passbolt's exporter uses. This
// is synthetic documented-format proof, never a live Passbolt receipt.
export async function passboltFixture({ withKeyfile = false, keyfileOnly = false } = {}) {
 const passphrase = keyfileOnly ? null : 'synthetic-latchkey-1400';
 const sourceUser = '00000000-0000-4000-8000-000000001401';
 const keyfile = withKeyfile || keyfileOnly ? await kdbx.Credentials.createRandomKeyFile() : undefined;
 const db = kdbx.Kdbx.create(new kdbx.Credentials(passphrase ? kdbx.ProtectedValue.fromString(passphrase) : null, keyfile), 'passbolt export');
 db.setVersion(3);
 const folder = db.createGroup(db.getDefaultGroup(), 'synthetic-latchkey-1402');
 const entries = [], resources = [], mapping = [];
 for (let index = 0; index < 2; index++) {
  const entry = db.createEntry(folder), resource = `00000000-0000-4000-8000-00000000140${3 + index}`;
  entry.fields.set('Title', `synthetic-latchkey-${1410 + index}`);
  entry.fields.set('UserName', `synthetic-latchkey-${1420 + index}`);
  entry.fields.set('Password', kdbx.ProtectedValue.fromString(`synthetic-latchkey-${1430 + index}`));
  entry.fields.set('Notes', `synthetic-latchkey-${1440 + index}\nsecond line`);
  entry.fields.set('URL', 'https://synthetic-latchkey.example.test');
  entry.times.expires = true; entry.times.expiryTime = new Date('2030-01-02T00:00:00Z');
  if (index === 0) {
   entry.fields.set('TimeOtp-Secret-Base32', kdbx.ProtectedValue.fromString('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'));
   entry.fields.set('TimeOtp-Algorithm', 'HMAC-SHA-1'); entry.fields.set('TimeOtp-Length', '8'); entry.fields.set('TimeOtp-Period', '30');
  } else entry.fields.set('otp', kdbx.ProtectedValue.fromString('otpauth://totp/synthetic-latchkey:synthetic-latchkey-1421?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=synthetic-latchkey&digits=8'));
  entries.push(entry.uuid.toString()); mapping.push({ entry: entry.uuid.toString(), resource });
  resources.push({ id: resource, name: `synthetic-latchkey-${1410 + index}`, username: `synthetic-latchkey-${1420 + index}`, description: `synthetic-latchkey-${1450 + index}`, expired: '2030-01-02T00:00:00Z', permissions: [{ aro: index ? 'Group' : 'User', aro_foreign_key: sourceUser, aco_foreign_key: resource, type: 15 }], tags: [{ slug: 'synthetic-latchkey-1460' }], gpgkey: { private: 'synthetic-latchkey-1470' }, recoveryKit: 'synthetic-latchkey-1471' });
 }
 return { data: new Uint8Array(await db.save()), keyfile, passphrase, entries, metadata: { body: resources }, mapping, sourceOrigin: 'https://passbolt.example.test', sourceUser };
}

export async function passboltCsvFixture() {
 const fixture = await passboltFixture();
 const rows = fixture.metadata.body.map((resource, index) => ({ Title: resource.name, Username: resource.username, URL: 'https://synthetic-latchkey.example.test', Password: `synthetic-latchkey-${1430 + index}`, Notes: `synthetic-latchkey-${1440 + index}\nsecond line, with "quotes"`, Group: 'synthetic-latchkey-1402', TOTP: 'otpauth://totp/synthetic-latchkey:synthetic-latchkey-1421?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=synthetic-latchkey&digits=8' }));
 return { ...fixture, data: new TextEncoder().encode(Papa.unparse(rows, { quotes: true, columns: ['Title', 'Username', 'URL', 'Password', 'Notes', 'Group', 'TOTP'] })), format: 'csv-kdbx', mapping: fixture.mapping.map((row, index) => ({ ...row, entry: `csv-row-${index + 1}` })) };
}
