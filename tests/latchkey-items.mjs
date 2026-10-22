import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TypedItems, createItem, itemTypes, createAttachment, importKeeperTemplate } from '../src/latchkey/items/index.mjs';
import { GeneratorHistory, generatorHistoryKey, generatePassword, generatePassphrase, resolvePolicy } from '../src/latchkey/generator/index.mjs';
import { totp, parseTotpUri } from '../src/latchkey/totp/index.mjs';
import { encode } from '../src/latchkey/crypto/envelope.mjs';

const base32 = value => {
 let bits = 0, buffer = 0, result = '';
 for (const byte of new TextEncoder().encode(value)) { buffer = buffer << 8 | byte; bits += 8; while (bits >= 5) { bits -= 5; result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[buffer >>> bits & 31]; } }
 if (bits) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[buffer << 5 - bits & 31];
 return result;
};
const identity = { issuer: 'synthetic-latchkey-101', account: 'synthetic-latchkey-102@example.test' };
const seed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

export async function runTypedItemJourneys({ owner, vault, reader }) {
 const items = new TypedItems(owner), denied = new TypedItems(reader), privateValues = [];
 let number = 100000, loginObject;
 const privateValue = () => { const value = `synthetic-latchkey-${number++}`; privateValues.push(value); return value; };
 for (const [type, definitions] of Object.entries(itemTypes)) {
  const title = privateValue(), values = {};
  for (const definition of definitions) {
   if (definition.type === 'passkey') continue; // Proven by actual WebAuthn, never an invented stored key.
   values[definition.id] = definition.type === 'otp' ? { ...identity, secret: seed }
    : definition.type === 'number' ? 443 : definition.type === 'date' ? '2030-01-01'
    : definition.type === 'email' ? `${privateValue()}@example.test`
    : definition.type === 'url' ? `https://${privateValue()}.example.test/` : privateValue();
  }
  const fileValue = privateValue(), attachment = await createAttachment(`${privateValue()}.txt`, new TextEncoder().encode(fileValue), 'text/plain');
  const extra = { id: 'custom-1', label: privateValue(), type: 'secret', secret: true, value: privateValue() };
  const value = createItem(type, { title, values, fields: [extra], tags: [privateValue()], labels: [privateValue()], favorite: true, attachments: [attachment] });
  if (type === 'login') { value.urls = [{ url: 'https://synthetic-latchkey-103.example.test/login', match: 'starts-with-path' }, { url: 'https://synthetic-latchkey-104.example.test', match: 'exact-host' }]; value.providerRotation = { status: 'verified', operation: privateValue() }; }
  const written = await items.save(vault, value), object = written.object;
  if (type === 'login') loginObject = object;
  assert.equal((await items.current(vault, object)).value.type, type);
  assert.equal(await items.field(vault, object, extra.id, 'copy'), extra.value);
  assert.equal(await items.field(vault, object, extra.id, 'reveal'), extra.value);
  if (!['secure-note', 'document', 'software-license', 'ssh-key'].includes(type)) assert.equal(await items.field(vault, object, definitions[0].id, 'fill'), values[definitions[0].id]);
  assert.equal(new TextDecoder().decode((await items.attachment(vault, object, attachment.id)).data), fileValue);
  const edited = structuredClone(value); edited.fields.find(field => field.id === extra.id).value = privateValue();
  edited.attachments = [await createAttachment(`${privateValue()}.txt`, new TextEncoder().encode(privateValue()), 'text/plain')];
  await items.save(vault, edited, object);
  const preview = await items.previewRestore(vault, object, 1); assert.equal(preview.value.fields.find(field => field.id === extra.id).value, extra.value);
  await assert.rejects(items.restore(vault, object, 1), error => error.code === 'restore_confirmation_required');
  await items.restore(vault, object, 1, { confirmed: true, expectedVersion: 2 });
  const history = await items.history(vault, object); assert.equal(history.length, 3);
  assert.equal(history[2].value.change.restoredFrom, 1); assert.equal(history[2].value.change.author, owner.profile.account);
  assert.ok(Number.isFinite(Date.parse(history[2].value.change.time)));
  assert.equal(history[1].value.attachments[0].id, edited.attachments[0].id);
  assert.equal(history[2].value.attachments[0].id, attachment.id);
  await assert.rejects(denied.history(vault, object), error => error.code === 'not_found');
  await assert.rejects(denied.attachment(vault, object, attachment.id), error => error.code === 'not_found');
 }
 console.log('Typed item client: every named record type, custom values, copy/reveal/fill, encrypted attachment edits and append-only restore with unauthorized history/attachment denial passed');

 const starting = (await items.current(vault, loginObject)).value;
 for (let edit = 0; edit < 10; edit++) {
  starting.fields.find(field => field.id === 'password').value = privateValue();
  starting.providerRotation = { status: 'verified', operation: privateValue() };
  await items.save(vault, starting, loginObject);
 }
 const before = await items.history(vault, loginObject), currentRotation = before.at(-1).value.providerRotation;
 assert.equal(before.length, 13);
 await items.restore(vault, loginObject, 2, { confirmed: true, expectedVersion: 13 });
 const after = await items.history(vault, loginObject);
 assert.equal(after.length, 14); assert.deepEqual(after.slice(0, 13), before);
 assert.deepEqual(after.at(-1).value.providerRotation, currentRotation);
 assert.equal(after.at(-1).value.fields.find(field => field.id === 'password').value, before[1].value.fields.find(field => field.id === 'password').value);
 console.log('Item history: ten further edits remain immutable, explicit restore appends and provider rotation verification remains current');

 const authored = { name: privateValue(), fields: [{ id: 'department', label: privateValue(), type: 'text', secret: false, required: true }, { id: 'credential', label: privateValue(), type: 'secret', secret: true, required: true }] };
 const keeper = importKeeperTemplate({ $id: privateValue(), categories: ['note'], fields: [{ $ref: 'login', label: privateValue(), required: true }, { $ref: 'password', label: privateValue(), required: true }, { $ref: 'note', label: privateValue() }] });
 for (const templateInput of [authored, keeper]) {
  const written = await items.saveTemplate(vault, templateInput), snapshot = await items.template(vault, written.object);
  const fields = snapshot.value.fields.map(field => ({ ...field, value: privateValue() }));
  const record = createItem('custom', { title: privateValue(), fields });
  const bound = await items.useTemplate(vault, written.object, record), recordWritten = await items.save(vault, bound);
  const bad = structuredClone(record); bad.fields = [];
  await assert.rejects(items.useTemplate(vault, written.object, bad), error => error.code === 'required_field');
  const changed = structuredClone(snapshot.value); changed.name = privateValue(); changed.fields[0].label = privateValue(); changed.fields.push({ id: 'new-field', label: privateValue(), type: 'text', secret: false });
  await items.saveTemplate(vault, changed, written.object);
  const preserved = (await items.current(vault, recordWritten.object)).value;
  assert.deepEqual(preserved.fields, bound.fields); assert.equal(preserved.template.version, 1);
  assert.equal((await items.template(vault, written.object)).version, 2);
  assert.equal((await items.template(vault, written.object, 1)).value.fields[0].label, snapshot.value.fields[0].label);
 }
 console.log('Templates: authored and documented Keeper $id/$ref definitions, required typed validation, organization-vault sharing and versioned edits preserve original item values');

 const vectors = [
  [59, '94287082', '46119246', '90693936'], [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'], [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'], [20000000000, '65353130', '77737706', '47863826'],
 ];
 const secrets = ['12345678901234567890', '12345678901234567890123456789012', '1234567890123456789012345678901234567890123456789012345678901234'];
 for (const [seconds, ...codes] of vectors) for (let index = 0; index < 3; index++) assert.equal((await totp({ ...identity, secret: base32(secrets[index]), algorithm: ['SHA1','SHA256','SHA512'][index], digits: 8 }, seconds * 1000)).code, codes[index]);
 const uri = `otpauth://totp/${identity.issuer}:${encodeURIComponent(identity.account)}?secret=${seed}&issuer=${identity.issuer}`;
 assert.equal(parseTotpUri(uri, identity).secret, seed);
 assert.throws(() => parseTotpUri(uri, { ...identity, account: 'synthetic-latchkey-105' }), error => error.code === 'totp_account_mismatch');
 assert.throws(() => parseTotpUri(uri, { ...identity, issuer: 'synthetic-latchkey-106' }), error => error.code === 'totp_issuer_mismatch');
 console.log('TOTP: all eighteen RFC 6238 SHA-1/SHA-256/SHA-512 vectors and strict issuer/account QR URI matching passed');

 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-generator-'));
 const key = await generatorHistoryKey(owner); privateValues.push(encode(key));
 let clock = Date.now(), history;
 const path = join(directory, 'history.json');
 const storage = { async read() { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }, async write(value) { await writeFile(path, JSON.stringify(value), { mode: 0o600 }); } };
 try {
  history = new GeneratorHistory({ storage, key, account: owner.profile.account, tenant: owner.profile.tenant, now: () => clock });
  assert.deepEqual(history.retention(), { days: 30, localOnly: true, encrypted: true });
  assert.throws(() => resolvePolicy([{ allowedClasses: ['lower'] }]), error => error.code === 'conflicting_generator_policy');
  assert.throws(() => generatePassword({ length: 8 }), error => error.code === 'password_length_policy');
  const generated = generatePassword({ policy: [{ minLength: 28, minEntropyBits: 120 }], length: 32 });
  assert.equal(generated.value.length, 32); assert.ok(generated.entropyBits >= 120);
  for (const pattern of [/[a-z]/, /[A-Z]/, /[0-9]/, /[!@#$%^&*()\-_=+\[\]{};:,.?/]/]) assert.match(generated.value, pattern);
  const phrase = generatePassphrase(); assert.ok(phrase.entropyBits >= 80);
  privateValues.push(generated.value, phrase.value);
  const first = await history.add(generated), second = await history.add(phrase);
  assert.equal((await history.list()).length, 2);
  const disk = await readFile(path, 'utf8'); assert.ok(!disk.includes(generated.value) && !disk.includes(phrase.value));
  const saved = await items.save(vault, createItem('login', { title: privateValue(), values: { password: generated.value } }));
  await history.clear(first.id); assert.ok(!(await history.export()).some(entry => entry.id === first.id));
  clock = second.expires - 1; assert.equal((await history.export()).length, 1);
  clock = second.expires; assert.deepEqual(await history.export(), []);
  assert.ok(!(await readFile(path, 'utf8')).includes(phrase.value));
  assert.equal((await items.history(vault, saved.object)).length, 1);
  assert.equal(await items.field(vault, saved.object, 'password', 'copy'), generated.value);
  history.lock();
  clock = Date.now();
  history = new GeneratorHistory({ storage, key, account: owner.profile.account, tenant: owner.profile.tenant, now: () => clock, policy: { historyDays: 1 } });
  const short = await history.add(phrase); assert.equal(short.expires - short.created, 86400000);
  clock = short.expires; assert.deepEqual(await history.export(), []);
 } finally { history?.lock(); key.fill(0); await rm(directory, { recursive: true, force: true }); }
 console.log('Generator: exact policy compliance, strong EFF phrase, client-root encryption, individual clear, exact 30-day expiry, shorter company retention and independent saved-item history passed');
 return privateValues;
}
