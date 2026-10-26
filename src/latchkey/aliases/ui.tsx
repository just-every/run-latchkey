import { useEffect, useMemo, useState } from 'react';
import { AliasClient } from './client.mjs';
import type { AliasDomain, AliasMailbox, AliasRecord } from './client.mjs';
import { TokenField, aliasMessage, deliveryText, when } from './view';
import { download, type ItemRecord } from '../ui/types';

const scopes = [['personal', 'Personal'], ['company', 'Company (installation owner)']] as const;
function Row({ children }: { children: React.ReactNode }) { return <article className="definition">{children}</article>; }

// Domains, mailboxes and every alias the caller may see, with the provider's own state and exact failures.
export function AliasPanel({ client, vault, records }: { client: any; vault: string; records: ItemRecord[] }) {
 const aliases = useMemo(() => new AliasClient(client), [client]);
 const [domains, setDomains] = useState<AliasDomain[]>([]), [mailboxes, setMailboxes] = useState<AliasMailbox[]>([]), [list, setList] = useState<AliasRecord[]>([]);
 const [token, setToken] = useState(''), [scope, setScope] = useState<'personal' | 'company'>('personal'), [zone, setZone] = useState(''), [account, setAccount] = useState(''), [address, setAddress] = useState(''), [ask, setAsk] = useState(true), [target, setTarget] = useState<Record<string, string>>({});
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
 const load = async () => { const [d, m, a] = await Promise.all([aliases.domains(), aliases.mailboxes(), aliases.list()]); setDomains(d); setMailboxes(m); setList(a); };
 useEffect(() => { void load().catch(() => setError('Alias settings could not be loaded.')); }, [aliases]);
 const act = async (work: () => Promise<string>) => { setBusy(true); setError(''); setStatus(''); try { setStatus(await work()); } catch (cause: any) { setError(aliasMessage(cause)); } finally { await load().catch(() => undefined); setBusy(false); } };
 const titles = new Map<string, any>(records.filter(r => r.value.schema === 'latchkey/item/v1').map(r => [r.object, r.value])), known = new Map<string, string>(records.flatMap(r => (r.value.aliases ?? []).map((entry: any): [string, string] => [entry.id, entry.address])));
 const live = (kind: string, id: string) => (kind === 'domain' ? domains : mailboxes).find(row => row.id === id);
 return <section className="detail section" aria-labelledby="alias-title"><h1 id="alias-title">Email aliases</h1>
  <p>Hide-my-email aliases forward through your own Cloudflare Email Routing. Latchkey keeps the login and the alias relationship; it never hosts, reads or stores your mail. Mail arrival is something you report, because the provider gives no receipt.</p>
  {error && <p role="alert" className="error">{error}</p>}{status && <p role="status">{status}</p>}
  <TokenField value={token} onChange={setToken} disabled={busy}/>
  <section className="tool-box" aria-label="Forwarding domains"><h2>Forwarding domains</h2>
   {domains.length === 0 && <p className="muted">No forwarding domain yet.</p>}
   {domains.map(row => <Row key={row.id}><p><strong>{row.domain}</strong> · {row.scope === 'company' ? 'Company' : 'Personal'} · {row.active ? 'Ready' : 'Not usable'}</p><p>Provider reports routing {row.routingEnabled ? 'enabled' : 'disabled'}, status {row.providerStatus}, checked {when(row.observedAt)}.</p>
    <div className="actions"><button disabled={busy || !token} onClick={() => void act(async () => { await aliases.saveDomain({ scope: row.scope, zone: row.zone, token }); return `${row.domain} checked.`; })}>Check {row.domain} again</button>{row.active && <button disabled={busy} onClick={() => void act(async () => { await aliases.revokeDomain(row); return `${row.domain} will not be used for new aliases.`; })}>Stop using {row.domain}</button>}</div></Row>)}
   <form onSubmit={event => { event.preventDefault(); void act(async () => { const saved = await aliases.saveDomain({ scope, zone, token }); setZone(''); return `${saved.domain} added.`; }); }}><div className="form-grid">
    <label>Ownership<select value={scope} disabled={busy} onChange={event => setScope(event.target.value as 'personal' | 'company')}>{scopes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Cloudflare zone ID<input required pattern="[0-9a-f]{32}" disabled={busy} value={zone} onChange={event => setZone(event.target.value)}/></label></div><button disabled={busy || !token}>Add forwarding domain</button></form></section>
  <section className="tool-box" aria-label="Approved mailboxes"><h2>Approved mailboxes</h2>
   {mailboxes.length === 0 && <p className="muted">No approved mailbox yet.</p>}
   {mailboxes.map(row => <Row key={row.id}><p><strong>{row.address}</strong> · {row.scope === 'company' ? 'Company' : 'Personal'} · {row.verifiedAt ? `Verified by the provider ${when(row.verifiedAt)}` : 'Not verified by the provider yet'}{!row.active && ' · Not approved'}</p>
    <div className="actions"><button disabled={busy || !token || !account} onClick={() => void act(async () => { await aliases.saveMailbox({ scope: row.scope, account, address: row.address, token }); return `${row.address} checked.`; })}>Check {row.address} again</button>{row.active && <button disabled={busy} onClick={() => void act(async () => { await aliases.revokeMailbox(row); return `${row.address} is no longer approved for new aliases.`; })}>Stop using {row.address}</button>}</div></Row>)}
   <form onSubmit={event => { event.preventDefault(); void act(async () => { const saved = await aliases.saveMailbox({ scope, account, address, token, requestVerification: ask }); setAddress(''); return saved.verifiedAt ? `${saved.address} is verified.` : `${saved.address} saved. It stays unusable until you open the provider’s verification message and check again.`; }); }}><div className="form-grid">
    <label>Cloudflare account ID<input required pattern="[0-9a-f]{32}" disabled={busy} value={account} onChange={event => setAccount(event.target.value)}/></label>
    <label>Mailbox address<input required type="email" disabled={busy} value={address} onChange={event => setAddress(event.target.value)}/></label>
    <label className="check"><input type="checkbox" checked={ask} disabled={busy} onChange={event => setAsk(event.target.checked)}/>Ask the provider to send its verification message</label></div><button disabled={busy || !token}>Add mailbox</button></form></section>
  <section className="tool-box" aria-label="Aliases"><h2>Aliases</h2>{list.length === 0 && <p className="muted">No aliases yet. Create one from a login.</p>}
   {list.map(row => { const item = titles.get(row.object), mailbox = row.mailbox; return <Row key={row.id}><p><strong>{known.get(row.id) ?? 'Alias'}</strong> · {row.scope === 'company' ? 'Company' : 'Personal'} · {item?.title ?? 'Login in another vault'}</p>
    <p>Forwarding: {row.forwarding}{row.failure ? ` · ${aliasMessage({ code: row.failure })}` : ''}. To {mailbox?.address ?? 'unknown'}{mailbox && !mailbox.active ? ' (no longer approved)' : ''}. {deliveryText(row.delivery, row.deliveryReportedAt)}.</p>
    {row.domain && !row.domain.active && <p>Depends on {row.domain.domain} at the provider, which is {row.domain.providerStatus}.</p>}
    {row.state === 'active' && <div className="actions">
     {row.canManage && <button disabled={busy || !token} onClick={() => void act(async () => { await aliases.disable(row, { token }); return 'Forwarding stopped at the provider. The login is unchanged.'; })}>Disable {known.get(row.id) ?? 'alias'}</button>}
     <button disabled={busy} onClick={() => void act(async () => { await aliases.reportDelivery(row, 'received'); return 'Recorded as received, by your report.'; })}>Mail arrived</button><button disabled={busy} onClick={() => void act(async () => { await aliases.reportDelivery(row, 'not-received'); return 'Recorded as not received.'; })}>Mail did not arrive</button></div>}
    {row.state === 'active' && row.canRetarget && <div className="actions"><label>Forward to<select aria-label={`Forward ${known.get(row.id) ?? 'alias'} to`} value={target[row.id] ?? ''} disabled={busy} onChange={event => setTarget({ ...target, [row.id]: event.target.value })}><option value="">Choose a mailbox</option>{mailboxes.filter(m => m.scope === row.scope && m.active && m.verifiedAt && m.id !== row.mailbox?.id).map(m => <option key={m.id} value={m.id}>{m.address}</option>)}</select></label><button disabled={busy || !token || !target[row.id]} onClick={() => void act(async () => { await aliases.retarget(row, live('mailbox', target[row.id]) as AliasMailbox, { token }); return 'Forwarding now goes to the chosen mailbox.'; })}>Change mailbox</button></div>}
    {row.state === 'reconcile' && row.canManage && <button disabled={busy || !token} onClick={() => void act(async () => { await aliases.reconcile(row, { address: known.get(row.id), token }); return 'Checked at the provider.'; })}>Check at the provider</button>}
   </Row>; })}</section>
  <section className="tool-box" aria-label="Alias export"><h2>Export</h2><p>Company and personal aliases are exported separately. Company export is for the installation owner.</p>
   <div className="actions">{scopes.map(([value, label]) => <button key={value} disabled={busy} onClick={() => void act(async () => { const result = await aliases.export(value, async () => records); download(`latchkey-${value}-aliases.json`, JSON.stringify(result, null, 1)); return `${label} alias export saved.`; })}>Export {value} aliases</button>)}</div></section>
 </section>;
}
