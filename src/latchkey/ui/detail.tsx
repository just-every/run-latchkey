import { useEffect, useState } from 'react';
import { copy, download, type Field, type ItemRecord, type Task } from './types';
import { totp } from './runtime.mjs';
import { Icon } from './icon';
import { ItemHistory } from './history';
import { Passkeys } from './passkeys';
import { EraseItem } from './erase';
import { SharingPanel } from '../sharing/ui';

function FieldView({ field, typed, vault, object, run }: { field: Field; typed: any; vault: string; object: string; run: Task }) {
 const [shown, setShown] = useState(false), [value, setValue] = useState<any>(field.secret ? null : field.value), [code, setCode] = useState<any>(null);
 useEffect(() => { if (!code) return; const timer = setTimeout(() => setCode(null), Math.max(0, code.validUntil - Date.now())); return () => clearTimeout(timer); }, [code]);
 const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
 return <div className="field"><label htmlFor={`view-${field.id}`}>{field.label}</label><div className="input-row">
  <input id={`view-${field.id}`} readOnly type={field.secret && !shown ? 'password' : 'text'} value={field.secret && !shown ? '••••••••••••' : text} aria-label={field.label}/>
  {field.secret && <button aria-label={`${shown ? 'Hide' : 'Reveal'} ${field.label}`} onClick={() => { if (shown) { setShown(false); setValue(null); setCode(null); } else void run(async () => { setValue(await typed.field(vault, object, field.id, 'reveal')); setShown(true); }); }}><Icon name="eye"/></button>}
  <button aria-label={`Copy ${field.label}`} onClick={() => void run(async () => copy(await typed.field(vault, object, field.id, 'copy')))}><Icon name="copy"/></button>
 </div>{field.type === 'otp' && <><button className="small" onClick={() => void run(async () => { const value = await typed.field(vault, object, field.id, 'reveal'); setCode(await totp(value)); })}>Show current code</button>{code && <div className="notice"><output>{code.code}</output><p className="muted">Valid until {new Date(code.validUntil).toLocaleTimeString()}. Refresh for a new code.</p><button onClick={() => void run(async () => { const value = await typed.field(vault, object, field.id, 'copy'); const current = await totp(value); setCode(current); await copy(current.code); })}>Copy current code</button></div>}</>}
  {field.type === 'passkey' && shown && <Passkeys value={value} run={run}/>}
 </div>;
}

export function ItemDetail({ row, typed, client, vault, run, onEdit, onRefresh, canErase }: { row: ItemRecord; typed: any; client: any; vault: string; run: Task; onEdit: () => void; onRefresh: () => Promise<void>; canErase: boolean }) {
 const item = row.value;
 // The item opens in place under its row, which already shows its title; the heading names the opened region.
 return <article className="detail" aria-labelledby={`title-${row.object}`}><header className="detail-header"><h2 className="sr-only" id={`title-${row.object}`}>{item.title}</h2><p className="subtitle">{item.type.replaceAll('-', ' ')}{item.favorite ? ' · Favorite' : ''} · {item.ownership}{[...item.labels, ...item.tags.map(tag => `#${tag}`)].map(label => ` · ${label}`).join('')}</p><div className="actions"><button onClick={onEdit}><Icon name="edit"/>Edit</button><button onClick={() => void run(async () => { const fields = []; for (const field of item.fields) fields.push(`${field.label}: ${typeof field.value === 'object' ? JSON.stringify(await typed.field(vault, row.object, field.id, 'copy')) : await typed.field(vault, row.object, field.id, 'copy')}`); await copy(fields.join('\n')); })}><Icon name="copy"/>Copy all</button></div></header>
  <div className="detail-grid"><section className="credentials" aria-label="Item fields">{item.fields.length ? item.fields.map(field => <FieldView key={`${row.version}-${field.id}`} field={field} typed={typed} vault={vault} object={row.object} run={run}/>) : <p className="muted">No fields saved.</p>}</section>
  <div className="detail-side">{!!item.urls.length && <section className="section"><h2>Website and app rules</h2>{item.urls.map((rule, i) => <p className="rule-view" key={i}><span>{rule.match}</span><span>{rule.url ?? rule.appId}</span></p>)}<p className="muted">Copy a field to use it in your browser or app.</p></section>}
  <section className="section attachments"><h2>Attachments</h2>{item.attachments.length ? item.attachments.map(file => <div className="file" key={file.id}><Icon name="file"/><div className="file-text"><span>{file.name}</span><small>{file.size.toLocaleString()} bytes · {file.mediaType}</small></div><button aria-label={`Download ${file.name}`} onClick={() => void run(async () => { const attachment = await typed.attachment(vault, row.object, file.id); download(attachment.name, new Uint8Array(attachment.data) as BlobPart, attachment.mediaType); })}><Icon name="download"/></button></div>) : <p className="muted">No attachments.</p>}<button className="small" onClick={onEdit}><Icon name="plus"/>Add attachment</button></section></div></div>
  <ItemHistory typed={typed} vault={vault} row={row} run={run} onRestored={onRefresh}/>
  {canErase && <EraseItem client={client} vault={vault} row={row} run={run} onErased={onRefresh}/>}
  <section className="section" id="sharing"><details><summary>Sharing</summary><SharingPanel client={client} vault={vault} object={row.object}/></details></section>
 </article>;
}
