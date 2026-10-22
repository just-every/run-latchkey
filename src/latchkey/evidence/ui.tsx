import { useEffect, useMemo, useRef, useState } from 'react';
import { EvidenceClient, type EvidenceDelivery, type EvidenceDestination, type EvidencePreview } from './client.mjs';

const providers = [ ['evidence', 'Evidence', ''], ['vanta', 'Vanta', 'https://api.vanta.com'], ['drata', 'Drata', 'https://public-api.drata.com'], ['secureframe', 'Secureframe', 'https://api.secureframe.com'] ] as const;
const when = (value: string | number | undefined) => value == null ? 'Unknown' : new Date(value).toLocaleString();
type Work = (operation: () => Promise<unknown>, success: string) => Promise<void>;

function DestinationConfig({ name, label, endpoint: initialEndpoint, rows, busy, evidence, act }: {name:EvidenceDestination['destination'];label:string;endpoint:string;rows:EvidenceDestination[];busy:boolean;evidence:EvidenceClient;act:Work}) {
 const [endpoint, setEndpoint] = useState(initialEndpoint), [target, setTarget] = useState(''), [workspace, setWorkspace] = useState('');
 return <details className="tool-box"><summary>{label} destination settings</summary>
  <form onSubmit={event => { event.preventDefault(); void act(() => evidence.configure({ destination: name, endpoint, target, workspace: name === 'drata' ? workspace : null }), `${label} destination configured.`); }}>
   <label>{label} endpoint origin<input type="url" required disabled={busy} value={endpoint} onChange={event => setEndpoint(event.target.value)}/></label>
   <label>{label} {name === 'drata' ? 'evidence name' : name === 'evidence' ? 'requirement ID' : name === 'vanta' ? 'document ID' : 'test ID'}<input required disabled={busy} value={target} onChange={event => setTarget(event.target.value)}/></label>
   {name === 'drata' && <label>Drata workspace ID<input inputMode="numeric" pattern="[0-9]+" required disabled={busy} value={workspace} onChange={event => setWorkspace(event.target.value)}/></label>}
   <button disabled={busy}>Configure {label}</button>
  </form>
  {rows.map(row => <article className="definition" key={row.id}><p>{row.endpoint} · {row.target}{row.workspace != null && ` · Workspace ${row.workspace}`}</p><p>{row.active ? 'Authorized' : 'Revoked'} · revision {row.revision}</p>{row.active && <button disabled={busy} onClick={() => void act(() => evidence.revoke(row), `${label} authorization revoked. Future dispatch requires fresh authorization.`)}>Revoke {label} destination</button>}</article>)}
 </details>;
}

export function EvidencePanel({ client, review }: {client:any;review:string | {id:string}}) {
 const reviewId = typeof review === 'string' ? review : review.id;
 const evidence = useMemo(() => new EvidenceClient(client), [client]);
 const [destinations, setDestinations] = useState<EvidenceDestination[]>([]), [deliveries, setDeliveries] = useState<EvidenceDelivery[]>([]);
 const [selected, setSelected] = useState(''), [preview, setPreview] = useState<EvidencePreview | null>(null), [consent, setConsent] = useState(false);
 const [credential, setCredential] = useState(''), [apiKey, setApiKey] = useState(''), [keySecret, setKeySecret] = useState('');
 const [owner, setOwner] = useState(false), [closed, setClosed] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
 const generation = useRef(0), blocked = useRef(false);
 const clearApproval = () => { setPreview(null); setConsent(false); setCredential(''); setApiKey(''); setKeySecret(''); };
 const refresh = async (ticket: number) => {
  const campaign = await client.call('reviews/get', { review: reviewId });
  if (ticket !== generation.current) return;
  const isOwner = campaign.owner === client.profile.account;
  setOwner(isOwner); setClosed(campaign.phase === 'closed');
  if (!isOwner) { setDestinations([]); setDeliveries([]); return; }
  const [configs, records] = await Promise.all([evidence.destinations(), evidence.deliveries(reviewId)]);
  if (ticket !== generation.current) return;
  setDestinations(configs); setDeliveries(records);
  setSelected(current => configs.some(row => row.id === current && row.active) ? current : configs.find(row => row.active)?.id ?? '');
 };
 useEffect(() => {
  const ticket = ++generation.current;
  setLoading(true); setOwner(false); setClosed(false); setDestinations([]); setDeliveries([]); setSelected(''); clearApproval(); setError(''); setStatus('');
  void refresh(ticket).catch(() => { if (ticket === generation.current) setError('Evidence settings could not be loaded. Refresh to inspect current state.'); }).finally(() => { if (ticket === generation.current) setLoading(false); });
  return () => { generation.current++; };
 }, [client, reviewId]);
 const act: Work = async (operation, success) => {
  if (blocked.current) return;
  const ticket = generation.current;
  blocked.current = true; setBusy(true); setError(''); setStatus('');
  try {
   await operation();
   if (ticket !== generation.current) return;
   clearApproval(); await refresh(ticket); if (ticket === generation.current) setStatus(success);
  } catch (cause: any) {
   if (ticket !== generation.current) return;
   clearApproval();
   if (cause?.delivery) setDeliveries(current => [{ ...cause.delivery, phase: 'pending', state: 'backlog', resultUnconfirmed: true }, ...current.filter(row => row.id !== cause.delivery.id)]);
   setError(cause?.message === 'evidence_result_not_saved' ? 'Provider outcome could not be saved. The local delivery remains pending. Inspect the provider before dispatching again.' : 'The evidence action could not be verified. Refresh and preview again before sending.');
  } finally { blocked.current = false; if (ticket === generation.current) setBusy(false); }
 };
 const destination = destinations.find(row => row.id === selected);
 const choose = (id: string) => { setSelected(id); clearApproval(); setError(''); setStatus(''); };
 const makePreview = async () => {
  if (!destination || blocked.current) return;
  const ticket = generation.current;
  blocked.current = true; setBusy(true); setError(''); clearApproval();
  try { const value = await evidence.preview(reviewId, destination); if (ticket === generation.current) setPreview(value); }
  catch { if (ticket === generation.current) setError('The signed package could not be matched to the current destination preview. Refresh and try again.'); }
  finally { blocked.current = false; if (ticket === generation.current) setBusy(false); }
 };
 return <section className="tool-box" aria-label="Evidence delivery" aria-busy={busy || loading}>
  <h2>Access-review evidence delivery</h2>
  <p>Send a completed review’s signed metadata to an independently authorized destination. Acceptance is a client-reported provider transport result; it is not auditor approval or certification.</p>
  {error && <p className="error" role="alert">{error}</p>}{status && <p className="notice" role="status">{status}</p>}
  {loading ? <p role="status">Loading evidence destinations…</p> : !owner ? <p className="notice">Only the review owner can configure or send this evidence.</p> : <>
   <button disabled={busy} onClick={() => void act(async () => {}, 'Evidence destinations and deliveries refreshed.')}>Refresh evidence deliveries</button>
   {providers.map(([name, label, endpoint]) => <DestinationConfig key={`${reviewId}:${name}`} name={name} label={label} endpoint={endpoint} rows={destinations.filter(row => row.destination === name)} busy={busy} evidence={evidence} act={act}/>)}
   {!closed && <p className="notice">Close the review with every decision and removal effective before preparing evidence.</p>}
   <label>Delivery destination<select className="vault-select" disabled={busy} value={selected} onChange={event => choose(event.target.value)}><option value="">Choose an authorized destination</option>{destinations.filter(row => row.active).map(row => <option value={row.id} key={row.id}>{providers.find(([name]) => name === row.destination)?.[1]} · {row.target} · {row.endpoint}</option>)}</select></label>
   <button disabled={busy || !closed || !destination?.active} onClick={() => void makePreview()}>Preview exact evidence fields</button>
   {preview && <div className="definition">
    <h3>Approved disclosure preview</h3><p>Destination: {preview.destination.endpoint}. Target: {preview.destination.target}. Authorization revision: {preview.destination.revision}. Source timestamp: {when(preview.sourceTimestamp)}.</p>
    <p>Exact review-package fields: {preview.fields.join(', ')}.</p><p>Package hash: <code className="fingerprint">{preview.packageHash}</code></p>
    <p>The outbound signed envelope also includes its schema, destination, signer, authority key and signature, shown below. Review the complete metadata before approving.</p>
    <details><summary>Exact signed JSON to send</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(preview.signedPackage, null, 2)}</pre></details>
    {preview.destination.destination === 'secureframe' ? <><label>Secureframe API key<input type="password" autoComplete="off" disabled={busy} value={apiKey} onChange={event => setApiKey(event.target.value)}/></label><label>Secureframe key secret<input type="password" autoComplete="off" disabled={busy} value={keySecret} onChange={event => setKeySecret(event.target.value)}/></label></> : <label>{preview.destination.destination === 'vanta' ? 'Vanta OAuth access token' : 'Destination API token'}<input type="password" autoComplete="off" disabled={busy} value={credential} onChange={event => setCredential(event.target.value)}/></label>}
    <p className="muted">Credentials stay in this panel’s memory and are cleared after sending or changing the preview.</p>
    <label className="check"><input type="checkbox" disabled={busy} checked={consent} onChange={event => setConsent(event.target.checked)}/>I approve these exact fields and this signed package for this destination.</label>
    <button disabled={busy || !consent || (preview.destination.destination === 'secureframe' ? !apiKey || !keySecret : !credential)} onClick={() => { const current = preview, authorization = current.destination.destination === 'secureframe' ? { apiKey, keySecret } : credential; void act(() => evidence.send(current, authorization, consent), 'Delivery outcome recorded. Review the provider reference and state below.'); }}>Send signed evidence</button>
   </div>}
   <h3>Delivery obligations</h3>
   {deliveries.length === 0 && <p>No review evidence deliveries have been started.</p>}
   {deliveries.map(row => <article className="definition" key={row.id}><p>Delivery {row.id} · {row.state ?? row.phase ?? 'pending'}{row.resultUnconfirmed ? ' · Provider outcome not saved' : ''}</p><p>Source timestamp: {when(row.sourceTimestamp)}. Provider reference: {row.providerReference ?? 'Unknown'}.</p><p>Retryable at the failed stage: {row.retryable === true ? 'Yes' : 'No; inspect current provider state before another dispatch'}. Stage: {typeof row.stage === 'object' ? row.stage?.name ?? 'Unknown' : row.stage ?? 'Not dispatched'}. HTTP status: {row.status ?? 'Unknown'}.</p></article>)}
  </>}
 </section>;
}
