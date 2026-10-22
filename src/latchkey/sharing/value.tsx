import { useState } from 'react';
import { attachmentBytes, validateItem } from '../ui/runtime.mjs';
import { download } from '../ui/types';

const label = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());
const isRecord = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const website = (value: string) => {
 try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
 catch { return undefined; }
};

function ReadableValue({ value, link = false }: { value: any; link?: boolean }) {
 if (value == null || value === '') return <span className="muted">Not provided</span>;
 if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
 if (typeof value === 'string') {
  const href = link ? website(value) : undefined;
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{value}</a> : <span>{value}</span>;
 }
 if (typeof value === 'number') return <span>{value}</span>;
 if (Array.isArray(value)) return value.length ? <ul>{value.map((entry, i) => <li key={i}><ReadableValue value={entry}/></li>)}</ul> : <span className="muted">None</span>;
 return <dl>{Object.entries(value).map(([key, entry]) => <div key={key}><dt>{label(key)}</dt><dd><ReadableValue value={entry}/></dd></div>)}</dl>;
}

export async function downloadSharedAttachment(file: any) {
 if (typeof file?.name !== 'string' || !file.name || /[\x00-\x1f]/.test(file.name)) throw new Error('Invalid attachment');
 const bytes = await attachmentBytes(file);
 download(file.name.replace(/[/\\]/g, '_'), new Uint8Array(bytes) as BlobPart, 'application/octet-stream');
}

export function SharedAttachments({ attachments }: { attachments: any[] }) {
 const [busy, setBusy] = useState<number | null>(null), [error, setError] = useState('');
 if (!attachments.length) return null;
 return <div className="shared-attachments" style={{ minWidth: 0, overflowWrap: 'anywhere' }}><h3>Attachments</h3><ul>{attachments.map((file, i) => <li key={i}>
  <span>{typeof file?.name === 'string' ? file.name : 'Unnamed attachment'}</span>{' '}
  <button style={{ maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere' }} disabled={busy !== null} onClick={() => {
   setBusy(i); setError('');
   void downloadSharedAttachment(file).catch(() => setError('This attachment could not be downloaded. Its contents could not be verified.')).finally(() => setBusy(null));
  }}>{busy === i ? 'Preparing download…' : `Download ${typeof file?.name === 'string' ? file.name : 'attachment'}`}</button>
 </li>)}</ul>{error && <p role="alert">{error}</p>}</div>;
}

export function SharedValue({ value }: { value: any }) {
 let item: ReturnType<typeof validateItem> | undefined;
 if (value?.schema === 'latchkey/item/v1') {
  try { item = validateItem(value, value.template?.definition); } catch { /* Preserve the original for an explicit download below. */ }
 }
 const legacyKeys = ['title', 'type', 'value', 'secret', 'attachments'];
 const legacy = isRecord(value) && !value.schema && Object.keys(value).every(key => legacyKeys.includes(key)) &&
  (!value.type || value.type === 'note') && (Object.hasOwn(value, 'value') || Object.hasOwn(value, 'secret')) &&
  (!value.attachments || Array.isArray(value.attachments));
 const supported = !!item || legacy || value === null || ['string', 'number', 'boolean'].includes(typeof value);
 const fields = item?.fields ?? (legacy ? ['value', 'secret'].filter(key => Object.hasOwn(value, key)).map(key => ({ id: key, label: key === 'value' ? 'Content' : 'Secret', type: 'text', value: value[key] })) : []);
 const title = item?.title ?? (legacy && typeof value.title === 'string' ? value.title : '');
 const attachments = item?.attachments ?? (legacy ? value.attachments ?? [] : []);
 return <div className="shared-value"><style>{`.shared-value{min-width:0;overflow-wrap:anywhere}.shared-value h3{margin:1.25rem 0 .75rem}.shared-value dl{margin:0}.shared-value dl>div{padding:.75rem 0;border-bottom:1px solid color-mix(in srgb,var(--rer-text,#000) 11%,var(--rer-page,#fff))}.shared-value dt{font-weight:600;margin-bottom:.35rem}.shared-value dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.shared-value dd dl{padding-left:1rem}.shared-value ul{padding-left:1.25rem}.shared-value li{margin:.5rem 0}.shared-value a{overflow-wrap:anywhere}.shared-value button{max-width:100%;white-space:normal;overflow-wrap:anywhere}`}</style>
  {title && <h3>{title}</h3>}
  {supported ? <>
   {fields.length ? <dl>{fields.map(field => <div key={field.id}><dt>{field.label}</dt><dd><ReadableValue value={field.value} link={field.type === 'url'}/></dd></div>)}</dl> : item ? <p>No fields saved.</p> : <ReadableValue value={value}/>}
   {item && !!(item.labels.length || item.tags.length) && <p>{[...item.labels, ...item.tags.map(tag => `#${tag}`)].join(' · ')}</p>}
   {!!item?.urls.length && <div><h3>Websites and apps</h3><ul>{item.urls.map((rule, i) => <li key={i}>{rule.match === 'native-app' ? rule.appId : <ReadableValue value={rule.url} link/>}</li>)}</ul></div>}
   <SharedAttachments attachments={attachments}/>
  </> : <><p>This item’s format is not supported for display. Download the original content to open it with a compatible application.</p><button onClick={() => download('shared-item.json', JSON.stringify(value, null, 2))}>Download original JSON</button></>}
 </div>;
}
