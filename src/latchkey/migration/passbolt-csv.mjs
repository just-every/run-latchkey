import Papa from 'papaparse';
import { check } from '../items/fields.mjs';

// Passbolt's documented KeePass CSV export. Its missing expiry and stable source
// IDs must be reconciled from separately authorized resource metadata.
export function readPassboltCsv(data) {
 let csv; try { csv = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { check(false, 'invalid_csv_encoding'); }
 const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
 const headers = ['Title', 'Username', 'URL', 'Password', 'Notes', 'Group', 'TOTP'];
 check(parsed.errors.length === 0 && !Object.keys(parsed.meta.renamedHeaders ?? {}).length && parsed.meta.fields?.length === headers.length && headers.every(key => parsed.meta.fields.includes(key)), 'invalid_passbolt_csv');
 check(parsed.data.length <= 1000, 'migration_item_limit');
 return { groups: [{ name: 'Passbolt CSV', groups: [], entries: parsed.data.map((row, index) => ({
  uuid: { toString: () => `csv-row-${index + 1}` },
  fields: new Map([['Title', row.Title], ['UserName', row.Username], ['URL', row.URL], ['Password', row.Password], ['Notes', row.Notes], ['otp', row.TOTP]]),
  sourceFolder: row.Group, binaries: new Map(), history: [], times: {},
 })) }] };
}
