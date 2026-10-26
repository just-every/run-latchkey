import { useEffect, useMemo, useState } from 'react';
import { AliasClient, pendingAlias, withAlias } from './client.mjs';
import type { AliasDomain, AliasMailbox, AliasRecord } from './client.mjs';
import { TokenField, aliasMessage, deliveryText } from './view';
import { validateItem } from '../ui/runtime.mjs';
import type { ItemRecord } from '../ui/types';

// Hide-my-email for one login: the generated address becomes the username and the relationship stays with the item.
export function ItemAlias({ client, vault, vaultKind, row, onSaved }: { client: any; vault: string; vaultKind: string; row: ItemRecord; onSaved: () => Promise<void> }) {
 const aliases = useMemo(() => new AliasClient(client), [client]), scope = vaultKind === 'company' ? 'company' : 'personal';
 const [domains, setDomains] = useState<AliasDomain[]>([]), [mailboxes, setMailboxes] = useState<AliasMailbox[]>([]), [current, setCurrent] = useState<AliasRecord | null>(null);
 const [domain, setDomain] = useState(''), [mailbox, setMailbox] = useState(''), [token, setToken] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
 const load = async () => {
  const [d, m, a] = await Promise.all([aliases.domains(), aliases.mailboxes(), aliases.list()]);
  setDomains(d.filter(x => x.scope === scope && x.active)); setMailboxes(m.filter(x => x.scope === scope && x.active && x.verifiedAt));
  setCurrent(a.find(x => x.vault === vault && x.object === row.object && ['pending', 'active', 'reconcile'].includes(x.state)) ?? null);
 };
 useEffect(() => { void load().catch(() => setError('Alias settings could not be loaded.')); }, [aliases, vault, row.object, row.version]);
 useEffect(() => { setDomain(previous => domains.some(x => x.id === previous) ? previous : domains[0]?.id ?? ''); setMailbox(previous => mailboxes.some(x => x.id === previous) ? previous : mailboxes[0]?.id ?? ''); }, [domains, mailboxes]);
 const act = async (work: () => Promise<string>) => { setBusy(true); setError(''); setStatus(''); try { setStatus(await work()); setToken(''); } catch (cause: any) { setError(aliasMessage(cause)); } finally { await load().catch(() => undefined); setBusy(false); } };
 const create = (replacing: AliasRecord | null) => act(async () => {
  const picked = { domain: domains.find(x => x.id === domain)!, mailbox: mailboxes.find(x => x.id === mailbox)! }, template = row.value.template?.definition;
  const stamp = (item: any) => { const next = validateItem(item, template); next.change = { author: client.profile.account, time: new Date().toISOString(), action: 'alias' }; return next; };
  let version = row.version;
  const made = await aliases.create({ vault, object: row.object, ...picked, replaces: replacing?.id ?? null, token,
   prepare: async entry => { version = (await client.put(vault, stamp(pendingAlias(row.value, entry)), row.object, version)).version; } });
  // The login keeps working: only its username and alias records change.
  await client.put(vault, stamp(withAlias(row.value, made)), row.object, version);
  if (replacing) await aliases.disable(replacing, { token });
  await onSaved();
  return replacing ? 'New alias saved with this login. The old alias no longer forwards.' : 'Alias created and saved with this login.';
 });
 const ready = !!domain && !!mailbox && !!token && !busy;
 return <section className="section" aria-label="Hide my email"><h2>Hide my email</h2>
  {current && <p>Alias {row.value.aliases?.find((entry: any) => entry.id === current.id)?.address ?? 'saved with this login'}: {current.state === 'active' ? (current.forwarding === 'configured' ? 'forwarding configured at the provider' : 'forwarding unavailable') : current.state}. {deliveryText(current.delivery, current.deliveryReportedAt)}.{current.failure && ` ${aliasMessage({ code: current.failure })}`}</p>}
  {!domains.length || !mailboxes.length ? <p className="muted">Add a ready forwarding domain and a verified mailbox under Settings, Email aliases, before creating an alias.</p> : <div className="form-grid">
   <label>Forwarding domain<select value={domain} disabled={busy} onChange={event => setDomain(event.target.value)}>{domains.map(x => <option key={x.id} value={x.id}>{x.domain}</option>)}</select></label>
   <label>Approved mailbox<select value={mailbox} disabled={busy} onChange={event => setMailbox(event.target.value)}>{mailboxes.map(x => <option key={x.id} value={x.id}>{x.address}</option>)}</select></label>
   <TokenField value={token} onChange={setToken} disabled={busy}/></div>}
  {domains.length > 0 && mailboxes.length > 0 && <div className="actions">{current?.state === 'active' ? <button disabled={!ready} onClick={() => void create(current)}>Replace alias</button> : !current && <button disabled={!ready} onClick={() => void create(null)}>Create alias and use as username</button>}</div>}
  {error && <p role="alert" className="error">{error}</p>}{status && <p role="status">{status}</p>}
 </section>;
}
