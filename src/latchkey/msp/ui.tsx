import { useRef, useState } from 'react';
import { createProviderIdentity, FleetClient, parseDelegation, parseProviderIdentity, publicProviderIdentity, type Delegation, type FleetPolicy, type FleetPreview, type FleetSummary, type ProviderIdentity } from './client.mjs';
import { download, message } from '../ui/types';
import { vaultCss } from '../ui/styles';
import { marks } from '../../site/shell/Lockup';

type ClientRow = { grant: Delegation; selected: boolean; summary?: FleetSummary; preview?: FleetPreview; error?: string; outcome?: string };
const template: FleetPolicy = { externalEnabled: false, domains: [], defaultDays: 1, maxDays: 1 };
const when = (time: number) => new Date(time).toLocaleString();
const policyText = (policy: FleetPolicy) => `External sharing ${policy.externalEnabled ? 'enabled' : 'disabled'}; domains: ${policy.domains.join(', ') || 'none'}; default ${policy.defaultDays} day(s); maximum ${policy.maxDays} day(s).`;
async function readFile(file: File, maximum = 32768) {
 if (file.size > maximum) throw { code: 'file_too_large' };
 return JSON.parse(await file.text());
}

function CompanyMetadata({ summary }: { summary: FleetSummary }) {
 return <div className="section">
  <p className="muted">Observed {when(summary.observedAt)} · Revision {summary.revision ?? 'Initial policy'}</p>
  <div className="form-grid"><div><h3>Onboarding</h3><p>Active: {summary.onboarding.active}. Invited: {summary.onboarding.invited}. Suspended: {summary.onboarding.suspended}. Enrolled: {summary.onboarding.enrolled}.</p></div><div><h3>Commercial record</h3><p>{summary.commercial.status}{summary.commercial.reference && <> · {summary.commercial.reference}</>}</p></div></div>
  <p>Health coverage: {summary.health.coverage}. {summary.health.reason}</p>
  {summary.health.capturedVaults !== undefined && <div className="notice"><h3>Observed company expiry</h3><p>Current captured company vaults: {summary.health.capturedVaults}. Stale vault captures: {summary.health.staleVaults}. Observed expired items: {summary.health.expiredItems}.</p><p>Coverage reflects current, owner-captured expiry metadata only. Uncaptured vaults, missing expiry dates and other credential risks remain unknown.</p>{summary.health.atRiskMembers?.length ? <><h3>Members with observed expired items</h3>{summary.health.atRiskMembers.map(member => <p className="fingerprint" key={member.reference}>{member.reference} · {member.expiredItems} observed expired item(s)</p>)}</> : <p>No members with expired items were observed in the current captured source.</p>}</div>}
  <p>Adoption coverage: {summary.adoption.coverage}. {summary.adoption.reason}</p>
  {summary.adoption.coverage === 'observed-password-authentication' && <div className="notice"><h3>Password authentication in the last 30 days</h3><p>{summary.adoption.authenticatedMembers} of {summary.adoption.activeMembers} active members have observed successful password authentication.</p>{summary.adoption.windowStart !== undefined && summary.adoption.observedAt !== undefined && <p>Window: {when(summary.adoption.windowStart)} to {when(summary.adoption.observedAt)}.</p>}<p>This measures password authentication only. Vault fill, credential use and MFA coverage remain unknown.</p></div>}
  <p>Sharing policy: {policyText(summary.policy)}</p>
  <details><summary>Member onboarding metadata ({summary.members.length})</summary>{summary.members.length ? summary.members.map(member => <p className="fingerprint" key={member.reference}>{member.reference} · {member.status} · {member.enrolled ? 'Enrolled' : 'Not enrolled'}</p>) : <p>No member metadata reported.</p>}</details>
  <p>Policy exceptions: {summary.exceptions.length === 0 ? 'None reported.' : `${summary.exceptions.length} reported; review with the company owner.`}</p>
 </div>;
}

export function FleetScreen() {
 const [identity, setIdentity] = useState<ProviderIdentity | null>(null), [rows, setRows] = useState<ClientRow[]>([]);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [approved, setApproved] = useState(false), [previewed, setPreviewed] = useState(false);
 const fileInput = useRef<HTMLInputElement>(null);
 const invalidate = () => { setApproved(false); setPreviewed(false); setStatus(''); setRows(current => current.map(row => ({ ...row, preview: undefined, outcome: row.preview ? undefined : row.outcome }))); };
 const work = async (execute: () => Promise<void>) => {
  setBusy(true); setError(''); setStatus('');
  try { await execute(); } catch (cause) { setError(message(cause)); }
  finally { setBusy(false); }
 };
 const useIdentity = (next: ProviderIdentity | null) => { setIdentity(next); setRows([]); setApproved(false); setPreviewed(false); if (fileInput.current) fileInput.current.value = ''; };
 const client = () => { if (!identity) throw { code: 'provider_identity_required' }; return new FleetClient(identity); };
 const refresh = async () => {
  const api = client(); setApproved(false); setPreviewed(false);
  const results = await Promise.all(rows.map(async row => {
   try { return { ...row, summary: await api.summary(row.grant), preview: undefined, error: undefined, outcome: 'Summary refreshed.' }; }
   catch (cause) { return { ...row, summary: undefined, preview: undefined, error: message(cause), outcome: undefined }; }
  }));
  setRows(results); const count = results.filter(row => !row.error).length;
  setStatus(count === results.length ? `All ${count} company summaries refreshed.` : `${count} of ${results.length} company summaries refreshed. Each failure is shown below.`);
 };
 const preview = async () => {
  const api = client(); setApproved(false); setPreviewed(false);
  const results = await Promise.all(rows.map(async row => {
   if (!row.selected) return { ...row, preview: undefined };
   try {
    const summary = await api.summary(row.grant);
    const result = await api.preview(row.grant, template);
    return { ...row, summary, preview: result, error: undefined, outcome: 'Preview ready; no policy change applied.' };
   } catch (cause) { return { ...row, preview: undefined, error: message(cause), outcome: undefined }; }
  }));
  setRows(results); setPreviewed(true);
  const selected = results.filter(row => row.selected), count = selected.filter(row => row.preview).length;
  setStatus(count === selected.length ? `All ${count} selected company previews are ready. Review the exact changes before approving.` : `${count} of ${selected.length} previews are ready. Failed companies will not be applied.`);
 };
 const refreshCompany = async (row: ClientRow) => {
  const api = client(); invalidate();
  try {
   const summary = await api.summary(row.grant);
   setRows(current => current.map(other => other.grant === row.grant ? { ...other, summary, preview: undefined, error: undefined, outcome: 'Summary refreshed.' } : other));
  } catch (cause) {
   setRows(current => current.map(other => other.grant === row.grant ? { ...other, summary: undefined, preview: undefined, error: message(cause), outcome: undefined } : other));
  }
 };
 const apply = async () => {
  if (!approved || !previewed) return;
  const api = client(); setApproved(false); setPreviewed(false);
  const eligible = rows.filter(row => row.selected && row.preview).length;
  const results = await Promise.all(rows.map(async row => {
   if (!row.selected || !row.preview) return row;
   try {
    const result = await api.apply(row.grant, row.preview);
    return { ...row, summary: undefined, preview: undefined, error: undefined, outcome: `Policy applied. Operation ${result.operation}. ${policyText(result.policy)}` };
   } catch (cause) { return { ...row, preview: undefined, error: message(cause), outcome: 'Policy application was not verified. Refresh to inspect current state before trying again.' }; }
  }));
  setRows(results); const count = results.filter(row => row.selected && row.outcome?.startsWith('Policy applied.')).length;
  setStatus(count === eligible ? `${count} of ${rows.filter(row => row.selected).length} selected companies applied successfully. Refresh for current summaries.` : `${count} of ${eligible} approved companies applied successfully. Review each failure below and refresh before another preview.`);
 };
 const selected = rows.filter(row => row.selected), ready = selected.filter(row => row.preview);
 return <div className="lk"><style>{vaultCss}</style><a className="skip" href="#fleet-main">Skip to fleet</a>
  <header className="topbar"><a className="lockup" href="/app/vault"><img className="lockup-mark" src={marks.white} alt="" width={248} height={100}/><span className="lockup-word" data-rer-name>Latchkey</span></a><span className="locked">Provider fleet</span><a className="docs" href="/app/vault">Open own vault</a></header>
  <main className="page" id="fleet-main"><section className="detail section" aria-label="Provider fleet" aria-busy={busy}>
   <h1>Company fleet</h1><p className="muted">Use owner-authorized metadata to oversee independent companies. Each company’s delegation and policy results remain separate.</p>
   {error && <div className="error" role="alert">{error}</div>}{status && <p className="notice" role="status">{status}</p>}{busy && <p role="status">Working with company delegations…</p>}
   <details className="tool-box" open={!identity}><summary>Provider signing identity</summary><p>Import a private identity file or create one for this console origin. The private key stays in this page’s memory until you clear it or close the page. Keep the downloaded private file in secure custody. Nothing is saved in browser storage.</p>
    <div className="actions"><button disabled={busy} onClick={() => void work(async () => { const next = await createProviderIdentity(location.origin); useIdentity(next); download('latchkey-provider-private.json', JSON.stringify(next, null, 2)); setStatus('Provider identity created and private file downloaded. Download the public identity for company owners.'); })}>Create identity and download private file</button>{identity && <button disabled={busy} onClick={() => { useIdentity(null); setStatus('Provider identity and company portfolio cleared from this page.'); }}>Clear identity and portfolio</button>}</div>
    <label>Import provider private identity JSON<input type="file" accept="application/json,.json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void work(async () => { useIdentity(await parseProviderIdentity(await readFile(file), location.origin)); setStatus('Provider identity loaded. Import company delegation files.'); }); }}/></label>
    {identity && <div className="notice fingerprint"><p>Provider: {identity.provider}</p><p>Console origin: {identity.origin}</p><p>Public signing key: {identity.publicKey}</p><button disabled={busy} onClick={() => download('latchkey-provider-public.json', JSON.stringify(publicProviderIdentity(identity), null, 2))}>Download public identity for company owner</button></div>}
   </details>
   {!identity && <div className="empty"><h2>No provider identity loaded</h2><p>Create or import your provider identity to load explicit company delegations.</p></div>}
   {identity && <>
    <label>Import company delegation JSON files<input ref={fileInput} type="file" multiple accept="application/json,.json" disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void work(async () => {
     invalidate(); let next = [...rows]; const failures: string[] = [];
     for (const file of files) {
      try { const grant = parseDelegation(await readFile(file), identity); if (next.some(row => row.grant.origin === grant.origin && row.grant.delegation === grant.delegation)) continue; next.push({ grant, selected: false }); }
      catch (cause) { failures.push(message(cause)); }
     }
     setRows(next.map(row => ({ ...row, preview: undefined }))); if (failures.length) setError(`${failures.length} delegation file(s) refused: ${failures.join('; ')}`); setStatus(`${next.length} company delegation(s) loaded. Refresh to retrieve live metadata.`);
    }); }}/></label>
    {rows.length === 0 ? <div className="empty"><h2>No companies loaded</h2><p>Each company owner must create a delegation for your public identity. Import those files explicitly.</p></div> : <>
     <div className="actions"><button disabled={busy} onClick={() => void work(refresh)}>Refresh all companies</button><button disabled={busy} onClick={() => { setRows([]); setApproved(false); setPreviewed(false); setStatus('Company portfolio cleared from memory.'); }}>Clear company portfolio</button></div>
     <div className="tool-box"><h2>Restrictive sharing template</h2><p>{policyText(template)} This template can only restrict the company’s existing sharing policy. Owners retain the ability to revoke access.</p><button disabled={busy || selected.length === 0} onClick={() => void work(preview)}>Refresh and preview selected companies</button>
      {previewed && <><p>{ready.length} of {selected.length} selected companies have previews ready. Only those exact previews can be applied.</p><label className="check"><input type="checkbox" disabled={busy || !ready.length} checked={approved} onChange={event => setApproved(event.target.checked)}/>I reviewed each before and after policy below and approve applying the {ready.length} successful previews.</label><button className="primary" disabled={busy || !approved || !ready.length} onClick={() => void work(apply)}>Apply approved previews</button></>}
     </div>
     {rows.map(row => <article className="definition" key={`${row.grant.origin}:${row.grant.delegation}`}>
      <h2>Company {row.grant.tenant}</h2><p className="fingerprint">Installation: {row.grant.origin}<br/>Delegation: {row.grant.delegation}</p><p>Scopes: {row.grant.scopes.join(', ')}. Expires {when(row.grant.expiresAt)}.</p>
      <label className="check"><input type="checkbox" disabled={busy || !row.grant.scopes.includes('template')} checked={row.selected} onChange={event => { const checked = event.target.checked; invalidate(); setRows(current => current.map(other => other.grant === row.grant ? { ...other, selected: checked, preview: undefined } : other)); }}/>Select this company for restrictive policy preview{!row.grant.scopes.includes('template') && ' (template scope not authorized)'}</label>
      {row.error && <div className="error" role="alert">{row.error}</div>}{row.outcome && <p className="notice" role="status">{row.outcome}</p>}{row.summary ? <CompanyMetadata summary={row.summary}/> : <p className="muted">No current summary. Refresh this company’s metadata before relying on its state.</p>}
      {row.preview && <div className="notice"><h3>Exact policy preview</h3><p>Before: {policyText(row.preview.before)}</p><p>After: {policyText(row.preview.after)}</p><p>Revision: {row.preview.revision}. Expires {when(row.preview.expiresAt)}.</p><p className="fingerprint">Preview: {row.preview.id}<br/>Hash: {row.preview.hash}</p></div>}
      <div className="actions"><button disabled={busy} onClick={() => void work(() => refreshCompany(row))}>Refresh this company</button><button disabled={busy} onClick={() => { invalidate(); setRows(current => current.filter(other => other.grant !== row.grant)); }}>Remove company from this portfolio</button></div>
     </article>)}
    </>}
   </>}
  </section></main>
 </div>;
}
