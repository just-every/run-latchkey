import { itemTypes } from './runtime.mjs';
import type { Field, Item } from './types';

// People's words for the built-in item types, fields, field types and website
// rules. A built-in field stores a label made from its id ("Totp",
// "Verification Code"), so it shows the word below instead, with no data
// change; custom and template fields keep the labels their authors gave them.
const types: Record<string, string> = { login: 'Login', 'secure-note': 'Secure note', card: 'Payment card', identity: 'Identity', 'bank-account': 'Bank account', 'ssh-key': 'SSH key', 'api-credential': 'API credential', database: 'Database', server: 'Server', wifi: 'Wi-Fi network', 'software-license': 'Software license', document: 'Document', custom: 'Custom item' };
const fields: Record<string, string> = { username: 'Username', password: 'Password', totp: 'One-time code', passkey: 'Passkey', note: 'Note', cardholder: 'Cardholder name', number: 'Card number', verificationCode: 'Security code', expiry: 'Expiry', pin: 'PIN', name: 'Name', email: 'Email', phone: 'Phone', address: 'Address', governmentId: 'Government ID', bank: 'Bank', accountHolder: 'Account holder', accountNumber: 'Account number', routingNumber: 'Routing number', iban: 'IBAN', swift: 'SWIFT code', publicKey: 'Public key', privateKey: 'Private key', passphrase: 'Passphrase', token: 'Token', endpoint: 'Endpoint', engine: 'Engine', host: 'Host', port: 'Port', database: 'Database name', connectionString: 'Connection string', ssid: 'Network name', security: 'Security', product: 'Product', licensedTo: 'Licensed to', licenseKey: 'License key', description: 'Description' };
// The editor adds these two to any built-in item from its capture flows.
const captured: Record<string, string> = { totp: 'otp', passkey: 'passkey' };
const fieldTypes: Record<string, string> = { text: 'Text', secret: 'Secret', multiline: 'Multiline text', url: 'URL', email: 'Email', number: 'Number', date: 'Date', boolean: 'Yes or no', otp: 'One-time code', passkey: 'Passkey', json: 'JSON' };
const matches: Record<string, string> = { 'registrable-domain': 'Base domain', 'exact-host': 'Exact host', 'starts-with-path': 'Starts with path', 'never-fill': 'Never fill', 'native-app': 'Native app' };
const kinds: Record<string, string> = { company: 'Company vault', 'private-work': 'Private work vault', family: 'Family vault' };
const nouns: Record<string, string> = { 'ssh-key': 'SSH key', 'api-credential': 'API credential', wifi: 'Wi-Fi network', custom: 'item' };

export const typeLabel = (type: string) => types[type] ?? type;
export const fieldTypeLabel = (type: string) => fieldTypes[type] ?? type;
export const matchLabel = (match: string) => matches[match] ?? match;
export const kindLabel = (kind: string | undefined) => kinds[kind ?? ''] ?? 'Vault';
export const vaultLabel = (vault: { id: string; title?: string }) => vault.title ?? `Vault · ${vault.id.slice(0, 8)}`;
export function fieldLabel(item: Pick<Item, 'type' | 'template'>, field: Field) {
 const builtIn = item.type !== 'custom' && !item.template && (itemTypes[item.type]?.some(definition => definition.id === field.id && definition.type === field.type) || captured[field.id] === field.type);
 return builtIn && fields[field.id] || field.label;
}
// "Company login · Favorite · Finance · #quarterly": who owns it, what it is, then its marks.
export function itemSummary(item: Item) {
 const noun = nouns[item.type] ?? typeLabel(item.type).toLowerCase(), template = item.template?.definition?.name;
 return [`${item.ownership === 'personal' ? 'Personal' : 'Company'} ${noun}`, ...(template ? [template] : []), ...(item.favorite ? ['Favorite'] : []), ...item.labels, ...item.tags.map(tag => `#${tag}`)].join(' · ');
}
export const hasValue = (field: Field) => field.value != null && field.value !== '';
