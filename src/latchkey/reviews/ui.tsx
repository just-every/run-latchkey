import { useEffect, useRef, useState } from 'react';
import { download, message } from '../ui/types';
import { EvidencePanel } from '../evidence/ui';

type Person = { account: string; name: string; role: string };
type Grant = { key: string; kind: string; subject: string; sponsor?: string | null; rights: unknown; group: string | null; status: string; privileged: boolean; reviewer: string; decision: string | null; reason: string | null; effective: boolean };
type Campaign = { id: string; vault: string; owner: string; phase: string; asOf: number | null; dueAt: number; period: string; policyVersion: string; enforcement?: { mfa?: unknown }; rows: Grant[]; changes: { key: string; kind: string; subject: string; status: string; rights: unknown }[]; overdue: boolean; completeness: { total: number; decided: number; removals: number; pendingRemovals: number; unreconciled: number } };
type CampaignSummary = { id: string; phase: string; scheduled_at: number; due_at: number; created_at: number };
type Action = (work: (() => Promise<unknown>) | null, success: string) => Promise<void>;
const when = (value: number | null) => value == null ? 'Not captured yet' : new Date(value).toLocaleString();
const text = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value);
const isComplete = (phase: string) => phase === 'closed';

function GrantReview({ client, row, review, people, account, owner, busy, active, act }: { client: any; row: Grant; review: string; people: Person[]; account: string; owner: boolean; busy: boolean; active: boolean; act: Action }) {
 const [reviewer, setReviewer] = useState(row.reviewer), [decision, setDecision] = useState('confirm'), [reason, setReason] = useState('');
 const ownAccess = row.subject === account || row.sponsor === account;
 const assigned = row.reviewer === account;
 return <article className="definition fingerprint" aria-label={`Grant ${row.key}`}>
  <h2>{row.kind} access</h2>
  <div className="form-grid">
   <div className="rule-view"><span>Grant reference</span><span>{row.key}</span></div>
   <div className="rule-view"><span>Subject account</span><span>{row.subject}</span></div>
   {row.sponsor && <div className="rule-view"><span>Sponsor account</span><span>{row.sponsor}</span></div>}
   <div className="rule-view"><span>Exact rights</span><span>{text(row.rights)}</span></div>
   <div className="rule-view"><span>Inherited group</span><span>{row.group ?? 'None'}</span></div>
   <div className="rule-view"><span>Snapshot status</span><span>{row.status}{row.privileged ? ' · Privileged' : ''}</span></div>
   <div className="rule-view"><span>Assigned reviewer</span><span>{people.find(person => person.account === row.reviewer)?.name ?? (row.reviewer ? 'Reviewer' : 'Unassigned')}{row.reviewer && <> · {row.reviewer}</>}</span></div>
  </div>
  <p className="notice"><span className={`status ${!row.decision ? 'waiting' : row.decision === 'remove' && !row.effective ? 'action' : 'done'}`} aria-hidden="true"/>Decision: {row.decision ?? 'Undecided'}. {row.reason && <>Reason: {row.reason}. </>}{row.decision === 'remove' && (row.effective ? 'Removal is effective.' : 'Removal is pending; access has not been recorded as removed.')}</p>
  {owner && active && !row.decision && <form onSubmit={event => { event.preventDefault(); void act(() => client.call('reviews/assign', { review, key: row.key, reviewer }), 'Reviewer assigned.'); }}>
   <label>Reviewer for {row.key}<select className="vault-select" required disabled={busy} value={reviewer ?? ''} onChange={event => setReviewer(event.target.value)}><option value="">Choose reviewer</option>{people.map(person => <option key={person.account} value={person.account}>{person.name} · {person.account} ({person.role})</option>)}</select></label>
   <button disabled={busy || !reviewer || reviewer === row.reviewer}>Assign reviewer</button>
  </form>}
  {assigned && active && !row.decision && <form className="tool-box" onSubmit={event => { event.preventDefault(); if (!reason.trim() || decision === 'confirm' && ownAccess) return; void act(() => client.call('reviews/decide', { review, key: row.key, decision, reason: reason.trim() }), 'Decision recorded.'); }}>
   {ownAccess && <p className="notice">You are the subject or sponsor of this access. Independent review is required to confirm it; ask the owner to assign another reviewer.</p>}
   <label>Decision for {row.key}<select className="vault-select" disabled={busy} value={decision} onChange={event => setDecision(event.target.value)}><option value="confirm" disabled={ownAccess}>Confirm access</option><option value="remove">Remove access</option></select></label>
   <label>Decision reason for {row.key}<textarea required maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)}/></label>
   <button disabled={busy || !reason.trim() || decision === 'confirm' && ownAccess}>Record decision</button>
  </form>}
  {owner && active && row.decision === 'remove' && !row.effective && <div className="tool-box"><p>Apply this removal to grant {row.key}, subject {row.subject}, with rights {text(row.rights)}. This changes live access and may rekey the vault.</p><button disabled={busy} onClick={() => void act(async () => { const { ReviewClient } = await import('./client.mjs'); await new ReviewClient(client).applyRemoval(review, row.key); }, 'Removal applied and campaign refreshed.')}>Apply removal</button></div>}
 </article>;
}

export function ReviewsPanel({ client, vault, run }: any) {
 const [people, setPeople] = useState<Person[]>([]), [campaigns, setCampaigns] = useState<CampaignSummary[]>([]), [selected, setSelected] = useState(''), [campaign, setCampaign] = useState<Campaign | null>(null);
 const [vaultOwner, setVaultOwner] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [stale, setStale] = useState(false);
 const [reviewer, setReviewer] = useState(''), [scheduleAt, setScheduleAt] = useState(''), [dueAt, setDueAt] = useState(''), [period, setPeriod] = useState(''), [destination, setDestination] = useState('evidence');
 const context = useRef(0), request = useRef(0);
 const account = client.profile.account;
 const refresh = async (preferred: string, token = context.current) => {
  const ticket = ++request.current;
  const [members, records, vaults] = await Promise.all([client.call('reviews/people', {}), client.call('reviews/list', { vault: vault || null }), client.call('vaults', {})]);
  const id = records.some((row: CampaignSummary) => row.id === preferred) ? preferred : records[0]?.id ?? '';
  const detail = id ? await client.call('reviews/get', { review: id }) : null;
  if (token !== context.current || ticket !== request.current) return;
  setPeople(members); setCampaigns(records); setVaultOwner(vaults.find((row: any) => row.id === vault)?.owner ?? ''); setSelected(id); setCampaign(detail); setStale(false);
 };
 useEffect(() => {
  const token = ++context.current;
  setLoading(true); setCampaign(null); setCampaigns([]); setPeople([]); setSelected(''); setVaultOwner(''); setReviewer(''); setError(''); setStatus(''); setStale(false); setBusy(false);
  void refresh('', token).catch(cause => { if (token === context.current) setError(message(cause)); }).finally(() => { if (token === context.current) setLoading(false); });
  return () => { context.current++; request.current++; };
 }, [client, vault]);
 const act: Action = async (work, success) => {
  const token = context.current;
  setBusy(true); setError(''); setStatus('');
  const execute = async () => {
   try { const result: any = work ? await work() : null; if (token !== context.current) return; await refresh(result?.selectedReview ?? selected, token); if (token === context.current) setStatus(success); }
   catch (cause) { if (token === context.current) { setError(message(cause)); setStale(true); } throw cause; }
  };
  try { await run(execute); } finally { if (token === context.current) setBusy(false); }
 };
 const chooseCampaign = async (id: string) => {
  const token = context.current, ticket = ++request.current;
  setSelected(id); setCampaign(null); setLoading(true); setError(''); setStatus(''); setStale(false);
  try { const detail = await client.call('reviews/get', { review: id }); if (token === context.current && ticket === request.current) setCampaign(detail); }
  catch (cause) { if (token === context.current && ticket === request.current) setError(message(cause)); }
  finally { if (token === context.current && ticket === request.current) setLoading(false); }
 };
 const owner = (campaign?.owner ?? vaultOwner) === account;
 const complete = !!campaign && isComplete(campaign.phase);
 const active = !!campaign && campaign.phase === 'open' && !stale;
 const counts = campaign?.completeness;
 const canClose = active && !!counts && counts.decided === counts.total && counts.pendingRemovals === 0 && counts.unreconciled === 0 && campaign!.changes.length === 0;
 return <section className="detail section" aria-label="Access reviews" aria-busy={busy || loading}>
  <h1>Access reviews</h1><p className="muted">Review the exact access snapshot, record reasons and apply removals before closing a campaign.</p>
  {error && <div className="error" role="alert"><span>{error}</span></div>}
  {status && <p className="notice" role="status">{status}</p>}
  {loading && <p className="loading" role="status">Loading access reviews…</p>}
  {busy && <p className="loading" role="status">Updating access review…</p>}
  <div className="actions"><button disabled={busy || loading} onClick={() => void act(null, 'Access reviews refreshed.')}>Refresh reviews</button></div>
  {stale && <p className="notice" role="alert">The last action could not be verified. Refresh to inspect current campaign and grant state before trying another change.</p>}
  {!loading && !error && campaigns.length === 0 && <div className="empty"><h2>No access reviews</h2><p>{owner ? 'Schedule the first review for this vault.' : 'The vault owner has not scheduled a review.'}</p></div>}
  {campaigns.length > 0 && <label>Campaign<select aria-label="Campaign" className="vault-select" disabled={busy || loading} value={selected} onChange={event => void chooseCampaign(event.target.value)}>{campaigns.map(row => <option key={row.id} value={row.id}>{row.id} · {row.phase} · due {when(row.due_at)}</option>)}</select></label>}
  {!loading && vaultOwner === account && <details className="tool-box"><summary>Schedule an owner-led review</summary><form onSubmit={event => {
   event.preventDefault();
   void act(async () => { const created = await client.call('reviews/create', { vault, reviewer, scheduleAt: scheduleAt ? new Date(scheduleAt).getTime() : Date.now(), dueAt: new Date(dueAt).getTime(), period: period.trim() }); setPeriod(''); setScheduleAt(''); setDueAt(''); return { selectedReview: created.id }; }, 'Review campaign scheduled.');
  }}>
   <label>Review period<input required maxLength={120} value={period} disabled={busy} onChange={event => setPeriod(event.target.value)}/></label>
   <label>Initial reviewer<select className="vault-select" required disabled={busy} value={reviewer} onChange={event => setReviewer(event.target.value)}><option value="">Choose reviewer</option>{people.map(person => <option key={person.account} value={person.account}>{person.name} · {person.account} ({person.role})</option>)}</select></label>
   <div className="form-grid"><label>Start at (local time; blank starts now)<input type="datetime-local" disabled={busy} value={scheduleAt} onChange={event => setScheduleAt(event.target.value)}/></label><label>Due at (local time)<input type="datetime-local" required disabled={busy} min={scheduleAt || undefined} value={dueAt} onChange={event => setDueAt(event.target.value)}/></label></div>
   <button className="add" disabled={busy || stale}>Schedule review</button>
  </form></details>}
  {campaign && <>
   <div className="notice"><h2>{complete ? 'Completed review' : campaign.phase === 'scheduled' ? 'Scheduled review' : campaign.phase === 'inactive' ? 'Inactive restored review' : 'Review in progress'}</h2><div className="rule-view"><span>Campaign</span><span>{campaign.id}</span></div><p>Period: {campaign.period}. Snapshot: {when(campaign.asOf)}. Due: {when(campaign.dueAt)}. Policy version: {campaign.policyVersion}.</p><p>Owner: {campaign.owner}. Phase: {campaign.phase}.</p>
    <p>MFA enforcement: {campaign.enforcement?.mfa == null || campaign.enforcement.mfa === 'unknown' ? 'Unknown (no enforcement evidence reported)' : text(campaign.enforcement.mfa)}.</p>
    {campaign.overdue && !complete && <p role="alert">Overdue: this review still needs the owner’s attention.</p>}
    <div className="progress"><progress max={Math.max(counts!.total, 1)} value={counts!.decided} aria-labelledby="review-progress"/><span className="progress-count" id="review-progress">{counts!.decided} of {counts!.total} grants decided</span></div>
    <p>{counts!.removals} removal decisions; {counts!.pendingRemovals} pending removals; {counts!.unreconciled} unreconciled changes.</p>
    {complete && <p>All required decisions and effective removals were recorded at closure.</p>}
   </div>
   {(campaign.changes.length > 0 || counts!.unreconciled > 0) && <div className="notice" role="alert"><h2>Campaign reconciliation required</h2><p>Access, membership or policy changes must be reconciled explicitly. Closure is blocked until the current campaign state is reviewed.</p>{campaign.changes.map(change => <div className="definition" key={change.key}><div className="rule-view"><span>{change.kind} · {change.status}</span><span>Grant: {change.key}. Subject: {change.subject}. Rights: {text(change.rights)}.</span></div></div>)}
    {owner && !complete && <form onSubmit={event => { event.preventDefault(); void act(() => client.call('reviews/reconcile', { review: campaign.id, reviewer }), 'Current access reconciled. Review new or changed grants.'); }}><label>Reviewer for reconciled grants<select className="vault-select" required disabled={busy || stale} value={reviewer} onChange={event => setReviewer(event.target.value)}><option value="">Choose reviewer</option>{people.map(person => <option key={person.account} value={person.account}>{person.name} · {person.account}</option>)}</select></label><button disabled={busy || stale || !reviewer}>Reconcile current access</button></form>}
   </div>}
   {!campaign.rows.length && <p className="notice">This campaign snapshot contains no grants.</p>}
   {campaign.rows.map(row => <GrantReview key={`${campaign.id}:${row.key}:${row.reviewer}:${row.decision}`} client={client} row={row} review={campaign.id} people={people} account={account} owner={owner} busy={busy || loading} active={active} act={act}/>)}
   {owner && !complete && <div className="tool-box"><div className="actions"><button disabled={busy || stale || !campaign.overdue} onClick={() => void act(() => client.call('reviews/remind', { review: campaign.id }), 'Reminder request recorded. Delivery is tracked separately.')}>Remind overdue reviewers</button><button className="primary" disabled={busy || !canClose} onClick={() => void act(() => client.call('reviews/close', { review: campaign.id }), 'Review closed with effective removals.')}>Close review</button></div>{!canClose && <p className="muted">Closure requires an active campaign, a decision for every grant, effective removals and no unreconciled access changes.</p>}</div>}
   <details className="tool-box"><summary>Signed evidence package</summary><p>The package includes grant metadata, reviewer identities, reasons, policy version, snapshot time and completeness. Credential values are excluded. Downloading a package does not submit it to a provider or indicate provider acceptance or certification.</p><label>Evidence destination<select className="vault-select" value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}><option value="evidence">Evidence</option><option value="vanta">Vanta</option><option value="drata">Drata</option><option value="secureframe">Secureframe</option></select></label><button disabled={busy || stale || !complete} onClick={() => void act(async () => { const { ReviewClient } = await import('./client.mjs'); const signed = await new ReviewClient(client).export(campaign.id, destination); download(`latchkey-review-${campaign.id}-${destination}.json`, JSON.stringify(signed, null, 2)); }, 'Signed evidence package downloaded. No provider submission has been made.')}>Download signed package</button>{!complete && <p className="muted">Complete and close the review before downloading its signed result.</p>}</details>
   {complete && owner && <EvidencePanel client={client} review={campaign.id}/>}
  </>}
 </section>;
}
