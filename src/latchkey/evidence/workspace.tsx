import {useEffect,useMemo,useRef,useState} from 'react';
import {EvidenceClient} from './client.mjs';
import {EvidencePanel} from './ui';
const when=(value:number)=>new Date(value).toLocaleString();

function DeletionRecord({row,busy,act,evidence}:{row:any;busy:boolean;act:(work:()=>Promise<unknown>)=>void;evidence:EvidenceClient}){
 const [reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false);
 return <article className="definition" aria-label={`External deletion ${row.id}`}><p>{row.destination} · {row.state}</p><p>Provider reference: {row.providerReference}. Request reference: {row.requestReference||'Not yet recorded'}.</p><p>Request recorded: {row.requestedAt?when(row.requestedAt):'Not yet recorded'}. Provider confirmation: {row.confirmationReference??'Pending'}.</p><p>These are owner-reported records from the provider’s own interface. Latchkey performs no external deletion and independently verifies none.</p>
  {row.state==='pending-provider-confirmation'&&<form onSubmit={event=>{event.preventDefault();act(()=>evidence.confirmDeletion(row.id,reference,confirmed));}}><label>Provider confirmation reference<input required maxLength={191} value={reference} disabled={busy} onChange={event=>setReference(event.target.value)}/></label><label className="check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>I observed this provider confirmation and am recording its exact reference.</label><button disabled={busy||!confirmed}>Record provider confirmation</button></form>}
 </article>;
}
export function EvidenceWorkspace({client,vault}:{client:any;vault:string}){
 const evidence=useMemo(()=>new EvidenceClient(client),[client]),ticket=useRef(0);
 const [sources,setSources]=useState<any[]>([]),[selected,setSelected]=useState(''),[deliveries,setDeliveries]=useState<any[]>([]),[deletions,setDeletions]=useState<any[]>([]);
 const [consent,setConsent]=useState(false),[delivery,setDelivery]=useState(''),[requestReference,setRequestReference]=useState(''),[requestConfirmed,setRequestConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const refresh=async()=>{
  const current=++ticket.current,deleted=await evidence.deletions();let rows:any[]=[];
  if(vault){const [captures,reviews]=await Promise.all([evidence.sources(vault),client.call('reviews/list',{vault})]);rows=[...captures.filter((r:any)=>r.active),...reviews.filter((r:any)=>r.phase==='closed').map((r:any)=>({...r,kind:'access-review',sourceTimestamp:r.created_at}))];}
  if(current!==ticket.current)return;setSources(rows);setDeletions(deleted);setSelected(previous=>rows.some(r=>r.id===previous)?previous:rows[0]?.id??'');
 };
 useEffect(()=>{setSelected('');setSources([]);setDeliveries([]);setConsent(false);setError('');void refresh().catch(()=>setError('Company evidence could not be loaded. Select a company vault you own.'));return()=>{ticket.current++;};},[client,vault]);
 useEffect(()=>{let current=true;setDeliveries([]);setDelivery('');if(selected)void evidence.deliveries(selected).then(rows=>{if(current)setDeliveries(rows);}).catch(()=>{if(current)setError('This evidence is no longer available. Refresh the source list.');});return()=>{current=false;};},[evidence,selected,status]);
 const act=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');setStatus('');try{await work();setConsent(false);setRequestConfirmed(false);setRequestReference('');await refresh();setStatus('Evidence records refreshed.');}catch{setError('The evidence action was refused. Refresh and inspect current authority and source state.');}finally{setBusy(false);}};
 return <section className="detail section"><h1>Company evidence</h1><p>Capture observed posture, enrollment and security-event counts for the selected company vault. MFA is explicitly unknown until an authoritative enforcement source exists. Counts omit personal vaults and employee identities.</p>
  {error&&<p role="alert" className="error">{error}</p>}{status&&<p role="status">{status}</p>}
  <label className="check"><input type="checkbox" checked={consent} disabled={busy||!vault} onChange={event=>setConsent(event.target.checked)}/>Capture only the company metadata described above.</label><button disabled={busy||!vault||!consent} onClick={()=>void act(async()=>{const source=await evidence.capture(vault,consent);setSelected(source.id);})}>Capture company posture</button><button disabled={busy} onClick={()=>void act(async()=>{})}>Refresh company evidence</button>
  <label>Evidence source<select aria-label="Evidence source" className="vault-select" value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}><option value="">Choose captured evidence</option>{sources.map(row=><option value={row.id} key={row.id}>{row.kind} · {when(row.sourceTimestamp)} · {row.id}</option>)}</select></label>
  {selected&&<EvidencePanel key={selected} client={client} review={selected}/>}
  <section className="tool-box" aria-label="External evidence deletion"><h2>External evidence deletion</h2>
   <details><summary>Record a deletion request</summary><p>Use the provider’s interface to request deletion, then record its reference here. A request remains pending until you separately record the observed provider confirmation. Destination revocation does not confirm deletion.</p>
   <form onSubmit={event=>{event.preventDefault();void act(()=>evidence.requestDeletion(delivery,requestReference,requestConfirmed));}}><label>Submitted delivery<select aria-label="Submitted delivery" className="vault-select" value={delivery} disabled={busy} onChange={event=>setDelivery(event.target.value)}><option value="">Choose a submitted delivery</option>{deliveries.filter(row=>row.providerReference||row.stage?.uploadReference).map(row=><option value={row.id} key={row.id}>{row.id} · {row.providerReference??row.stage.uploadReference}</option>)}</select></label><label>External deletion request reference<input required maxLength={191} value={requestReference} disabled={busy} onChange={event=>setRequestReference(event.target.value)}/></label><label className="check"><input type="checkbox" checked={requestConfirmed} disabled={busy} onChange={event=>setRequestConfirmed(event.target.checked)}/>I requested deletion in the provider’s interface and am recording its exact reference.</label><button disabled={busy||!delivery||!requestConfirmed}>Record external deletion request</button></form></details>
   {deletions.length===0&&<p>No external deletion requests recorded.</p>}{deletions.map(row=><DeletionRecord key={row.id+row.state} row={row} busy={busy} act={work=>void act(work)} evidence={evidence}/>)}
  </section>
 </section>;
}
