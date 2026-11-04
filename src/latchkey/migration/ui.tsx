import { useEffect, useRef, useState } from 'react';
import { importMigration, openMigrationPreview } from './plan.mjs';
import { message, type Task } from '../ui/types';

export function MigrationPanel({ client, vaults, vault, run }: { client: any; vaults: any[]; vault: string; run: Task }) {
 const [file, setFile] = useState<File | null>(null), [key, setKey] = useState(''), [review, setReview] = useState<any>(null);
 const [destination, setDestination] = useState(vault), [approvedHash, setApprovedHash] = useState(''), [sourceOwner, setSourceOwner] = useState(''), [confirmed, setConfirmed] = useState(false);
 const [revealed, setRevealed] = useState<string[]>([]);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<any>(null);
 const generation = useRef(0), picker = useRef<HTMLInputElement>(null);
 useEffect(() => () => { generation.current++; }, []);
 const reset = () => { generation.current++; setReview(null); setRevealed([]); setApprovedHash(''); setSourceOwner(''); setConfirmed(false); setResult(null); setError(''); };
 const cancel = () => { reset(); setFile(null); setKey(''); if (picker.current) { picker.current.value = ''; picker.current.focus(); } };
 const perform = async (work: () => Promise<void>) => {
  const ticket = generation.current; setBusy(true); setError(''); setResult(null);
  await run(async () => {
   try { await work(); }
   catch (cause) {
    const failure = (cause as any)?.message === 'cannot_decrypt' ? { code: 'preview_key_or_file_invalid' } : cause;
    if (ticket === generation.current) setError((failure as any)?.code === 'preview_key_or_file_invalid' ? 'The preview key is wrong or the file changed. Use the original key and preview.' : message(failure));
    throw failure;
   }
  });
  if (ticket === generation.current) setBusy(false);
 };
 const blocked = review?.plan.rows.some((row: any) => row.gaps?.length);
 return <section className="detail section migration" aria-labelledby="migration-title">
  <style>{`.lk .migration{font-size:15px;overflow-wrap:anywhere}.lk .migration h1{font-size:28px}.lk .migration .review-table{overflow-x:auto}.lk .migration table{width:100%;font-size:14px;border-collapse:collapse}.lk .migration th,.lk .migration td{text-align:left;padding:10px 8px}.lk .migration .review-row{padding:12px 0}.lk .migration summary{cursor:pointer;font-weight:600}.lk .migration .preview-hash{display:block;user-select:all;word-break:break-all;font-size:14px}.lk .migration .review-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.lk .migration .owner-check{display:flex;align-items:flex-start;gap:10px}.lk .migration .owner-check input{width:auto;min-height:20px;flex:none}.lk .migration textarea[data-masked=true]{-webkit-text-security:disc}.lk .migration .form-grid{margin:18px 0}.lk .migration .review-result{padding:16px 0}`}</style>
  <h1 id="migration-title">Import encrypted preview</h1>
  <p>Review a Bitwarden or LastPass preview prepared by the Latchkey CLI. Source exports and export passwords stay in the CLI. The preview file and its separate key are opened on this device.</p>
  <p>Only your personal items can enter an owner-only family vault. Shared rows stay blocked. This import does not complete a source cutover.</p>
  <form onSubmit={e => { e.preventDefault(); const ticket = generation.current; void perform(async () => {
   if (!file || file.size > 1500000) throw { code: 'invalid_migration_size' };
   const data = new Uint8Array(await file.arrayBuffer());
   try { const opened = await openMigrationPreview(data, key); if (ticket === generation.current) { setReview(opened); setKey(''); } }
   finally { data.fill(0); }
  }); }}>
   <div className="form-grid">
    <label>Encrypted preview file<input ref={picker} type="file" accept=".json,application/json" disabled={busy} required onChange={e => { reset(); setFile(e.target.files?.[0] ?? null); }}/></label>
    {!review && <label>Preview key<input type="password" autoComplete="off" value={key} disabled={busy} required onChange={e => { reset(); setKey(e.target.value); }}/></label>}
   </div>
   {!review && <button className="primary" disabled={busy || !file || !key}>Review preview</button>}
  </form>
  {error && <p role="alert">{error}</p>}
  {review && <>
   <h2>Review before import</h2>
   <p>{review.plan.source === 'bitwarden' ? 'Bitwarden' : 'LastPass'} · {review.plan.sourceOrigin}</p>
   <p>Source owner: <strong>{review.plan.sourceOwner}</strong></p>
   <p>Preview hash <code className="preview-hash">{review.hash}</code></p>
   <p>{review.plan.counts.source} exported rows · {review.plan.counts.ready} ready · {review.plan.counts.duplicate} duplicates · {review.plan.counts.rejected} rejected · {review.plan.folders.length} source folders</p>
   <div className="review-table"><table aria-label="Class reconciliation"><thead><tr><th>Data class</th><th>Exported</th><th>Source total</th></tr></thead><tbody>{review.plan.reconciliation.map((row: any) => <tr key={row.class}><th scope="row">{row.class}</th><td>{row.exported ?? 'Unknown'}</td><td>Unknown</td></tr>)}</tbody></table></div>
   <p>Exported counts describe the file, not a complete source inventory. Zero exported records in a class does not prove that the source had none.</p>
   <h2>Items and discrepancies</h2>
   {review.plan.rows.map((row: any, index: number) => <details className="review-row" key={index}><summary>{row.item?.title ?? row.source} · {row.duplicate ? 'Duplicate' : row.gaps.length ? 'Blocked' : 'Ready'}</summary>
    {!row.duplicate && <><p>Personal ownership · {row.item?.type ?? 'Unsupported item'} · Source identity: {row.source}</p>
     {row.folders.length > 0 && <p>Source folders: {row.folders.map((id: string) => review.plan.folders.find((folder: any) => folder.id === id)?.name ?? id).join(', ')}</p>}
     <div className="form-grid">{row.item?.fields.map((field: any) => {
      const id = `${index}:${field.id}`, visible = revealed.includes(id), value = typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value ?? '');
      return <div key={field.id}><label>{field.label}{field.type === 'multiline' ? <textarea aria-label={field.label} readOnly rows={3} data-masked={field.secret && !visible} value={value}/> : <input aria-label={field.label} readOnly type={field.secret && !visible ? 'password' : 'text'} value={value}/>}</label>{field.secret && <button type="button" onClick={() => setRevealed(previous => visible ? previous.filter(key => key !== id) : [...previous, id])}>{visible ? 'Hide' : 'Reveal'} {field.label} in preview</button>}</div>;
     })}</div>
     {row.item?.urls.map((url: any) => <p key={url.url}>{url.url} · Never fill automatically</p>)}
     {row.gaps.map((gap: string) => <p key={gap}>Blocked: {gap.replaceAll('_', ' ')}. Resolve this in the source and prepare a new CLI preview.</p>)}
    </>}
   </details>)}
   <h2>Unresolved source tasks</h2>
   <ul>{review.plan.tasks.map((task: any) => <li key={task.class}><strong>{task.class}</strong> · {task.state} · Owner: {task.owner}. {task.action}</li>)}</ul>
   <p>Attachments, history, passkeys and permissions are not supplied by this import. Tasks remain unresolved after importing supported personal records.</p>
   <form onSubmit={e => { e.preventDefault(); void perform(async () => { const receipt = await importMigration(client, review.plan, { approvedHash, vault: destination, confirmed, ownership: 'personal', sourceOwner }); setResult(receipt); }); }}>
    <div className="form-grid">
     <label>Destination vault<select aria-label="Destination vault" value={destination} disabled={busy} onChange={e => { setDestination(e.target.value); setConfirmed(false); setResult(null); }}>{vaults.map(row => <option key={row.id} value={row.id}>{row.title ?? row.id} · {row.kind}</option>)}</select></label>
     <label>Confirm preview hash<input autoComplete="off" required value={approvedHash} disabled={busy} onChange={e => { setApprovedHash(e.target.value); setConfirmed(false); setResult(null); }}/></label>
     <label>Confirm personal source owner<input autoComplete="off" required value={sourceOwner} disabled={busy} onChange={e => { setSourceOwner(e.target.value); setConfirmed(false); setResult(null); }}/></label>
    </div>
    <label className="owner-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/>I own these personal source items and approve this exact preview into the selected owner-only family vault.</label>
    <p>Existing batches resume without duplicate items. A changed source that conflicts with a destination correction is refused. Batches are resumable; completed writes survive an interruption.</p>
    {blocked && <p role="status">Resolve blocked rows in the source before import.</p>}
    <div className="review-actions"><button className="primary" disabled={busy || blocked || !confirmed || approvedHash !== review.hash || sourceOwner !== review.plan.sourceOwner}>Import reviewed personal items</button><button type="button" disabled={busy} onClick={cancel}>Cancel preview</button></div>
   </form>
   {result && <p className="review-result" role="status">Imported {result.imported}; unchanged {result.unchanged}; duplicates {result.duplicate}. Cutover incomplete; source tasks remain unresolved.</p>}
  </>}
  {!review && file && <div className="review-actions"><button disabled={busy} onClick={cancel}>Cancel preview</button></div>}
 </section>;
}
