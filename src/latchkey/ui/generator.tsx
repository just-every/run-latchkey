import { useEffect, useRef, useState } from 'react';
import { BrowserHistoryStorage, effectivePolicy, generatePassphrase, generatePassword, GeneratorHistory, generatorHistoryKey } from './runtime.mjs';
import { copy, download, type Task } from './types';
import { GeneratorPolicyForm } from './generator-policy';
const cancelledOperation = Symbol('generator closed');

export function Generator({ client, run, onUse }: { client: any; run: Task; onUse?: (value: string) => void }) {
 const [rules, setRules] = useState<any>(null), [entries, setEntries] = useState<any[]>([]), [kind, setKind] = useState('password'), [length, setLength] = useState(24), [words, setWords] = useState(7), [generated, setGenerated] = useState<any>(null), [shown, setShown] = useState(false), [working, setWorking] = useState(false), [notice, setNotice] = useState('');
 const local = useRef<any>(null), busy = useRef(false), live = useRef(true), displayed = useRef<any>(null), initialization = useRef(0);
 const policy = rules?.policy;
 const perform = (action: () => Promise<void>) => {
  if (busy.current) return;
  busy.current = true; setWorking(true);
  void run(async () => { try { await action(); } catch (error) { if (error !== cancelledOperation) throw error; } finally { busy.current = false; if (live.current) setWorking(false); } });
 };
 async function refresh() {
  const server = await client.call('generator/policy', {}), next = { ...server, policy: effectivePolicy(server.policy) };
  if (!live.current || !local.current) throw cancelledOperation;
  local.current.policy = next.policy;
  const rows = await local.current.list();
  if (!live.current) throw cancelledOperation;
  const changed = JSON.stringify(displayed.current?.policy) !== JSON.stringify(next.policy);
  displayed.current = next; setRules(next); setEntries(rows);
  if (changed) setLength(previous => Math.max(next.policy.minLength, Math.min(next.policy.maxLength, previous)));
  setGenerated((previous: any) => previous && previous.retained !== false && !rows.some((entry: any) => entry.id === previous.id) ? null : previous);
  return { ...next, rows, changed };
 }
 useEffect(() => {
  live.current = true; let own: any, cancelled = false; const ticket = ++initialization.current;
  busy.current = true; setWorking(true);
  void run(async () => {
   try {
    const server = await client.call('generator/policy', {}), key = await generatorHistoryKey(client);
    try { own = new GeneratorHistory({ storage: new BrowserHistoryStorage(localStorage, `latchkey-generator:${client.profile.tenant}:${client.profile.account}`), key, tenant: client.profile.tenant, account: client.profile.account, policy: effectivePolicy(server.policy) }); } finally { key.fill(0); }
    if (cancelled) { own.lock(); return; }
    local.current = own; await refresh();
   } catch (error) { if (error !== cancelledOperation) throw error; } finally { if (ticket === initialization.current) { busy.current = false; if (!cancelled) setWorking(false); } }
  });
  return () => { cancelled = true; live.current = false; own?.lock(); if (local.current === own) local.current = null; };
 }, [client]);
 async function currentValue(value = generated) {
  const fresh = await refresh();
  if (!value || value.retained !== false && !fresh.rows.some((entry: any) => entry.id === value.id)) throw { code: 'generator_history_entry_expired' };
  return value;
 }
 return <section className="detail tool-panel" aria-labelledby="generator-title"><div className="section">
  <h2 id="generator-title">Password generator</h2>
  {!policy ? <p className="loading" role="status">Loading current company and group policy…</p> : <>
   <p className="muted">Effective policy: {policy.minLength}–{policy.maxLength} characters; at least {policy.minEntropyBits} bits of entropy; required classes: {policy.requiredClasses.join(', ')}. History is encrypted on this browser. {policy.historyDays === 0 ? 'History retention is disabled.' : `Entries expire after ${policy.historyDays} days.`}</p>
   <p className="muted">Applied sources: {rules.sources.map((source: any) => source.scope === 'group' ? `group ${source.group}` : source.scope).join(' · ')}</p>
   {notice && <p className="notice" role="status">{notice}</p>}
   <div className="form-grid"><label>Generate<select disabled={working} value={kind} onChange={event => setKind(event.target.value)}><option value="password">Password</option><option value="passphrase">Passphrase</option></select></label>{kind === 'password' ? <label>Characters<input type="number" disabled={working} min={policy.minLength} max={policy.maxLength} value={length} onChange={event => setLength(Number(event.target.value))}/></label> : <label>Words<input type="number" disabled={working} min="1" max="100" value={words} onChange={event => setWords(Number(event.target.value))}/></label>}</div>
   <button className="add" type="button" disabled={working} onClick={() => perform(async () => {
    const fresh = await refresh();
    if (fresh.changed) { setNotice('Policy changed. Review the updated constraints and retention above, then generate again.'); return; }
    const value = kind === 'password' ? generatePassword({ length, policy: fresh.policy }) : generatePassphrase({ words, policy: fresh.policy });
    const entry = await local.current.add(value); setGenerated({ ...value, ...entry }); setShown(false); setEntries(await local.current.list()); setNotice('');
   })}>Generate</button>
   {generated && <div className="notice"><label>Generated value<input readOnly type={shown ? 'text' : 'password'} value={generated.value}/></label>{generated.entropyBits != null && <p className="muted">{Math.floor(generated.entropyBits)} bits of entropy</p>}<div className="actions"><button type="button" disabled={working} onClick={() => { if (shown) setShown(false); else perform(async () => { await currentValue(); setShown(true); }); }}>{shown ? 'Hide' : 'Reveal'}</button><button type="button" disabled={working} onClick={() => perform(async () => copy((await currentValue()).value))}>Copy</button>{onUse && <button type="button" disabled={working} onClick={() => perform(async () => onUse((await currentValue()).value))}>Use in this item</button>}</div></div>}
   <details className="tool-box" onToggle={event => { if (event.currentTarget.open) perform(async () => { await refresh(); }); }}><summary>Generator history ({entries.length})</summary><p className="muted">Exporting creates a plaintext file. Store it securely.</p><div className="actions"><button type="button" disabled={working || !entries.length} onClick={() => perform(async () => { await refresh(); await local.current.clear(); setEntries([]); setGenerated(null); })}>Clear all</button><button type="button" disabled={working} onClick={() => perform(async () => { const fresh = await refresh(); download('latchkey-generator-history.json', JSON.stringify(fresh.rows)); })}>Export history</button><button type="button" disabled={working} onClick={() => perform(async () => { await refresh(); })}>Refresh history</button></div>
    {entries.slice().reverse().map(entry => <div className="history-entry" key={entry.id}><span>{entry.kind} · {new Date(entry.created).toLocaleString()}</span><button type="button" disabled={working} onClick={() => perform(async () => { setGenerated(await currentValue(entry)); setShown(true); })}>Reveal</button><button type="button" disabled={working} onClick={() => perform(async () => copy((await currentValue(entry)).value))}>Copy</button><button type="button" disabled={working} onClick={() => perform(async () => { await refresh(); await local.current.clear(entry.id); setEntries(await local.current.list()); setGenerated(null); })}>Delete</button></div>)}
   </details>
   {rules.canManage && <GeneratorPolicyForm policy={policy} disabled={working} onSave={input => perform(async () => { await client.call('generator/policy/set', input); await refresh(); setNotice('Policy saved. The reason was recorded in the audit history.'); })}/>}
  </>}
 </div></section>;
}
