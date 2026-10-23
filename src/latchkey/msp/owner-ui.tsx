import { useEffect, useRef, useState } from 'react';
import { parsePublicProviderIdentity, type PublicProviderIdentity } from './client.mjs';
import { download, message } from '../ui/types';

type Grant = { id: string; provider: string; consoleOrigin: string; scopes: string[]; expiresAt: number; revokedAt: number | null };
type Props = { client: any; run: (work: () => Promise<unknown>) => Promise<void> };
const when = (value: number) => new Date(value).toLocaleString();

export function MspOwnerPanel({ client, run }: Props) {
 const [events, setEvents] = useState<any[]>([]);
 const [grants, setGrants] = useState<Grant[]>([]), [identity, setIdentity] = useState<PublicProviderIdentity | null>(null);
 const [template, setTemplate] = useState(false), [consent, setConsent] = useState(false), [days, setDays] = useState(30), [delegation, setDelegation] = useState<unknown>(null);
 const [commercial, setCommercial] = useState<{ status: string; reference?: string }>({ status: 'not_recorded' }), [commercialStatus, setCommercialStatus] = useState('trial'), [reference, setReference] = useState(''), [commercialConsent, setCommercialConsent] = useState(false);
 const [revoke, setRevoke] = useState(''), [independent, setIndependent] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [status, setStatus] = useState('');
 const generation = useRef(0), identityRequest = useRef(0);
 const refresh = async (token = generation.current) => {
  const result = await client.call('msp/list', {});
  if (token !== generation.current) return;
  setGrants(result.delegations); setCommercial(result.commercial); setEvents(result.events);
 };
 useEffect(() => {
  const token = ++generation.current;
  identityRequest.current++; setLoading(true); setGrants([]); setIdentity(null); setDelegation(null); setError(''); setStatus(''); setConsent(false); setIndependent(false); setRevoke(''); setCommercialConsent(false);
  void refresh(token).catch(cause => { if (generation.current === token) setError(message(cause)); }).finally(() => { if (generation.current === token) setLoading(false); });
  return () => { generation.current++; };
 }, [client]);
 const act = async (work: () => Promise<unknown>, success: string) => {
  const token = generation.current;
  setBusy(true); setError(''); setStatus('');
  try { await run(async () => {
   try { await work(); await refresh(token); if (token === generation.current) setStatus(success); }
   catch (cause) { if (token === generation.current) setError(message(cause)); throw cause; }
  }); } finally { if (token === generation.current) setBusy(false); }
 };
 return <section className="detail section" aria-label="Service provider delegation" aria-busy={loading || busy}>
  <h1>Service provider</h1>
  <p className="muted">Delegate company metadata and optional restrictive sharing policy changes. Providers receive no vault keys, item contents, runtime grants or export authority.</p>
  {error && <div className="error" role="alert">{error}</div>}{status && <p className="notice" role="status">{status}</p>}
  {loading && <p role="status">Loading provider delegations…</p>}{busy && <p role="status">Updating provider delegation…</p>}
  <button disabled={busy || loading} onClick={() => void act(async () => {}, 'Provider delegations refreshed.')}>Refresh delegations</button>
  <form className="tool-box" onSubmit={event => {
   event.preventDefault(); if (!identity || !consent) return;
   void act(async () => {
    const result = await client.call('msp/grant', { ...identity, scopes: template ? ['summary', 'template'] : ['summary'], expiresAt: Date.now() + days * 86400000, confirmed: true });
    setDelegation(result); setConsent(false);
   }, 'Delegation created. Download its file and give it to the named provider.');
  }}>
   <h2>Authorize a provider</h2>
   <label>Provider public identity JSON<input type="file" accept="application/json,.json" disabled={busy || loading} onChange={event => {
    const file = event.target.files?.[0], token = generation.current, ticket = ++identityRequest.current; setIdentity(null); setConsent(false); setDelegation(null); setError('');
    if (file) void (async () => { if (file.size > 16384) throw { code: 'identity_file_too_large' }; const result = await parsePublicProviderIdentity(JSON.parse(await file.text())); if (token === generation.current && ticket === identityRequest.current) setIdentity(result); })().catch(cause => { if (token === generation.current && ticket === identityRequest.current) setError(message(cause)); });
   }}/></label>
   {identity && <div className="notice fingerprint"><p>Provider: {identity.provider}</p><p>Console: {identity.consoleOrigin}</p><p>Public signing key: {identity.publicKey}</p><p>Verify this public identity with the provider through a trusted channel before authorizing it.</p></div>}
   <label>Delegation duration (days, maximum 90)<input type="number" required min={1} max={90} step={1} value={days} disabled={busy} onChange={event => { setDays(Number(event.target.value)); setConsent(false); }}/></label>
   <label className="check"><input type="checkbox" checked={template} disabled={busy} onChange={event => { setTemplate(event.target.checked); setConsent(false); }}/>Also allow template scope: preview and apply only stricter external sharing policy.</label>
   <label className="check"><input type="checkbox" checked={consent} disabled={busy || !identity} onChange={event => setConsent(event.target.checked)}/>I authorize this provider’s summary scope to read company membership, enrollment, policy and commercial metadata{template ? ', and template scope to tighten external sharing policy' : ''} for {days} days.</label>
   <button className="primary" disabled={busy || loading || !identity || !consent || !Number.isInteger(days) || days < 1 || days > 90}>Create delegation</button>
  </form>
  {delegation != null && <div className="notice"><p>Delegation file ready. This file identifies the permitted company and scopes; the provider must also hold its matching private signing key.</p><button onClick={() => download('latchkey-provider-delegation.json', JSON.stringify(delegation, null, 2))}>Download delegation file</button></div>}
  <details><summary>Provider policy audit ({events.length})</summary>{events.map(event => <p className="fingerprint" key={event.id}>{event.action} · {when(event.occurredAt)} · Operation {event.operation} · Provider {event.provider}</p>)}</details>
  <h2>Delegations</h2>
  {!loading && grants.length === 0 && <p className="empty">No provider delegations.</p>}
  {grants.map(grant => <article className="definition" key={grant.id}><h3>Provider {grant.provider}</h3><p className="fingerprint">Delegation: {grant.id}<br/>Console: {grant.consoleOrigin}</p><p>Scopes: {grant.scopes.join(', ')}. Expires: {when(grant.expiresAt)}.</p><p>{grant.revokedAt ? `Revoked ${when(grant.revokedAt)}` : grant.expiresAt <= Date.now() ? 'Expired' : 'Active'}</p>
   {!grant.revokedAt && grant.expiresAt > Date.now() && <><label className="check"><input type="checkbox" disabled={busy} checked={revoke === grant.id} onChange={event => setRevoke(event.target.checked ? grant.id : '')}/>Revoke this delegation’s future metadata and policy access.</label><button disabled={busy || revoke !== grant.id} onClick={() => void act(async () => { await client.call('msp/revoke', { delegation: grant.id, confirmed: true }); setRevoke(''); setDelegation(null); }, 'Delegation revoked.')}>Revoke delegation</button></>}
  </article>)}
  <div className="tool-box"><h2>Operate independently</h2><p>Revoke every provider delegation. Your company retains its own vaults and account authority.</p><label className="check"><input type="checkbox" disabled={busy || loading} checked={independent} onChange={event => setIndependent(event.target.checked)}/>I want to revoke all providers and operate independently.</label><button className="danger" disabled={busy || loading || !independent} onClick={() => void act(async () => { await client.call('msp/independent', { confirmed: true }); setIndependent(false); setDelegation(null); }, 'All provider delegations revoked. Your company operates independently.')}>Remove all provider access</button></div>
  <form className="tool-box" onSubmit={event => { event.preventDefault(); if (!commercialConsent) return; void act(async () => { await client.call('msp/commercial', { status: commercialStatus, reference: reference.trim(), confirmed: true }); setCommercialConsent(false); }, 'Owner commercial record updated.'); }}>
   <h2>Owner commercial record</h2><p>Recorded status: {commercial.status}. {commercial.reference && <>Reference: {commercial.reference}.</>} No price or billing relationship is inferred.</p>
   <label>Commercial status<select className="vault-select" value={commercialStatus} disabled={busy} onChange={event => { setCommercialStatus(event.target.value); setCommercialConsent(false); }}><option value="trial">Trial</option><option value="active">Active</option><option value="cancelled">Cancelled</option></select></label>
   <label>Commercial reference (metadata only; no secrets)<input maxLength={100} value={reference} disabled={busy} onChange={event => { setReference(event.target.value); setCommercialConsent(false); }}/></label>
   <label className="check"><input type="checkbox" checked={commercialConsent} disabled={busy || loading} onChange={event => setCommercialConsent(event.target.checked)}/>I confirm this owner-recorded commercial status and reference.</label><button disabled={busy || loading || !commercialConsent}>Save commercial record</button>
  </form>
 </section>;
}
