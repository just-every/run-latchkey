import { TypedItems, createItem, createAttachment, importKeeperTemplate } from '../../src/latchkey/items/index.mjs';
import { generatePassword, generatePassphrase, effectivePolicy, GeneratorHistory, generatorHistoryKey } from '../../src/latchkey/generator/index.mjs';
import { totp, parseTotpUri } from '../../src/latchkey/totp/index.mjs';
import { check } from '../../src/latchkey/items/fields.mjs';

// The parent CLI owns unlock, safe file reads/writes and redacted errors. Values
// are only written to its explicitly selected private files, never returned as
// stdout command results. All input comes through the parent's bounded stdin.
export const itemCommands = Object.freeze(['item-save', 'item-history', 'item-restore-preview', 'item-restore', 'item-field', 'item-search', 'item-attachment', 'template-save', 'template-get', 'template-import-keeper', 'generator-policy', 'generate', 'generator-history', 'generator-clear', 'totp', 'totp-import']);
export async function runItemCommand(command, input, { client, readPrivate, writePrivate }) {
 check(itemCommands.includes(command), 'unknown_item_command');
 const items = new TypedItems(client), output = async value => { check(input.output, 'private_output_required'); await writePrivate(input.output, value); return { written: true }; };
 let generator;
 if (['generator-policy', 'generate', 'generator-history', 'generator-clear'].includes(command)) {
  const server = await client.call('generator/policy', {});
  generator = { ...server, policy: effectivePolicy([server.policy, input.policy ?? {}]) };
 }
 switch (command) {
  case 'item-save': {
   const value = input.value?.schema === 'latchkey/item/v1' ? structuredClone(input.value) : createItem(input.type, input.value);
   for (const file of input.attachments ?? []) value.attachments.push(await createAttachment(file.name, new Uint8Array(file.bytes), file.mediaType));
   return items.save(input.vault, value, input.object);
  }
  case 'item-history': return output(await items.history(input.vault, input.object));
  case 'item-restore-preview': return output(await items.previewRestore(input.vault, input.object, input.version));
  case 'item-restore': return items.restore(input.vault, input.object, input.version, { confirmed: input.confirmed === true, expectedVersion: input.expectedVersion });
  case 'item-search': return output(await items.search(input.vault, input.query));
  case 'item-field': return output({ value: await items.field(input.vault, input.object, input.field, input.action) });
  case 'item-attachment': { const file = await items.attachment(input.vault, input.object, input.attachment, input.version); return output({ ...file, data: Array.from(file.data) }); }
  case 'template-save': return items.saveTemplate(input.vault, input.value, input.object);
  case 'template-get': return output(await items.template(input.vault, input.object, input.version));
  case 'template-import-keeper': return items.saveTemplate(input.vault, importKeeperTemplate(input.value), input.object);
  case 'generator-policy': return { ...generator, history: { days: generator.policy.historyDays, encrypted: true, localOnly: true } };
  case 'totp': { const value = await items.field(input.vault, input.object, input.field ?? 'totp', input.action ?? 'copy'); return output(await totp(value)); }
  case 'totp-import': {
   const row = await items.current(input.vault, input.object), value = parseTotpUri(input.uri, input.target), fieldId = input.field ?? 'totp';
   const field = { id: fieldId, label: 'TOTP', type: 'otp', secret: true, value };
   row.value.fields = [...row.value.fields.filter(field => field.id !== fieldId), field];
   return items.save(input.vault, row.value, input.object);
  }
 }
 check(input.history, 'local_history_file_required');
 const key = await generatorHistoryKey(client);
 let exists = true;
 const storage = {
  async read() { try { return await readPrivate(input.history); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; return null; } },
  async write(value) { await writePrivate(input.history, value, exists); exists = true; },
 };
 const history = new GeneratorHistory({ storage, key, tenant: client.profile.tenant, account: client.profile.account, policy: generator.policy }); key.fill(0);
 try {
  if (command === 'generator-history') return output(await history.export());
  if (command === 'generator-clear') { await history.clear(input.entry); return { cleared: true }; }
  check(input.acknowledgedRetentionDays === history.retention().days, 'generator_retention_acknowledgement_required');
  check(input.output, 'private_output_required');
  const generated = input.kind === 'passphrase' ? generatePassphrase({ ...input.options, policy: generator.policy }) : generatePassword({ ...input.options, policy: generator.policy });
  const entry = await history.add(generated);
  await output(generated);
  return { written: true, history: entry, retention: history.retention(), entropyBits: generated.entropyBits };
 } finally { history.lock(); }
}
