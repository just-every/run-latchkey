import { useEffect, useMemo, useRef, useState } from 'react';
import { OrganizationClient, filterRecords } from './client.mjs';
import { BulkClient } from './bulk-client.mjs';
import { LifecycleClient } from '../lifecycle/client.mjs';
import { message } from '../ui/types';
import { dots, kindLabel, typeLabel, vaultLabel } from '../ui/labels';

type Selected = { vault: string; object: string; title: string };
type Snapshot = { records: any[]; lifecycle: any[]; vault: { id: string; kind: string; owner: string } };
type Criteria = { query?: string; type?: string; tag?: string; favorite?: boolean; owner?: string; expiryBefore?: string | number; health?: string; state?: 'active' | 'archived' | 'trash' };
type Outcome = Selected & { error?: string; state?: string; expiresAt?: number | null };
const reference = (row: { vault: string; object: string }) => `${row.vault}/${row.object}`;
const describe = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value);
const date = (value: number | string | null | undefined) => value == null ? 'None' : new Date(value).toLocaleString();
const active: Criteria = { state: 'active' };

function ItemReference({ row }: { row: Selected }) {
 return <div className="rule-view"><span>{row.title}</span><span>{reference(row)}</span></div>;
}

function SearchControls({ criteria, setCriteria, disabled }: { criteria: Criteria; setCriteria: (value: Criteria) => void; disabled: boolean }) {
 const update = (key: keyof Criteria, value: unknown) => {
  const next = { ...criteria }; if (value === '' || value === undefined) delete next[key]; else (next as any)[key] = value;
  setCriteria(next);
 };
 return <div className="form-grid">
  <label>Search permitted decrypted items<input type="search" maxLength={500} value={criteria.query ?? ''} disabled={disabled} onChange={event => update('query', event.target.value)}/></label>
  <label>Item type<input maxLength={200} value={criteria.type ?? ''} disabled={disabled} placeholder="Any type" onChange={event => update('type', event.target.value)}/></label>
  <label>Tag<input maxLength={200} value={criteria.tag ?? ''} disabled={disabled} onChange={event => update('tag', event.target.value)}/></label>
  <label>Favorite<select value={criteria.favorite === undefined ? '' : String(criteria.favorite)} disabled={disabled} onChange={event => update('favorite', event.target.value === '' ? undefined : event.target.value === 'true')}><option value="">Any</option><option value="true">Favorites</option><option value="false">Not favorites</option></select></label>
  <label>Owner account<input maxLength={200} value={criteria.owner ?? ''} disabled={disabled} onChange={event => update('owner', event.target.value)}/></label>
  <label>Expiry on or before<input type="date" value={criteria.expiryBefore == null ? '' : new Date(criteria.expiryBefore).toISOString().slice(0, 10)} disabled={disabled} onChange={event => update('expiryBefore', event.target.value ? `${event.target.value}T23:59:59.999Z` : undefined)}/></label>
  <label>Health<select value={['unknown', 'healthy', 'findings'].includes(criteria.health ?? '') ? criteria.health : criteria.health ? 'custom' : ''} disabled={disabled} onChange={event => update('health', event.target.value === 'custom' ? 'custom' : event.target.value)}><option value="">Any health</option><option value="unknown">Unknown: no findings evidence</option><option value="healthy">Healthy: checked, no findings</option><option value="findings">Has findings</option><option value="custom">Specific finding</option></select></label>
  {criteria.health && !['unknown', 'healthy', 'findings'].includes(criteria.health) && <label>Finding code, type, severity or status<input maxLength={200} value={criteria.health} disabled={disabled} onChange={event => update('health', event.target.value)}/></label>}
  <label>Item state<select value={criteria.state ?? 'active'} disabled={disabled} onChange={event => update('state', event.target.value)}><option value="active">Active</option><option value="archived">Archived indefinitely</option><option value="trash">Trash: 30-day retention</option></select></label>
 </div>;
}

function BulkReview({ preview, selection, confirmed, setConfirmed, ownershipConfirmed, setOwnershipConfirmed, busy, apply, cancel, vaultName, ownerName }: any) {
 const denied = preview.selection.some((row: any) => !row.allowed);
 return <section className="tool-box" aria-label="Bulk action preview">
  <h2>Review {preview.action}</h2>
  <p>Review every affected reference, version and permission result. Changing the selection, action, tags or destination requires a new preview.</p>
  {preview.selection.map((row: any) => <article key={reference(row)} className="definition fingerprint">
   <ItemReference row={{ ...row, title: selection.find((item: Selected) => reference(item) === reference(row))?.title ?? 'Selected item' }}/>
   <p>Current version: {row.version}. Affected versions: {row.versions.join(', ')}. State: {row.state}.</p>
   <p>{row.allowed ? 'Allowed by current authority checks.' : 'Denied.'} {row.reason && describe(row.reason)}</p>
   {row.rights !== undefined && <div className="rule-view"><span>Exact source rights</span><span>{describe(row.rights)}</span></div>}
  </article>)}
  {preview.destination && <div className="definition fingerprint"><h2>Destination</h2><div className="rule-view"><span>{dots(['Vault', 'kind', 'owner'])}</span><span>{dots([vaultName(preview.destination.id), kindLabel(preview.destination.kind), ownerName(preview.destination.owner)])}</span></div></div>}
  <h2>Entire resulting destination recipient set</h2>
  {preview.destination ? <>{preview.recipients.length === 0 && <p>No destination recipients were reported. This empty set is part of the preview.</p>}{preview.recipients.map((recipient: any) => <div className="definition rule-view" key={recipient.account}><span>Recipient account</span><span>{recipient.account}</span><span>Exact rights: {describe(recipient.rights)}</span></div>)}</> : <p>No destination change for this action.</p>}
  {!!preview.ownershipTransfers?.length && <div className="notice"><h2>Personal ownership changes to company ownership</h2><p>Every selected personal item version and attachment will be encrypted for the company destination and its exact recipients above. The company keeps these copies after employment or sponsored benefits end. Your source is archived with its history; Undo cannot recall company copies or past access.</p><label className="check"><input type="checkbox" checked={ownershipConfirmed} disabled={busy || denied} onChange={event => setOwnershipConfirmed(event.target.checked)}/>I personally own these family items and explicitly transfer the reviewed copies and history into company ownership.</label></div>}
  {preview.action === 'tag' && <p className="fingerprint">Tags: {preview.tags.join(', ')}</p>}
  {preview.action === 'archive' && <p>Archive is indefinite. Items leave normal fill suggestions and active remediation; history remains.</p>}
  {denied && <p className="error" role="alert">At least one selected item is denied. Nothing can be applied from this preview; remove or resolve denied selections and preview again.</p>}
  <label className="check"><input type="checkbox" checked={confirmed} disabled={busy || denied} onChange={event => setConfirmed(event.target.checked)}/>I approve these exact objects, versions, resulting recipients and rights.</label>
  <div className="actions"><button className="primary" disabled={busy || denied || !confirmed || !!preview.ownershipTransfers?.length && !ownershipConfirmed} onClick={apply}>Apply reviewed {preview.action}</button><button disabled={busy} onClick={cancel}>Cancel preview</button></div>
 </section>;
}

// Vaults show their names where this session has decrypted them (the vault screen's and this
// panel's own source), owners their names from the account directory the reviews use.
export function OrganizationPanel({ client, vault, run, onChanged, names, onNamed }: any) {
 const organization = useMemo(() => new OrganizationClient(client), [client]);
 const bulk = useMemo(() => new BulkClient(client), [client]);
 const lifecycle = useMemo(() => new LifecycleClient(client), [client]);
 const [source, setSource] = useState(vault || ''), [vaults, setVaults] = useState<any[]>([]), [snapshot, setSnapshot] = useState<Snapshot | null>(null);
 const [criteria, setCriteria] = useState<Criteria>(active), [tab, setTab] = useState('search'), [limit, setLimit] = useState(50), [collectionView, setCollectionView] = useState('');
 const [selection, setSelection] = useState<Selected[]>([]), [selectedLimit, setSelectedLimit] = useState(50);
 const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [reload, setReload] = useState(0);
 const [action, setAction] = useState<'move'|'tag'|'archive'>('move'), [destination, setDestination] = useState(''), [tags, setTags] = useState(''), [preview, setPreview] = useState<any>(null), [confirmed, setConfirmed] = useState(false);
 const [ownershipConfirmed, setOwnershipConfirmed] = useState(false), [people, setPeople] = useState<{ account: string; name: string }[]>([]);
 const [lastOperation, setLastOperation] = useState<string | null>(null), [undoConfirmed, setUndoConfirmed] = useState(false);
 const [transition, setTransition] = useState<{ state: string; items: Selected[] } | null>(null), [transitionConfirmed, setTransitionConfirmed] = useState(false), [outcomes, setOutcomes] = useState<Outcome[]>([]);
 const [savedFilter, setSavedFilter] = useState(''), [filterName, setFilterName] = useState(''), [collectionName, setCollectionName] = useState(''), [parent, setParent] = useState('');
 const context = useRef(0), mounted = useRef(true);
 const invalidate = () => { setPreview(null); setConfirmed(false); setOwnershipConfirmed(false); setTransition(null); setTransitionConfirmed(false); };
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; context.current++; }; }, []);
 useEffect(() => {
  let current = true;
  setVaults([]); setSelection([]); setLastOperation(null); setOutcomes([]); setDestination(''); setUndoConfirmed(false); invalidate();
  void Promise.all([client.call('vaults', {}), client.call('reviews/people', {})]).then(([rows, members]: any[][]) => { if (current) { setVaults(rows); setPeople(members); } }).catch((cause: unknown) => { if (current) setError(message(cause)); });
  return () => { current = false; };
 }, [client]);
 useEffect(() => { setSource(vault || ''); }, [vault]);
 useEffect(() => {
  const token = ++context.current;
  setSnapshot(null); setLoading(!!source); setError(''); setStatus(''); setSavedFilter(''); setFilterName(''); setParent(''); setCollectionName(''); setCollectionView(''); setLimit(50); invalidate();
  if (source) void organization.load(source).then((loaded: Snapshot) => { if (token === context.current) setSnapshot(loaded); }).catch((cause: unknown) => { if (token === context.current) setError(message(cause)); }).finally(() => { if (token === context.current) setLoading(false); });
  return () => { context.current++; };
 }, [organization, source, reload]);
 const sourceTitle = snapshot?.records.find(row => row.value?.schema === 'latchkey/vault-meta/v1')?.value.title;
 useEffect(() => { if (snapshot && sourceTitle && names?.[snapshot.vault.id] !== sourceTitle) onNamed?.(snapshot.vault.id, sourceTitle); }, [snapshot, sourceTitle]);
 const vaultName = (id: string) => vaultLabel({ id, title: names?.[id] ?? (snapshot?.vault.id === id ? sourceTitle : undefined) });
 const ownerName = (account: string) => { const you = account === client.profile.account, name = people.find(person => person.account === account)?.name; return name ? `${name}${you ? ' (you)' : ''}` : you ? 'You' : `Account · ${account.slice(0, 8)}`; };
 const changeCriteria = (next: Criteria) => { setCriteria(next); setLimit(50); setCollectionView(''); };
 const filters = snapshot?.records.filter(row => row.value?.schema === 'latchkey/saved-filter/v1') ?? [];
 const collections = snapshot?.records.filter(row => row.value?.schema === 'latchkey/collection/v1') ?? [];
 const permitted = snapshot?.records.filter(row => row.value?.schema === 'latchkey/item/v1') ?? [];
 const rows: any[] = useMemo(() => snapshot ? filterRecords(snapshot.records, criteria, { lifecycle: snapshot.lifecycle, owner: snapshot.vault.owner }) : [], [snapshot, criteria]);
 const visible = collectionView ? rows.filter(row => collections.find(collection => collection.object === collectionView)?.value.items.includes(row.object)) : rows;
 const currentSelection = selection.filter(row => row.vault === source && permitted.some(item => item.object === row.object));
 const collectionPath = (object: string) => {
  const parts: string[] = [], seen = new Set<string>(); let id: string | null = object;
  while (id && !seen.has(id)) { seen.add(id); const row = collections.find(entry => entry.object === id); if (!row) { parts.unshift('Unavailable parent'); break; } parts.unshift(row.value.name); id = row.value.parent; }
  if (id && seen.has(id) && parts.length > 1) parts.unshift('Nested collection');
  return parts.join(' / ');
 };
 const refresh = async (token: number) => {
  const loaded = source ? await organization.load(source) : null;
  if (mounted.current && token === context.current) setSnapshot(loaded);
 };
 const execute = async (work: (token: number) => Promise<void>) => {
  if (busy) return;
  const token = context.current; setBusy(true); setError(''); setStatus('');
  try { await run(async () => {
   try { await work(token); }
   catch (cause) { if (mounted.current && token === context.current) setError(message(cause)); if (['locked', 'device_revoked', 'authority_expired', 'account_key_changed'].includes((cause as any)?.code) || (cause as any)?.status === 401) throw cause; }
  }); } finally { if (mounted.current) setBusy(false); }
 };
 const notify = async () => { if (onChanged) await onChanged(); };
 const updateSelection = (row: any, checked: boolean) => {
  invalidate(); const item = { vault: source, object: row.object, title: row.value.title };
  setSelection(previous => checked ? [...previous, item] : previous.filter(entry => reference(entry) !== reference(item)));
 };
 const previewBulk = () => void execute(async token => {
  invalidate();
  const result = await bulk.preview({ selection: selection.map(({ vault: id, object }) => ({ vault: id, object })), destination: action === 'move' ? destination : null, action, tags: action === 'tag' ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [] });
  if (token === context.current) setPreview(result);
 });
 const applyBulk = () => void execute(async token => {
  if (!preview || !confirmed || preview.selection.some((row: any) => !row.allowed)) return;
  const approved = preview; invalidate();
  try {
   const result = await bulk.commit(approved, { confirmed: true, ownershipConfirmed });
   if (mounted.current) { setLastOperation(result.operation); setUndoConfirmed(false); setSelection([]); }
   await refresh(token); await notify();
   if (token === context.current) setStatus('Bulk operation committed and the current source was refreshed.');
  } catch (cause) {
   try { await refresh(token); } catch (refreshError) { if (token === context.current) { setSnapshot(null); setStatus(`Current source refresh failed: ${message(refreshError)}. Refresh before another change.`); } }
   throw cause;
  }
 });
 const applyTransition = () => void execute(async token => {
  if (!transition || !transitionConfirmed) return;
  const requested = transition; invalidate(); setOutcomes([]);
  const observed: Outcome[] = [];
  for (const item of requested.items) {
   try { await lifecycle.change(item.vault, item.object, requested.state, { confirmed: true }); observed.push({ ...item }); }
   catch (cause) { observed.push({ ...item, error: message(cause) }); }
  }
  for (const id of new Set(requested.items.map(item => item.vault))) {
   try {
    const live = await lifecycle.list(id);
    for (const outcome of observed.filter(item => item.vault === id)) {
     const row = live.items.find((item: any) => item.object === outcome.object);
     if (row) { outcome.state = row.state; outcome.expiresAt = row.expiresAt; if (!outcome.error && row.state !== requested.state) outcome.error = 'The requested state was not observed. Review current authority and state before trying again.'; }
     else outcome.error = [outcome.error, 'Current state is unavailable; no successful change is asserted.'].filter(Boolean).join(' ');
    }
   } catch (cause) { for (const outcome of observed.filter(item => item.vault === id)) outcome.error = [outcome.error, `Could not verify current state: ${message(cause)}`].filter(Boolean).join(' '); }
  }
  if (mounted.current && token === context.current) setOutcomes(observed);
  try { await refresh(token); } catch (cause) { if (token === context.current) setSnapshot(null); throw cause; }
  await notify();
  if (token === context.current) setStatus(observed.some(item => item.error) ? 'Some changes failed or could not be verified. Review every actual outcome below.' : 'The requested state was verified for every selected reference.');
 });
 const chooseTab = (value: string) => { setTab(value); setCollectionView(''); setLimit(50); if (value === 'trash') setCriteria({ ...criteria, state: 'trash' }); else if (value === 'search') setCriteria({ ...criteria, state: 'active' }); };
 return <section className="detail section" aria-label="Find and organize items" aria-busy={loading || busy}>
  <h1>Find and organize</h1>
  <p className="muted">Search runs locally over items you can decrypt. Counts apply only to permitted decrypted items in the source vault. Selections remain when you browse another vault.</p>
  {error && <div className="error" role="alert"><span>{error}</span></div>}
  {status && <p className="notice" role="status">{status}</p>}
  <div className="form-grid"><label>Browse vault<select className="vault-select" value={source} disabled={busy} onChange={event => setSource(event.target.value)}><option value="">Choose source vault</option>{vaults.map(row => <option key={row.id} value={row.id}>{vaultName(row.id)} · {kindLabel(row.kind)}</option>)}</select></label><div className="actions"><button disabled={busy || loading || !source} onClick={() => setReload(value => value + 1)}>Refresh source</button></div></div>
  {!source && <div className="empty"><p>Choose a permitted vault to browse.</p></div>}
  {loading && <p className="loading" role="status">Decrypting permitted source items…</p>}
  {busy && <p className="loading" role="status">Processing the requested action…</p>}
  <nav className="actions" aria-label="Organization sections">{[['search', 'Search'], ['collections', 'Collections'], ['trash', 'Trash']].map(([value, label]) => <button key={value} aria-pressed={tab === value} disabled={busy} onClick={() => chooseTab(value)}>{label}</button>)}</nav>
  {snapshot && <>
   <div className="rule-view"><span>{dots(['Current source', 'kind', 'owner'])}</span><span>{dots([vaultName(snapshot.vault.id), kindLabel(snapshot.vault.kind), ownerName(snapshot.vault.owner)])}</span></div>
   {tab === 'trash' && <p className="notice">Deleted items remain in trash for 30 days by default before permanent erasure. Archive is indefinite. Restore requires independent restore permission and current destination create rights. Company administrators cannot restore family items.</p>}
   <SearchControls criteria={criteria} setCriteria={changeCriteria} disabled={busy || loading}/>
   <details className="tool-box"><summary>Saved filters</summary>
    <label>Apply saved filter<select value={savedFilter} disabled={busy} onChange={event => {
     const id = event.target.value; const row = filters.find(item => item.object === id); setSavedFilter(id); setFilterName(row?.value.name ?? '');
     if (row) { try { filterRecords(snapshot.records, row.value.criteria, { lifecycle: snapshot.lifecycle, owner: snapshot.vault.owner }); changeCriteria(row.value.criteria); setError(''); } catch (cause) { setError(message(cause)); } }
    }}><option value="">New saved filter</option>{filters.map(row => <option value={row.object} key={row.object}>{row.value.name}</option>)}</select></label>
    {!filters.length && <p>No saved filters in this vault.</p>}
    <form onSubmit={event => { event.preventDefault(); void execute(async token => { await organization.saveFilter(source, { name: filterName.trim(), criteria }, savedFilter || undefined); await refresh(token); await notify(); if (token === context.current) setStatus('Saved filter stored in the source vault.'); }); }}>
     <label>Filter name<input required maxLength={200} value={filterName} disabled={busy} onChange={event => setFilterName(event.target.value)}/></label><button disabled={busy || !filterName.trim()}>{savedFilter ? 'Update saved filter' : 'Save current filter'}</button>
    </form>
   </details>
   {tab === 'collections' && <section className="tool-box" aria-label="Nested collections"><h2>Collections</h2>
    {!collections.length && <p>No collections in this vault.</p>}
    {collections.map(row => <article className="definition fingerprint" key={row.object}><div className="rule-view"><span>{collectionPath(row.object)}</span><span>{row.object}</span></div><p>{row.value.items.filter((id: string) => permitted.some(item => item.object === id)).length} permitted decrypted member items.</p><button disabled={busy} onClick={() => { setCollectionView(row.object); setLimit(50); }}>Show permitted items in {row.value.name}</button></article>)}
    <form onSubmit={event => { event.preventDefault(); void execute(async token => { await organization.collection(source, { name: collectionName.trim(), parent: parent || null, items: currentSelection.map(row => row.object) }); await refresh(token); await notify(); if (token === context.current) { setCollectionName(''); setStatus('Collection created with the selected source items.'); } }); }}>
     <label>New collection name<input required maxLength={200} disabled={busy} value={collectionName} onChange={event => setCollectionName(event.target.value)}/></label>
     <label>Parent collection<select disabled={busy} value={parent} onChange={event => setParent(event.target.value)}><option value="">Top level</option>{collections.map(row => <option key={row.object} value={row.object}>{collectionPath(row.object)}</option>)}</select></label>
     <p>{currentSelection.length} selected permitted items from this source will be included. Selections in other vaults stay selected and are excluded from this collection.</p>
     <button disabled={busy || !collectionName.trim()}>Create collection from selected source items</button>
    </form>
   </section>}
   <section className="tool-box" aria-label="Search results"><h2>{collectionView ? 'Collection items matching filters' : 'Matching items'}</h2><p role="status">{visible.length} permitted decrypted items match. Showing {Math.min(limit, visible.length)}.</p>
    {collectionView && <button disabled={busy} onClick={() => setCollectionView('')}>Clear collection scope</button>}
    {!visible.length && <div className="empty"><p>{criteria.state === 'trash' ? 'No permitted trash items match.' : criteria.state === 'archived' ? 'No permitted archived items match.' : 'No permitted active items match.'}</p></div>}
    {visible.slice(0, limit).map(row => <article className="definition fingerprint" key={row.object}>
     <label className="check"><input type="checkbox" disabled={busy} checked={selection.some(item => item.vault === source && item.object === row.object)} onChange={event => updateSelection(row, event.target.checked)}/>{row.value.title}</label>
     <div className="rule-view"><span>{dots(['Object reference', 'version', 'type'])}</span><span>{dots([`${source}/${row.object}`, String(row.version), typeLabel(row.value.type)])}</span></div>
     <p>State: {row.lifecycle.state}. {row.value.favorite ? 'Favorite. ' : ''}Owner: {ownerName(row.value.owner ?? snapshot.vault.owner)}.</p>
     <p>Health: {!Array.isArray(row.value.healthFindings) ? 'Unknown — no findings evidence reported.' : row.value.healthFindings.length ? `${row.value.healthFindings.length} findings reported.` : 'Checked; no findings reported.'}</p>
     {row.lifecycle.state === 'archived' && <p>Archived indefinitely; excluded from normal fill suggestions and active remediation.</p>}
     {row.lifecycle.state === 'trash' && <p>Trash retention expires: {date(row.lifecycle.expiresAt)}.</p>}
     {row.value.fields?.filter((field: any) => field.type === 'date' && !field.secret).map((field: any) => <p key={field.id}>{field.label || 'Expiry'}: {String(field.value ?? 'Not set')}</p>)}
    </article>)}
    {limit < visible.length && <button disabled={busy} onClick={() => setLimit(value => value + 50)}>Show more items</button>}
   </section>
  </>}
  {selection.length > 0 && <section className="tool-box" aria-label="Selected items"><h2>Selected references ({selection.length})</h2><p>These titles were decrypted when selected. A fresh preview checks current authority for every reference.</p>
   {selection.slice(0, selectedLimit).map(row => <article className="definition fingerprint" key={reference(row)}><ItemReference row={row}/><button disabled={busy} onClick={() => { invalidate(); setSelection(previous => previous.filter(item => reference(item) !== reference(row))); }}>Remove {row.title} from selection</button></article>)}
   {selectedLimit < selection.length && <button disabled={busy} onClick={() => setSelectedLimit(value => value + 50)}>Show more selected references</button>}
   <button disabled={busy} onClick={() => { invalidate(); setSelection([]); }}>Clear selection</button>
   <div className="form-grid"><label>Bulk action<select value={action} disabled={busy} onChange={event => { setAction(event.target.value as 'move'|'tag'|'archive'); invalidate(); }}><option value="move">Move</option><option value="tag">Tag</option><option value="archive">Archive</option></select></label>
    <label>Destination vault<select className="vault-select" value={destination} disabled={busy || action !== 'move'} onChange={event => { setDestination(event.target.value); invalidate(); }}><option value="">Choose destination</option>{vaults.map(row => <option key={row.id} value={row.id}>{vaultName(row.id)} · {kindLabel(row.kind)}</option>)}</select></label>
    {action === 'tag' && <label>Tags to add (comma separated)<input maxLength={2000} value={tags} disabled={busy} onChange={event => { setTags(event.target.value); invalidate(); }}/></label>}
   </div>
   <button disabled={busy || loading || action === 'move' && !destination || action === 'tag' && !tags.split(',').some(tag => tag.trim())} onClick={previewBulk}>Preview exact bulk action</button>
   <div className="actions"><button disabled={busy || loading} onClick={() => { invalidate(); setTransition({ state: 'trash', items: [...selection] }); }}>Review move to trash</button><button disabled={busy || loading} onClick={() => { invalidate(); setTransition({ state: 'active', items: [...selection] }); }}>Review restore to active</button></div>
  </section>}
  {preview && <BulkReview preview={preview} selection={selection} confirmed={confirmed} setConfirmed={setConfirmed} ownershipConfirmed={ownershipConfirmed} setOwnershipConfirmed={setOwnershipConfirmed} busy={busy} apply={applyBulk} cancel={invalidate} vaultName={vaultName} ownerName={ownerName}/>}
  {transition && <section className="tool-box" aria-label="Lifecycle confirmation"><h2>Confirm {transition.state === 'trash' ? 'trash' : 'restore to active'}</h2>
   <p>{transition.state === 'trash' ? 'Trash retains deleted items for 30 days by default before permanent erasure. Archive instead retains history indefinitely.' : 'Restore requires independent restore and current destination create rights. Company administrators cannot restore family items. Restoring does not revive revoked shares, approvals, machine leases or old provider credentials.'}</p>
   {transition.items.map(row => <article className="definition fingerprint" key={reference(row)}><ItemReference row={row}/></article>)}
   <p>Each reference is attempted separately. A denied or changed item can produce a partial result; every outcome is refreshed from current lifecycle state.</p>
   <label className="check"><input type="checkbox" checked={transitionConfirmed} disabled={busy} onChange={event => setTransitionConfirmed(event.target.checked)}/>I confirm this state change for every exact reference above.</label>
   <div className="actions"><button disabled={busy || !transitionConfirmed} onClick={applyTransition}>Confirm {transition.state === 'trash' ? 'move to trash' : 'restore'}</button><button disabled={busy} onClick={invalidate}>Cancel state change</button></div>
  </section>}
  {outcomes.length > 0 && <section className="tool-box" aria-label="Observed lifecycle outcomes"><h2>Actual lifecycle outcomes</h2>{outcomes.map(row => <article className="definition fingerprint" key={reference(row)}><ItemReference row={row}/><p>Observed state: {row.state ?? 'Unavailable'}.{row.state === 'trash' && <> Retention expires: {date(row.expiresAt)}.</>}</p>{row.error && <p role="alert">{row.error}</p>}</article>)}</section>}
  {lastOperation && <section className="tool-box" aria-label="Undo last operation"><h2>Undo last bulk operation</h2><div className="rule-view"><span>Operation reference</span><span>{lastOperation}</span></div><p>Undo checks live rights and current versions. Changed or revoked authority may prevent reversal; it cannot restore removed recipients or revive prior capabilities.</p><label className="check"><input type="checkbox" checked={undoConfirmed} disabled={busy} onChange={event => setUndoConfirmed(event.target.checked)}/>I confirm Undo of this exact operation under current rights.</label><button disabled={busy || !undoConfirmed} onClick={() => void execute(async token => {
   const operation = lastOperation; setUndoConfirmed(false); invalidate();
   try { await bulk.undo(operation, { confirmed: true }); setLastOperation(null); await refresh(token); await notify(); if (token === context.current) setStatus('Undo completed and the source was refreshed.'); }
   catch (cause) { try { await refresh(token); } catch (refreshError) { if (token === context.current) { setSnapshot(null); setStatus(`Current source refresh failed: ${message(refreshError)}.`); } } throw cause; }
  })}>Undo last operation</button></section>}
 </section>;
}
