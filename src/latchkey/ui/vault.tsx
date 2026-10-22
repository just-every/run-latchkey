import {EvidenceWorkspace} from '../evidence/workspace';
import {AutomationPanel} from '../automation/ui';
import {ProjectsPanel} from '../projects/ui';
import {OrganizationPanel} from '../collections/ui';
import { ReviewsPanel } from '../reviews/ui';
import { PeopleErasure } from './people-erasure';
import { ReceivedShares } from '../sharing/received';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TypedItems, validateItem } from './runtime.mjs';
import { download, message, type Item, type ItemRecord } from './types';
import { Unlock } from './unlock';
import { ItemEditor } from './editor';
import { ItemDetail } from './detail';
import { Generator } from './generator';
import { Templates } from './templates';
import { Icon } from './icon';
import { ItemRow, ItemsHead } from './item-row';
import { kindLabel, vaultLabel } from './labels';
import { Tabs } from './tabs';
import { SharingPanel } from '../sharing/ui';
import { vaultCss } from './styles';
import { OwnerTrust } from './owner-trust';
import { Lockup } from '../../site/shell/Lockup';

export function VaultScreen() {
 const [client, setClient] = useState<any>(null), [vaults, setVaults] = useState<any[]>([]), [vault, setVault] = useState(''), [records, setRecords] = useState<ItemRecord[]>([]), [selected, setSelected] = useState('');
 const [query, setQuery] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(0), [panel, setPanel] = useState(''), [create, setCreate] = useState(false), [vaultName, setVaultName] = useState(''), [status, setStatus] = useState('');
 const [lifecycle,setLifecycle]=useState<any[]>([]),[itemLimit,setItemLimit]=useState(100),[vaultKind,setVaultKind]=useState('company');
 const [ownerTrust, setOwnerTrust] = useState<{ account: string; fingerprint: string } | null>(null), [links, setLinks] = useState<Map<string, number>>(new Map());
 const activeClient = useRef<any>(null), search = useRef<HTMLInputElement>(null), menu = useRef<HTMLDetailsElement>(null), generation = useRef(0);
 const lock = useCallback(() => { generation.current++; activeClient.current?.lock(); activeClient.current = null; setClient(null); setRecords([]); setVaults([]); setVault(''); setSelected(''); setQuery(''); setPanel(''); setCreate(false); setStatus(''); setOwnerTrust(null); setLinks(new Map()); }, []);
 const run = useCallback(async (work: () => Promise<unknown>) => {
  setPending(n => n + 1); setError('');
  try { await work(); } catch (cause) { if (['device_revoked', 'account_key_changed', 'authority_expired', 'locked'].includes((cause as any)?.code) || activeClient.current && (cause as any)?.status === 401) lock(); if (['not_found', 'permission_denied'].includes((cause as any)?.code)) { setRecords([]); setSelected(''); setPanel(''); } setError(message(cause)); } finally { setPending(n => n - 1); }
 }, [lock]);
 useEffect(() => {
  const keyboard = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.current?.focus(); } if (event.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } };
  // The More menu is a <details>: a click anywhere else closes it.
  const outside = (event: MouseEvent) => { if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false; };
  const leave = () => activeClient.current?.lock(), returnToPage = (event: PageTransitionEvent) => { if (event.persisted) lock(); }; window.addEventListener('keydown', keyboard); window.addEventListener('click', outside); window.addEventListener('pagehide', leave); window.addEventListener('pageshow', returnToPage);
  return () => { window.removeEventListener('keydown', keyboard); window.removeEventListener('click', outside); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', returnToPage); activeClient.current?.lock(); };
 }, []);
 const typed = client ? new TypedItems(client) : null;
 const load = async (connected: any, id: string, preferred = '', descriptor?: any) => {
  const ticket = ++generation.current;
  setRecords([]); setSelected(''); setVault(id); setPanel(''); setOwnerTrust(null); setLinks(new Map());
  const info = descriptor ?? vaults.find(v => v.id === id), owner = info?.owner;
  if (owner && !connected.profile.trusted[owner]) {
   const entry = await connected.call('directory', { account: owner });
   if (activeClient.current === connected && generation.current === ticket) setOwnerTrust({ account: owner, fingerprint: entry.fingerprint });
   return;
  }
  const result = await connected.readVault(id);
  // Share links are listed to accounts that may share from this vault.
  const [states, shared] = await Promise.all([connected.call('lifecycle/list',{vault:id}), sharer(info) ? connected.call('sharing/history', { vault: id, object: null }) : null]);
  if (activeClient.current !== connected || generation.current !== ticket) return;
  setLinks(activeLinks(shared?.links ?? []));
  const latest = new Map<string, ItemRecord>(); for (const row of result.versions) if (!latest.has(row.object) || latest.get(row.object)!.version < row.version) latest.set(row.object, row);
  const rows = [...latest.values()]; setRecords(rows);setLifecycle(states.items);
  const title = rows.find(row => row.value.schema === 'latchkey/vault-meta/v1')?.value.title;
  if (title) setVaults(previous => previous.map(v => v.id === id ? { ...v, title } : v));
  const inactive=new Set(states.items.filter((r:any)=>r.state!=='active').map((r:any)=>r.object));
  const items = rows.filter(row => row.value.schema === 'latchkey/item/v1'&&!inactive.has(row.object)); setSelected(items.some(row => row.object === preferred) ? preferred : items[0]?.object ?? '');
 };
 const onUnlock = async (connected: any) => {
  activeClient.current = connected; setClient(connected); setStatus('Vault unlocked');
  const list = await connected.call('vaults', {}); if (activeClient.current !== connected) return; setVaults(list); if (list.length) await load(connected, list[0].id, '', list[0]);
 };
 const refresh = async () => { setRecords([]); setSelected(''); setPanel(''); const list = await client.call('vaults', {}); setVaults(previous => list.map((next: any) => ({ ...next, title: previous.find(v => v.id === next.id)?.title }))); const id = list.some((v: any) => v.id === vault) ? vault : list[0]?.id; if (id) await load(client, id, selected, list.find((v: any) => v.id === id)); else { setRecords([]); setSelected(''); setVault(''); setPanel(''); } };
 const save = async (item: Item, row?: ItemRecord) => {
  let result;
  if (row) {
   const value = validateItem(item, item.template?.definition); value.change = { author: client.profile.account, time: new Date().toISOString(), action: 'edit' };
   if (new TextEncoder().encode(JSON.stringify(value)).length > 1000000) throw { code: 'item_too_large' };
   result = await client.put(vault, value, row.object, row.version);
  } else result = await typed.save(vault, item);
  await load(client, vault, row?.object ?? result.object); setStatus('Item saved');
 };
 const inactive=new Set(lifecycle.filter(r=>r.state!=='active').map(r=>r.object));
 const items = records.filter(row => row.value.schema === 'latchkey/item/v1'&&!inactive.has(row.object));
 const visible = items.filter(row => {
  const item = row.value; const safe = { title: item.title, type: item.type, tags: item.tags, labels: item.labels, fields: item.fields.filter(field => !field.secret).map(field => field.value) };
  return JSON.stringify(safe).toLocaleLowerCase().includes(query.toLocaleLowerCase());
 });
 const row = items.find(row => row.object === selected), templates = records.filter(row => row.value.schema === 'latchkey/template/v1');
 const current = vaults.find(v => v.id === vault), vaultView = !['received', 'people-erasure', 'reviews', 'projects', 'automation', 'evidence'].includes(panel);
 const show = (next: string, toggle = false) => { setPanel(toggle && panel === next ? '' : next); setCreate(false); if (menu.current) menu.current.open = false; };
 const editor = (panel === 'new' || panel === 'edit' && row) && <ItemEditor key={panel === 'new' ? `new:${vault}` : `${row!.object}:${row!.version}`} row={panel === 'edit' ? row : undefined} client={client} typed={typed} vault={vault} vaultKind={current?.kind ?? 'company'} templates={templates} run={run} busy={pending > 0} onSave={save} onCancel={() => setPanel('')}/>;
 return <div className="lk"><style>{vaultCss}</style><a className="skip" href="#vault-main">Skip to vault</a>
 <header className="topbar"><Lockup ground="white" href="/app/vault"/>
  {client ? <>{vaultView && vault && <label className="search"><Icon name="search"/><input ref={search} type="search" aria-label="Search vault" placeholder="Search vault…" value={query} maxLength={500} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></label>}
   <Tabs tabs={tabs} current={tabs.find(([name]) => name ? panel === name : vaultView)?.[1]} onPick={show}/>
   <details className="menu" ref={menu}><summary>More</summary><div className="menu-list">
    <button type="button" disabled={pending > 0} onClick={() => { setCreate(!create); if (menu.current) menu.current.open = false; }}>New vault</button>
    <button type="button" disabled={!vault} onClick={() => show('generator', true)}>Password generator</button>
    <button type="button" disabled={!vault} onClick={() => show('templates', true)}>Custom templates</button>
    <button type="button" disabled={!vault} onClick={() => show('organize')}>Find and organize</button>
    <button type="button" disabled={!vault} onClick={() => show('sharing', true)}>Share vault</button>
    <button type="button" onClick={() => show('people-erasure')}>Erase a person</button>
    <button type="button" onClick={() => { download('latchkey-profile.json', JSON.stringify(client.profile)); if (menu.current) menu.current.open = false; }}>Save updated profile</button>
    <a href="/contract">Documentation</a>
   </div></details>
   <button type="button" className="lock" onClick={lock}>Lock vault</button></> : <><span className="locked">Vault locked</span><a className="docs" href="/contract">Documentation</a></>}
 </header>
 <main className="page" id="vault-main">
  {error && <div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>Dismiss</button></div>}
  <p className="sr-only" role="status" aria-live="polite">{pending ? 'Working…' : status}</p>
  {!client ? <Unlock run={run} busy={pending > 0} onUnlock={onUnlock}/> : <>
   {vault && vaultView && <header className="page-head"><p className="crumbs"><span>Vaults</span><span aria-hidden="true">/</span><select className="vault-select" aria-label="Vault" value={vault} disabled={pending > 0} onChange={e => void run(async () => load(client, e.target.value))}>{vaults.map(v => <option key={v.id} value={v.id}>{vaultLabel(v)}</option>)}</select></p>
    <div className="head-text"><h1>{vaultLabel(current ?? { id: vault })}</h1><p className="subline">{kindLabel(current?.kind)} · {items.length === 1 ? '1 item' : `${items.length} items`}</p></div>
    <div className="head-actions"><button disabled={pending > 0} onClick={() => void run(refresh)}>Refresh</button><button className="primary" disabled={pending > 0 || !!ownerTrust} onClick={() => { setPanel('new'); setCreate(false); }}><Icon name="plus"/>New item</button></div></header>}
   {create && <form className="new-vault notice" onSubmit={e => { e.preventDefault(); void run(async () => { const name = vaultName.trim(); if (!name) throw { code: 'vault_name_required' }; const created = await client.createVault({kind:vaultKind}); await client.put(created.vault, { schema: 'latchkey/vault-meta/v1', title: name }); const list = await client.call('vaults', {}); setVaults(list); await load(client, created.vault); setCreate(false); setVaultName(''); }); }}><h2>New vault</h2><div className="form-grid"><label>Vault name<input required maxLength={500} value={vaultName} onChange={e => setVaultName(e.target.value)}/></label><label>Vault kind<select value={vaultKind} onChange={e=>setVaultKind(e.target.value)}><option value="company">Company</option><option value="private-work">Private work</option><option value="family">Family</option></select></label></div><p className="muted">Archive keeps history indefinitely. Moving an item to trash requires confirmation and permanently erases it after 30 days.</p><button className="primary" disabled={pending > 0}>Create vault</button></form>}
   {panel==='automation'&&<AutomationPanel client={client} vault={vault} run={run}/>}
   {panel==='projects'&&<ProjectsPanel client={client} run={run}/>}
   {panel==='organize'&&<OrganizationPanel client={client} vault={vault} run={run} names={Object.fromEntries(vaults.filter(v => v.title).map(v => [v.id, v.title]))} onNamed={(id: string, title: string) => setVaults(previous => previous.map(v => v.id === id ? { ...v, title } : v))} onChanged={async()=>{const fresh=await client.readVault(vault);const latest=new Map<string,ItemRecord>();for(const row of fresh.versions)if(!latest.has(row.object)||latest.get(row.object)!.version<row.version)latest.set(row.object,row);setRecords([...latest.values()]);setLifecycle((await client.call('lifecycle/list',{vault})).items)}}/>}
   {panel==='evidence'&&<EvidenceWorkspace client={client} vault={vault}/>}
   {panel === 'reviews' && <ReviewsPanel client={client} vault={vault} run={run}/>}
   {panel === 'people-erasure' && <PeopleErasure client={client} run={run}/>}
   {panel === 'received' && <ReceivedShares client={client}/>}
   {!vault && !['received','reviews','projects','automation','evidence'].includes(panel) && !pending && <section className="detail empty"><h1>Your vault starts here</h1><p>Create a vault to keep your logins, documents and other private items together.</p><button className="primary" onClick={() => setCreate(true)}>Create your first vault</button></section>}
   {!!pending && !records.length && vault && <div className="notice" role="status">Opening encrypted vault…</div>}
   {vault && !['received','people-erasure','reviews','organize','projects','automation','evidence'].includes(panel) && <>{ownerTrust ? <OwnerTrust owner={ownerTrust} client={client} run={run} onConfirmed={async () => { setOwnerTrust(null); await load(client, vault); }}/>: panel === 'generator' ? <Generator client={client} run={run}/> : panel === 'sharing' ? <section className="detail section" id="sharing"><h1>Share vault</h1><SharingPanel client={client} vault={vault}/></section> : panel === 'templates' ? <Templates templates={templates} typed={typed} vault={vault} run={run} onSaved={refresh} onClose={() => setPanel('')}/> : <>
    {panel === 'new' && editor}
    <ItemsHead/>
    <nav className="items" aria-label="Vault items">{visible.slice(0,itemLimit).map(item => { const open = selected === item.object; return <div className="row" key={item.object}><ItemRow row={item} links={links.get(item.object) ?? 0} open={open} onOpen={() => { setSelected(item.object); setPanel(''); }}/>
     {open && (panel === 'edit' ? editor : panel === '' && <ItemDetail key={`${vault}:${item.object}:${item.version}`} row={item} canErase={current?.owner === client.profile.account} typed={typed} client={client} vault={vault} run={run} onEdit={() => setPanel('edit')} onRefresh={refresh}/>)}</div>; })}
     {!visible.length && !pending && <div className="empty"><h2>{query ? 'No matching items' : 'No items yet'}</h2><p>{query ? 'Try another title, label or tag.' : 'Add your first item to this vault.'}</p></div>}{visible.length>itemLimit&&<button className="more" onClick={()=>setItemLimit(n=>n+100)}>Show more vault items</button>}</nav>
   </>}</>}
  </>}
 </main></div>;
}

// The top bar's destinations: panel, visible label and, where shorter, the panel's full name.
const tabs: [string, string, string?][] = [['', 'Vault'], ['received', 'Shared with me'], ['reviews', 'Access reviews'], ['evidence', 'Evidence', 'Company evidence'], ['projects', 'Projects', 'Projects and applications'], ['automation', 'Agent access', 'API and agent access']];
const sharer = (vault: any) => { const rights = typeof vault?.rights === 'string' ? JSON.parse(vault.rights) : vault?.rights ?? []; return rights.includes('read') && rights.includes('share'); };
// Links still openable, as the Sharing panel counts them "Active", by item.
function activeLinks(rows: any[]) {
 const counts = new Map<string, number>(), now = Date.now();
 for (const link of rows) if (link.revoked_at == null && link.expires_at > now && link.views < link.max_views) counts.set(link.object_id, (counts.get(link.object_id) ?? 0) + 1);
 return counts;
}
