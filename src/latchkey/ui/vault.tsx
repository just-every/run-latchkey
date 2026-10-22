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
import { SharingPanel } from '../sharing/ui';
import { vaultCss } from './styles';
import { OwnerTrust } from './owner-trust';

export function VaultScreen() {
 const [client, setClient] = useState<any>(null), [vaults, setVaults] = useState<any[]>([]), [vault, setVault] = useState(''), [records, setRecords] = useState<ItemRecord[]>([]), [selected, setSelected] = useState('');
 const [query, setQuery] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(0), [panel, setPanel] = useState(''), [create, setCreate] = useState(false), [vaultName, setVaultName] = useState(''), [status, setStatus] = useState('');
 const [ownerTrust, setOwnerTrust] = useState<{ account: string; fingerprint: string } | null>(null);
 const activeClient = useRef<any>(null), search = useRef<HTMLInputElement>(null), generation = useRef(0);
 const lock = useCallback(() => { generation.current++; activeClient.current?.lock(); activeClient.current = null; setClient(null); setRecords([]); setVaults([]); setVault(''); setSelected(''); setQuery(''); setPanel(''); setCreate(false); setStatus(''); setOwnerTrust(null); }, []);
 const run = useCallback(async (work: () => Promise<unknown>) => {
  setPending(n => n + 1); setError('');
  try { await work(); } catch (cause) { if (['device_revoked', 'account_key_changed', 'authority_expired', 'locked'].includes((cause as any)?.code) || activeClient.current && (cause as any)?.status === 401) lock(); if (['not_found', 'permission_denied'].includes((cause as any)?.code)) { setRecords([]); setSelected(''); setPanel(''); } setError(message(cause)); } finally { setPending(n => n - 1); }
 }, [lock]);
 useEffect(() => {
  const keyboard = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.current?.focus(); } };
  const leave = () => activeClient.current?.lock(), returnToPage = (event: PageTransitionEvent) => { if (event.persisted) lock(); }; window.addEventListener('keydown', keyboard); window.addEventListener('pagehide', leave); window.addEventListener('pageshow', returnToPage);
  return () => { window.removeEventListener('keydown', keyboard); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', returnToPage); activeClient.current?.lock(); };
 }, []);
 const typed = client ? new TypedItems(client) : null;
 const load = async (connected: any, id: string, preferred = '', descriptor?: any) => {
  const ticket = ++generation.current;
  setRecords([]); setSelected(''); setVault(id); setPanel(''); setOwnerTrust(null);
  const owner = (descriptor ?? vaults.find(v => v.id === id))?.owner;
  if (owner && !connected.profile.trusted[owner]) {
   const entry = await connected.call('directory', { account: owner });
   if (activeClient.current === connected && generation.current === ticket) setOwnerTrust({ account: owner, fingerprint: entry.fingerprint });
   return;
  }
  const result = await connected.readVault(id);
  if (activeClient.current !== connected || generation.current !== ticket) return;
  const latest = new Map<string, ItemRecord>(); for (const row of result.versions) if (!latest.has(row.object) || latest.get(row.object)!.version < row.version) latest.set(row.object, row);
  const rows = [...latest.values()]; setRecords(rows);
  const title = rows.find(row => row.value.schema === 'latchkey/vault-meta/v1')?.value.title;
  if (title) setVaults(previous => previous.map(v => v.id === id ? { ...v, title } : v));
  const items = rows.filter(row => row.value.schema === 'latchkey/item/v1'); setSelected(items.some(row => row.object === preferred) ? preferred : items[0]?.object ?? '');
 };
 const onUnlock = async (connected: any) => {
  activeClient.current = connected; setClient(connected); setStatus('Vault unlocked');
  const list = await connected.call('vaults', {}); if (activeClient.current !== connected) return; setVaults(list); if (list.length) await load(connected, list[0].id, '', list[0]);
 };
 const refresh = async () => { const list = await client.call('vaults', {}); setVaults(previous => list.map((next: any) => ({ ...next, title: previous.find(v => v.id === next.id)?.title }))); const id = list.some((v: any) => v.id === vault) ? vault : list[0]?.id; if (id) await load(client, id, selected, list.find((v: any) => v.id === id)); else { setRecords([]); setSelected(''); setVault(''); setPanel(''); } };
 const save = async (item: Item, row?: ItemRecord) => {
  let result;
  if (row) {
   const value = validateItem(item, item.template?.definition); value.change = { author: client.profile.account, time: new Date().toISOString(), action: 'edit' };
   if (new TextEncoder().encode(JSON.stringify(value)).length > 1000000) throw { code: 'item_too_large' };
   result = await client.put(vault, value, row.object, row.version);
  } else result = await typed.save(vault, item);
  await load(client, vault, row?.object ?? result.object); setStatus('Item saved');
 };
 const items = records.filter(row => row.value.schema === 'latchkey/item/v1');
 const visible = items.filter(row => {
  const item = row.value; const safe = { title: item.title, type: item.type, tags: item.tags, labels: item.labels, fields: item.fields.filter(field => !field.secret).map(field => field.value) };
  return JSON.stringify(safe).toLocaleLowerCase().includes(query.toLocaleLowerCase());
 });
 const row = items.find(row => row.object === selected), templates = records.filter(row => row.value.schema === 'latchkey/template/v1');
 return <div className="lk"><style>{vaultCss}</style><a className="skip" href="#vault-main">Skip to vault</a><div className="layout"><aside className="sidebar"><nav aria-label="Main navigation"><a className="nav-link active" href="/app/vault" aria-current="page"><Icon name="lock"/><span>Vault</span><Icon name="chevron" className="chevron"/></a><a className="nav-link" href="/contract"><Icon name="file"/><span>Documentation</span></a></nav>{client && <div className="sidebar-tools"><button disabled={!vault} onClick={() => { setPanel(panel === 'generator' ? '' : 'generator'); setCreate(false); }}>Password generator</button><button disabled={!vault} onClick={() => { setPanel(panel === 'templates' ? '' : 'templates'); setCreate(false); }}>Custom templates</button><button disabled={!vault} onClick={() => { setPanel(panel === 'sharing' ? '' : 'sharing'); setCreate(false); }}>Share vault</button><button onClick={() => { setPanel('reviews'); setCreate(false); }}>Access reviews</button><button onClick={() => { setPanel('received'); setCreate(false); }}>Shared with me</button><button onClick={() => { setPanel('people-erasure'); setCreate(false); }}>Erase a person</button><button onClick={() => download('latchkey-profile.json', JSON.stringify(client.profile))}>Save updated profile</button><button onClick={lock}><Icon name="lock"/>Lock vault</button></div>}</aside>
 <main className="main" id="vault-main"><header className="toolbar"><span className="status"><Icon name="lock"/>{client ? 'Vault unlocked' : 'Vault locked'}</span>{client && <><select className="vault-select" aria-label="Vault" value={vault} disabled={pending > 0} onChange={e => void run(async () => load(client, e.target.value))}>{!vaults.length && <option value="">No vaults</option>}{vaults.map(v => <option key={v.id} value={v.id}>{v.title ?? `Vault · ${v.id.slice(0, 8)}`}</option>)}</select><label className="search"><Icon name="search"/><input ref={search} type="search" aria-label="Search vault" placeholder="Search vault…" value={query} maxLength={500} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></label></>}</header>
  {error && <div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>Dismiss</button></div>}
  <p className="sr-only" role="status" aria-live="polite">{pending ? 'Working…' : status}</p>
  {!client ? <Unlock run={run} busy={pending > 0} onUnlock={onUnlock}/> : <>
   <div className="vault-actions"><button disabled={pending > 0} onClick={() => setCreate(!create)}><Icon name="plus"/>New vault</button>{vault && <><button disabled={pending > 0 || !!ownerTrust} onClick={() => { setPanel('new'); setCreate(false); }}><Icon name="plus"/>New item</button><button disabled={pending > 0} onClick={() => void run(refresh)}>Refresh</button></>}</div>
   {create && <form className="new-vault notice" onSubmit={e => { e.preventDefault(); void run(async () => { const name = vaultName.trim(); if (!name) throw { code: 'vault_name_required' }; const created = await client.createVault(); await client.put(created.vault, { schema: 'latchkey/vault-meta/v1', title: name }); const list = await client.call('vaults', {}); setVaults(list); await load(client, created.vault); setCreate(false); setVaultName(''); }); }}><label>Vault name<input required maxLength={500} value={vaultName} onChange={e => setVaultName(e.target.value)}/></label><button className="primary" disabled={pending > 0}>Create vault</button></form>}
   {panel === 'reviews' && <ReviewsPanel client={client} vault={vault} run={run}/>}
   {panel === 'people-erasure' && <PeopleErasure client={client} run={run}/>}
   {panel === 'received' && <ReceivedShares client={client}/>}
   {!vault && !['received','reviews'].includes(panel) && !pending && <section className="detail empty"><Icon name="lock"/><h1>Your vault starts here</h1><p>Create a vault to keep your logins, documents and other private items together.</p><button className="add" onClick={() => setCreate(true)}>Create your first vault</button></section>}
   {!!pending && !records.length && vault && <div className="notice" role="status">Opening encrypted vault…</div>}
   {vault && !['received','people-erasure','reviews'].includes(panel) && <>{ownerTrust ? <OwnerTrust owner={ownerTrust} client={client} run={run} onConfirmed={async () => { setOwnerTrust(null); await load(client, vault); }}/>: panel === 'generator' ? <Generator client={client} run={run}/> : panel === 'sharing' ? <section className="detail section" id="sharing"><h1>Share vault</h1><SharingPanel client={client} vault={vault}/></section> : panel === 'templates' ? <Templates templates={templates} typed={typed} vault={vault} run={run} onSaved={refresh} onClose={() => setPanel('')}/> : <>
    <nav className="items" aria-label="Vault items">{visible.map(item => <button className={`item${selected === item.object ? ' selected' : ''}`} key={item.object} onClick={() => { setSelected(item.object); setPanel(''); }} aria-current={selected === item.object ? 'true' : undefined}><Icon name={item.value.type === 'login' ? 'globe' : item.value.type === 'card' ? 'card' : 'file'}/><span className="item-text"><span>{item.value.title}</span><small>{String(item.value.fields.find(field => !field.secret && ['username', 'email', 'accountHolder', 'description'].includes(field.id))?.value ?? item.value.type.replaceAll('-', ' '))}</small></span><Icon name="chevron" className="chevron"/></button>)}{!visible.length && !pending && <div className="empty"><h2>{query ? 'No matching items' : 'No items yet'}</h2><p>{query ? 'Try another title, label or tag.' : 'Add your first item to this vault.'}</p></div>}</nav>
    {panel === 'new' || panel === 'edit' && row ? <ItemEditor key={panel === 'new' ? 'new' : `${row!.object}:${row!.version}`} row={panel === 'edit' ? row : undefined} client={client} typed={typed} vault={vault} templates={templates} run={run} busy={pending > 0} onSave={save} onCancel={() => setPanel('')}/> : row && <ItemDetail key={`${vault}:${row.object}:${row.version}`} row={row} canErase={vaults.find(v => v.id === vault)?.owner === client.profile.account} typed={typed} client={client} vault={vault} run={run} onEdit={() => setPanel('edit')} onRefresh={refresh}/>}
   </>}</>}
  </>}
 </main></div></div>;
}
