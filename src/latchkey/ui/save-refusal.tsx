import { useEffect, useRef } from 'react';
import { itemTypes } from './runtime.mjs';
import { message, type Field, type Item } from './types';

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
 version_conflict: ['Someone saved a newer version of this item while you were editing. Your changes are still here and have not been saved. Copy your edits before reloading to see the latest version.'],
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

// Beside Save item: the refusal, scrolled into view and focused when it appears,
// so a screen reader and a sighted person both meet it where they pressed.
export function SaveProblem({ refusal, onField }: { refusal: Refusal | null; onField: (field: string) => void }) {
 const box = useRef<HTMLDivElement>(null);
 useEffect(() => { if (refusal) { box.current?.scrollIntoView({ block: refusal.code === 'version_conflict' ? 'center' : 'nearest' }); box.current?.focus({ preventScroll: true }); } }, [refusal]);
 if (refusal) return <div className="save-problem" role="alert" tabIndex={-1} ref={box}><p>{refusal.text}</p>
  {refusal.field && <button type="button" className="link" onClick={() => onField(refusal.field!)}>Go to the marked field</button>}</div>;
 return null;
}
