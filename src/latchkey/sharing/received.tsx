import { useEffect, useState } from 'react';
import { SharingClient } from './client.mjs';
import { SharedValue } from './value';
export function ReceivedShares({client}:{client:any}) {
 const [rows,setRows]=useState<any[]>([]),[opened,setOpened]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[fingerprints,setFingerprints]=useState<Record<string,string>>({});
 const sharing=new SharingClient(client);
 const refresh=async()=>{setOpened(null);setError('');setBusy(true);try{setRows(await sharing.received())}catch{setRows([]);setError('Shared items are unavailable. Unlock again or contact the sender.')}finally{setBusy(false)}};
 useEffect(()=>{void refresh();return()=>setOpened(null)},[client]);
 useEffect(()=>{if(!rows.length)return;const delay=Math.min(...rows.map(row=>row.expires_at-Date.now()).filter(ms=>ms>0),86400000);const timer=setTimeout(()=>void refresh(),delay+1);return()=>clearTimeout(timer)},[rows]);
 const act=async(work:()=>Promise<void>)=>{setError('');setBusy(true);try{await work()}catch(cause:any){setOpened(null);setError(cause?.code==='recipient_confirmation_required'?'Verify the sender’s fingerprint before opening this item.':'Access has expired, changed, or been revoked. Refresh your shared items.')}finally{setBusy(false)}};
 return <section className="detail"><div className="section"><h1>Shared with me</h1><p>Only the exact reviewed items are available here. Access is checked again for every open. Copies already revealed cannot be recalled.</p><button disabled={busy} onClick={()=>void refresh()}>Refresh shared items</button>{busy&&<p className="loading" role="status">Checking access…</p>}{error&&<p role="alert">{error}</p>}{!busy&&!rows.length&&<p>No active shared items.</p>}
 {[...new Set<string>(rows.map(row=>row.source_account))].map(account=><details key={account}><summary>Verify sender {account.slice(0,8)}</summary><p>Compare the sender’s fingerprint through a trusted channel before accepting it.</p><label>Sender fingerprint<input value={fingerprints[account]??''} onChange={e=>setFingerprints(old=>({...old,[account]:e.target.value}))}/></label><button disabled={busy||!fingerprints[account]} onClick={()=>void act(async()=>{await client.pinAccount(account,fingerprints[account]);setError('')})}>I compared and confirm this sender</button></details>)}
 <ul>{rows.map(row=><li key={`${row.id}:${row.object_id}`}><p>Shared item {row.object_id.slice(0,8)} · ends {new Date(row.expires_at).toLocaleString()}</p><button disabled={busy||Date.now()>=row.expires_at} onClick={()=>void act(async()=>{setOpened(null);setOpened(await sharing.read(row.id,row.object_id))})}>Open shared item {row.object_id.slice(0,8)}</button></li>)}</ul>
 {opened&&<section aria-label="Opened shared item"><h2>Shared item</h2><SharedValue key={`${opened.object}:${opened.version}`} value={opened.value}/><p>{opened.disclosure}</p><button onClick={()=>setOpened(null)}>Close shared item</button></section>}
 </div></section>;
}
