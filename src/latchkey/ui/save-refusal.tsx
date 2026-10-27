import { useEffect, useRef } from 'react';
import { itemTypes } from './runtime.mjs';
import { message, type Field, type Item } from './types';
import { fieldLabel } from './labels';

// A refused save, explained in the editor beside Save item: in words, with the field it is about
// (marked aria-invalid, its own message beside it) where there is one. A refusal that ends the
// session or removes the item stays with the page, which locks or reloads, so it is not caught here.
export type Refusal = { code: string; text: string; note?: string; field?: string };
const pageLevel = ['device_revoked', 'account_key_changed', 'authority_expired', 'locked', 'not_found', 'permission_denied'];
const words: Record<string, [string, string?]> = {
 https_url_required: ['Website rules need an https:// address, such as https://example.com. Correct the marked rule, then save again.', 'Website rules need an https:// address'],
 invalid_app_association: ['App rules need an app ID and its verified association. Fill in the marked rule, then save again.', 'Fill in the app ID and its verified association'],
 invalid_title: ['Give the item a title of up to 500 characters, then save again.', 'Titles need 1 to 500 characters'],
 required_field: ['A required field is empty. Fill in every field marked *, then save again.'],
 invalid_item_metadata: ['Labels and tags take up to 100 entries of up to 200 characters each.'],
 item_too_large: ['This item is over the 1 MB limit. Remove an attachment or shorten a long field, then save again.'],
 version_conflict: ['Someone saved a newer version of this item while you were editing. Your changes are still here and have not been saved.'],
};
const secure = (value: unknown) => { try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };

export function refusalOf(cause: any, item: Item): Refusal | null {
 const code = cause?.code ?? cause?.name;
 if (pageLevel.includes(code) || cause?.status === 401) return null;
 const [text, note] = words[code] ?? [message(cause)];
 const rule = code === 'https_url_required' ? item.urls.findIndex(rule => rule.match !== 'native-app' && !secure(rule.url))
  : code === 'invalid_app_association' ? item.urls.findIndex(rule => rule.match === 'native-app' && !(rule.appId && rule.association)) : -1;
 return { code, text, note, field: rule >= 0 ? `rule-${rule}` : code === 'invalid_title' ? 'title' : undefined };
}

// The props that mark one field as the refused one, pointing at its message.
export const invalid = (refusal: Refusal | null, field: string) => refusal?.field === field ? { 'aria-invalid': true, 'aria-describedby': `problem-${field}` } : {};
export const FieldProblem = ({ refusal, field }: { refusal: Refusal | null; field: string }) => refusal?.field === field && refusal.note ? <p className="field-problem" id={`problem-${field}`}>{refusal.note}</p> : null;

// The item as the editor opens it: every field its type or template defines, filled or not.
export function editable(value: Item) {
 const item = structuredClone(value);
 for (const definition of item.template?.definition.fields ?? itemTypes[item.type] ?? []) if (!item.fields.some((field: Field) => field.id === definition.id)) item.fields.push({ ...definition });
 return item;
}

// The person's edits laid over the latest saved version: what they changed since opening wins, and
// everything they left alone takes the latest value. Names what each side changed (never values).
export function mergeOnLatest(opened: Item, mine: Item, latest: Item) {
 const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
 const yours = new Set<string>(), theirs = new Set<string>(), item: Item = structuredClone(latest);
 for (const [key, name] of [['title', 'Title'], ['labels', 'Labels'], ['tags', 'Tags'], ['favorite', 'Favorite'], ['urls', 'Website and app rules'], ['attachments', 'Attachments']] as const) {
  if (!same(mine[key], opened[key])) { (item as any)[key] = structuredClone(mine[key]); yours.add(name); }
  else if (!same(latest[key], opened[key])) theirs.add(name);
 }
 const find = (list: Field[], id: string) => list.find(field => field.id === id), name = (field: Field) => fieldLabel(latest, field);
 item.fields = [];
 for (const field of latest.fields) {
  const was = find(opened.fields, field.id), now = find(mine.fields, field.id);
  if (was && !now) yours.add(name(field));
  else if (now && !same(now, was)) { item.fields.push(structuredClone(now)); yours.add(name(now)); }
  else { item.fields.push(structuredClone(field)); if (!same(field, was)) theirs.add(name(field)); }
 }
 for (const field of mine.fields) if (!find(latest.fields, field.id)) {
  const was = find(opened.fields, field.id);
  if (!was || !same(field, was)) { item.fields.push(structuredClone(field)); yours.add(name(field)); } else theirs.add(name(field));
 }
 return { item, yours: [...yours], theirs: [...theirs] };
}

// Beside Save item: the refusal (or the merge that answered a conflict), scrolled into view and
// focused when it appears, so a screen reader and a sighted person both meet it where they pressed.
export function SaveProblem({ refusal, merged, busy, onLatest, onField }: { refusal: Refusal | null; merged: { version: number; yours: string[]; theirs: string[] } | null; busy: boolean; onLatest: () => void; onField: (field: string) => void }) {
 const box = useRef<HTMLDivElement>(null);
 useEffect(() => { if (refusal || merged) { box.current?.scrollIntoView({ block: 'nearest' }); box.current?.focus({ preventScroll: true }); } }, [refusal, merged]);
 if (refusal) return <div className="save-problem" role="alert" tabIndex={-1} ref={box}><p>{refusal.text}</p>
  {refusal.code === 'version_conflict' ? <button type="button" disabled={busy} onClick={onLatest}>Load the latest version and keep my changes</button> : refusal.field && <button type="button" className="link" onClick={() => onField(refusal.field!)}>Go to the marked field</button>}</div>;
 if (merged) return <div className="save-problem merged" role="status" tabIndex={-1} ref={box}><p>Loaded version {merged.version}, saved elsewhere. {merged.theirs.length ? `Changed there: ${merged.theirs.join(', ')}. ` : 'Nothing you left alone changed there. '}{merged.yours.length ? `Kept from your edit: ${merged.yours.join(', ')}.` : ''} Check the item, then save.</p></div>;
 return null;
}
