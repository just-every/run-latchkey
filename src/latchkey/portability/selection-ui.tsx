import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectionExportClient } from './selection.mjs';
import { decode, encode, random } from '../crypto/envelope.mjs';
import { download, message } from '../ui/types';
import { kindLabel, vaultLabel } from '../ui/labels';

type Scope = { vault: string; objects: string[] | null };
type Choice = { id: string; title: string; owner: string; kind: string };

// Files and keys stay in this unlocked component, never in browser storage.
export function SelectionPanel({ client, vaults, onImported }: { client: any; vaults: Choice[]; onImported: () => Promise<void> }) {
 const api = useMemo(() => new SelectionExportClient(client), [client]);
 const [mode, setMode] = useState('export'), [scope, setScope] = useState<Scope[]>([]), [items, setItems] = useState<Record<string, any[]>>({});
 const [purpose, setPurpose] = useState('Migration'), [target, setTarget] = useState('Buyer-held private file');
 const [key, setKey] = useState(''), [retained, setRetained] = useState(false), [approved, setApproved] = useState(false);
 const [preview, setPreview] = useState<any>(null), [archive, setArchive] = useState<any>(null), [result, setResult] = useState<any>(null);
 const [busy, setBusy] = useState(false), [releasing, setReleasing] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
 const active = useRef(true), releaseSignal = useRef(new AbortController());
 useEffect(() => { active.current = true; releaseSignal.current = new AbortController(); return () => { active.current = false; releaseSignal.current.abort(); }; }, []);
 const invalidate = () => { setPreview(null); setApproved(false); setResult(null); setError(''); setStatus(''); };
 const clear = () => { invalidate(); setScope([]); setItems({}); setKey(''); setRetained(false); setArchive(null); setPurpose('Migration'); setTarget('Buyer-held private file'); };
 const run = async (work: () => Promise<void>) => {
  setBusy(true); setError(''); setStatus('');
  try { await work(); } catch (cause) {
   if (!active.current) return;
   setPreview(null); setApproved(false); setResult(null);
   const code = (cause as any)?.code;
   if (['device_revoked', 'authority_expired', 'account_key_changed', 'permission_denied', 'not_found', 'review_owner_required', 'selected_export_unverified', 'export_cancelled'].includes(code) || (cause as any)?.status === 401) clear();
   setError(explain(cause));
  } finally { if (active.current) setBusy(false); }
 };
 const cancel = () => { releaseSignal.current.abort(); releaseSignal.current = new AbortController(); clear(); setStatus(releasing ? 'Selection cleared. No download will start from this review. A release check may already have been recorded; saving and delivery are unverified.' : 'Selection cleared. Clearing a review does not release an export or start an import.'); };
 const pickVault = async (vault: string, chosen: boolean) => {
  invalidate();
  if (!chosen) { setScope(rows => rows.filter(row => row.vault !== vault)); return; }
  setScope(rows => [...rows, { vault, objects: null }]);
  let values;
  try { values = (await client.readVault(vault)).versions; } catch (cause) { if (active.current) setScope(rows => rows.filter(row => row.vault !== vault)); throw cause; }
  const latest = new Map<string, any>();
  for (const row of values) if (!latest.has(row.object) || latest.get(row.object).version < row.version) latest.set(row.object, row);
  // Retain only labels for selection. No secret fields enter the form state.
  if (active.current) { setItems(rows => ({ ...rows, [vault]: [...latest.values()].map(row => ({ object: row.object, title: row.value.title ?? 'Untitled record' })) })); }
 };
 const loadKey = (file?: File) => { if (file) void run(async () => {
  setKey(''); setRetained(false);
  if (file.size > 100) throw { code: 'invalid_key' };
  const value = (await file.text()).trim(), bytes = decode(value, 32);
  try { if (bytes.length !== 32) throw { code: 'invalid_key' }; if (active.current) setKey(value); } finally { bytes.fill(0); }
 }); };
 const loadArchive = (file?: File) => { invalidate(); setArchive(null); if (file) void run(async () => {
  // JSON envelope overhead fits here; the existing one-megabyte codec still applies.
  if (file.size > 2 * 1024 * 1024) throw { code: 'selected_export_size_limit' };
  const value = JSON.parse(await file.text());
  if (value?.schema !== 1 || value?.context?.purpose !== 'selected-export') throw { code: 'encrypted_selection_required' };
  if (active.current) setArchive(value);
 }); };
 const release = async () => {
  setReleasing(true);
  const signal = releaseSignal.current.signal;
  try {
  const value = await api.export(preview, key, { confirmed: approved, approvedPlanHash: preview.planHash, signal });
  if (!active.current || signal.aborted) return;
  setReleasing(false);
  let outcome = 'browser_download_failed';
  try { download('latchkey-selection.json', JSON.stringify(value)); outcome = 'browser_download_initiated'; }
  catch { throw { code: 'browser_download_failed' }; }
  finally {
   try { await api.reportOutcome(outcome); }
   catch { if (active.current) setError('The browser outcome could not be recorded. Delivery is unverified.'); }
  }
  if (active.current) { setPreview(null); setApproved(false); setKey(''); setRetained(false); setStatus('Browser download initiated. Saving, delivery and external-copy custody are unverified. Keep the separately retained key.'); }
  } finally { if (active.current) setReleasing(false); }
 };
 return <section className="detail section selection-panel" aria-label="Export and import">
  <style>{`.lk .selection-panel{max-width:900px}.lk .selection-panel fieldset{border:1px solid var(--rule);border-radius:var(--corner);padding:16px;margin:18px 0;min-width:0}.lk .selection-panel legend{font-weight:600;padding:0 6px}.lk .selection-panel code{overflow-wrap:anywhere;white-space:normal;font-size:13px}.lk .selection-panel li{overflow-wrap:anywhere}.lk .selection-panel .selection-review{margin:24px 0;padding:20px;border:1px solid var(--rule);border-radius:var(--corner);background:var(--tint)}.lk .selection-panel h2{margin-top:20px}.lk .selection-panel .selection-review h2{margin-top:0}`}</style>
  <h1>Export and import</h1>
  <p>Encrypted selected copies, opened locally with a separately retained buyer key. Full installation backup and recovery use Records.</p>
  <div className="actions"><button disabled={busy} aria-pressed={mode === 'export'} onClick={() => { clear(); setMode('export'); }}>Export selection</button><button disabled={busy} aria-pressed={mode === 'import'} onClick={() => { clear(); setMode('import'); }}>Import selection</button></div>
  {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}{busy && <p role="status">Checking current authority and encrypted data…</p>}
  {mode === 'export' ? <>
   <h2>Choose vaults and items</h2><p>Only each vault’s current owner may export it. Company coverage is limited to visible vaults; uninspected company vaults remain unknown. Plaintext export is unavailable here and denied by default.</p>
   {!vaults.length && <p>No visible vaults to export.</p>}
   {vaults.map(vault => { const row = scope.find(row => row.vault === vault.id), own = vault.owner === client.profile.account; return <fieldset key={vault.id}>
    <legend>{vaultLabel(vault)} · {kindLabel(vault.kind)}</legend>
    <label className="check"><input type="checkbox" disabled={busy || !own} checked={!!row} onChange={e => void run(() => pickVault(vault.id, e.target.checked))}/>Select {vaultLabel(vault)}</label>
    {!own && <p>Not owned by this account. Read access and installation administration do not permit export.</p>}
    {row && <><label>Selection for {vaultLabel(vault)}<select disabled={busy} value={row.objects === null ? 'vault' : 'items'} onChange={e => { invalidate(); setScope(rows => rows.map(value => value.vault === vault.id ? { ...value, objects: e.target.value === 'vault' ? null : [] } : value)); }}><option value="vault">Whole vault, including inactive records</option><option value="items">Choose individual items</option></select></label>
     {row.objects !== null && <div role="group" aria-label={`Items in ${vaultLabel(vault)}`}>{items[vault.id]?.map(item => <label className="check" key={item.object}><input type="checkbox" disabled={busy} checked={row.objects!.includes(item.object)} onChange={e => { invalidate(); setScope(rows => rows.map(value => value.vault === vault.id ? { ...value, objects: e.target.checked ? [...value.objects!, item.object] : value.objects!.filter(id => id !== item.object) } : value)); }}/>{item.title} · {item.object.slice(0, 8)}</label>)}</div>}</>}
   </fieldset>; })}
   <div className="form-grid"><label>Export purpose<input maxLength={500} value={purpose} disabled={busy} onChange={e => { invalidate(); setPurpose(e.target.value); }}/></label><label>Intended target<input maxLength={500} value={target} disabled={busy} onChange={e => { invalidate(); setTarget(e.target.value); }}/></label></div>
   <button disabled={busy || !scope.length || scope.some(row => row.objects?.length === 0) || !purpose.trim() || !target.trim()} onClick={() => void run(async () => { const value = await api.preview(scope, { review: { purpose, target } }); if (active.current) { setPreview(value); setApproved(false); } })}>Review encrypted export</button>
  </> : <>
   <h2>Open an encrypted selection</h2><p>Use a fresh installation with no visible vaults and its currently enrolled owner. Source grants, keys and active authority never become destination authority. An old file cannot establish later erasure.</p>
   <label>Encrypted selection file<input type="file" accept=".json" disabled={busy} onChange={e => { loadArchive(e.target.files?.[0]); e.target.value = ''; }}/></label>
  </>}
  <h2>Separately retained buyer key</h2>
  <p>Keep this key apart from the encrypted selection. The service cannot recover it. Files and keys are processed in this unlocked browser, without uploading their contents.</p>
  {mode === 'export' && <button disabled={busy} onClick={() => void run(async () => { const value = encode(random()); download('latchkey-selection.key', value, 'text\u002fplain'); if (active.current) { setKey(value); setRetained(false); } })}>Generate and save buyer key</button>}
  <label>Buyer export key file<input type="file" disabled={busy} onChange={e => { setPreview(mode === 'import' ? null : preview); setApproved(false); loadKey(e.target.files?.[0]); e.target.value = ''; }}/></label>
  <p role="status">{key ? 'Buyer key loaded locally.' : 'No buyer key loaded.'}</p>
  {mode === 'export' && <label className="check"><input type="checkbox" disabled={busy || !key} checked={retained} onChange={e => setRetained(e.target.checked)}/>I retained the buyer key separately from the export</label>}
  {mode === 'import' && <button disabled={busy || !key || !archive} onClick={() => void run(async () => { const value = await SelectionExportClient.open(archive, key); if (active.current) { setPreview({ plan: value.plan, planHash: value.planHash }); setApproved(false); } })}>Open encrypted file</button>}
  {preview && <div className="selection-review" role="region" aria-label="Exact selection review">
   <SelectionReview preview={preview}/>
   {mode === 'import' && <p>Import creates new owner-only vaults, preserves included history and lifecycle observations, and keeps retention inactive and plaintext denied. Source grants and policies confer no access.</p>}
   <label className="check"><input type="checkbox" disabled={busy} checked={approved} onChange={e => setApproved(e.target.checked)}/>{mode === 'export' ? 'I approve this exact encrypted selection, purpose, target and copy custody' : 'I approve this exact selection into fresh owner-only vaults'}</label>
   <div className="actions">{mode === 'export' ? <button className="primary" disabled={busy || !approved || !key || !retained} onClick={() => void run(release)}>Download encrypted selection</button> : <button className="primary" disabled={busy || !approved || !key} onClick={() => void run(async () => { const value = await api.reimport(archive, key, { confirmed: approved, approvedPlanHash: preview.planHash }); if (active.current) { clear(); setResult(value); setStatus(value.interrupted ? 'Import reconciled. The response was interrupted; current destination reads verified all included content. No import retry was sent.' : 'Import reconciled. Fresh owner-only vaults created; retention inactive and plaintext denied.'); } })}>Import reviewed selection</button>}</div>
  </div>}
  {result && <div aria-label="Import reconciliation"><h2>Reconciled destination</h2>{result.restored.map((row: any) => <article key={row.destination}><p><code>{row.source}</code> → <code>{row.destination}</code></p><Counts counts={row.counts}/><p>{row.access}</p><p>{row.lifecycle.length} lifecycle observations · {row.historyGaps.length} disclosed history gaps · retention inactive</p></article>)}<p>{result.laterErasure}</p><button disabled={busy} onClick={() => void run(onImported)}>Open imported vaults</button></div>}
  <button disabled={busy && !releasing} onClick={cancel}>Cancel and clear</button>
 </section>;
}
function Counts({ counts }: { counts: any }) { return <p>{counts.items} items · {counts.versions} versions · {counts.attachments} attachments · {counts.attachmentBytes} attachment bytes</p>; }
function SelectionReview({ preview }: { preview: any }) {
 const plan = preview.plan;
 return <><h2>Review exact selection</h2><p>Format: encrypted open JSON</p><p>Purpose: {plan.review.purpose}</p><p>Target: {plan.review.target}</p><p>{plan.review.consequences}</p>
  <p>{plan.coverage.selectedCompanyVaults} selected company vaults of {plan.coverage.visibleCompanyVaults} visible. Complete company: no. Other company vaults: {plan.coverage.otherCompanyVaults}.</p>
  {plan.selection.map((row: any) => <article key={row.vault}><h3>Vault <code>{row.vault}</code></h3><Counts counts={row.counts}/><p>Source revision {row.revision} · policy revision {row.policyRevision} · {row.lifecycle.length} lifecycle observations · {row.historyGaps.length} disclosed history gaps</p><p>{row.omittedObjects.length} omitted items</p>{row.omittedObjects.length > 0 && <details><summary>Omitted item references</summary><ul>{row.omittedObjects.map((id: string) => <li key={id}><code>{id}</code></li>)}</ul></details>}</article>)}
  <h3>Omissions and custody</h3><ul>{plan.omissions.map((value: string) => <li key={value}>{value}</li>)}</ul><p>{plan.omittedVaults.length} visible vaults omitted; counts not inspected.</p>{plan.omittedVaults.length > 0 && <details><summary>Uninspected vault references</summary><ul>{plan.omittedVaults.map((row: any) => <li key={row.vault}><code>{row.vault}</code> · {row.counts}</li>)}</ul></details>}
  <p>Exact plan: <code>{preview.planHash}</code></p><p>New export approval checks live source, ownership and policy. A change requires a new review. Selected exports retain the existing one-megabyte envelope limit; use Records for full installation archives.</p>
 </>;
}
function explain(cause: unknown) {
 const code = (cause as any)?.code ?? (cause instanceof Error ? cause.message : undefined);
 const messages: Record<string, string> = {
  export_plan_changed: 'Source data or policy changed. Review the selection again.', export_approval_changed: 'Current authority, source or policy changed. Review the selection again.',
  selected_export_unverified: 'The release response was interrupted. No selection download was started. Release may have been recorded; saving and delivery are unverified. The review and buyer key were cleared. Start a fresh review before another export.',
  export_cancelled: 'Export cancelled. No selection download was started. A release check may already have been recorded.',
  browser_download_failed: 'The browser download could not be initiated. Review again before retrying. Saving and delivery are unverified.',
  selected_export_size_limit: 'This selection exceeds the supported file size. Choose fewer items or use Records for a full installation archive.',
  encrypted_selection_required: 'Choose an encrypted selected export. Plaintext browser ceremonies are not supported.',
  cannot_decrypt: 'The key or encrypted file could not be verified. Nothing was imported.', invalid_selected_export: 'The file integrity could not be verified. Nothing was imported.', invalid_envelope: 'The file integrity could not be verified. Nothing was imported.', invalid_encoding: 'The key or file encoding is invalid. Nothing was imported.',
  invalid_key: 'Choose the separately retained 32-byte buyer key.', authentication_failed: 'The key or encrypted file could not be verified. Nothing was imported.',
  fresh_installation_required: 'Import requires a different, fresh installation.', empty_export_destination_required: 'Import requires a fresh destination with no visible vaults.',
  destination_owner_required: 'Only the current destination installation owner may import this selection.',
  export_reconciliation_failed: 'The destination could not be reconciled. Inspect its vaults before attempting further imports.',
  selected_import_unverified: 'The import outcome could not be verified. Vaults may already exist. Lock and unlock this installation to inspect its current vaults before another import; no retry was sent.',
 };
 return messages[code] ?? message(cause);
}
