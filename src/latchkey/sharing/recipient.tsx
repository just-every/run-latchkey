import { useEffect, useState } from 'react';
import { PublicLinkClient } from './client.mjs';
import { SharedAttachments, SharedValue, downloadSharedAttachment } from './value';

const failure = (error: any) => ({ link_unavailable: 'This link is unavailable. It may have expired, been revoked, or reached its view limit.', invalid_link: 'Open the complete link supplied by the sender.', recipient_verification_failed: 'The recipient or verification code could not be verified.', mail_unavailable: 'Verification email is unavailable. No view was consumed.', rate_limited: 'Too many attempts. Wait a minute and try again.' }[error?.code as string] ?? 'The shared item could not be opened. Try the complete link again.');
export function SharedRecipient() {
 const [url,setUrl]=useState('');
 useEffect(()=>{const changed=()=>setUrl(location.href);changed();window.addEventListener('hashchange',changed);window.addEventListener('popstate',changed);return()=>{window.removeEventListener('hashchange',changed);window.removeEventListener('popstate',changed)}},[]);
 return <RecipientView key={url} url={url}/>;
}
function RecipientView({url}:{url:string}) {
 const [client,setClient]=useState<PublicLinkClient|null>(null),[preview,setPreview]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [recipient,setRecipient]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState(''),[opened,setOpened]=useState<any>(null);
 useEffect(()=>{if(!url)return;let live=true,current:PublicLinkClient;try{current=new PublicLinkClient(url);setClient(current);void current.preview().then(value=>{if(live)setPreview(value)}).catch(cause=>{if(live)setError(failure(cause))})}catch(cause){setError(failure(cause))}return()=>{live=false;current?.lock()}},[url]);
 const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work()}catch(cause){setError(failure(cause))}finally{setBusy(false)}};
 return <main className="lk-share"><style>{`.lk-share{--rule:color-mix(in srgb,var(--rer-text,#000) 11%,var(--rer-page,#fff));max-width:42rem;margin:4rem auto;padding:2.5rem;border:1px solid var(--rule);background:var(--rer-surface,#fff);font-family:var(--rer-font-body,system-ui,sans-serif)}.lk-share h1{font-family:var(--rer-font-heading,Geist,'Helvetica Neue',Arial,sans-serif);font-weight:800;letter-spacing:-.025em}.lk-share label{display:grid;gap:.4rem;margin:1rem 0;font-weight:500}.lk-share input,.lk-share button{font:inherit;min-height:44px;padding:.6rem .75rem;border:1px solid var(--rer-border,#8c8c8c);border-radius:3px;box-sizing:border-box;max-width:100%}.lk-share input{width:100%}.lk-share button{cursor:pointer;padding:0 1.25rem;background:var(--rer-accent,#fd6415);border-color:var(--rer-accent,#fd6415);color:var(--rer-accent-text,#000);font-weight:600}.lk-share button:disabled{opacity:.5}.lk-share pre{white-space:pre-wrap;overflow-wrap:anywhere;background:color-mix(in srgb,var(--rer-text,#000) 3.5%,var(--rer-page,#fff));padding:1rem}.lk-share [role=alert]{border:1px solid #e3a59e;padding:1rem;background:#fdf3f2;color:#8a1c12}.lk-share:focus-visible,.lk-share :focus-visible{outline:2px solid var(--rer-focus,#000);outline-offset:2px}@media(max-width:500px){.lk-share{margin:1rem 0;padding:1.4rem 1.2rem}}`}</style>
 <h1>Private shared item</h1><p>This page opens the sender’s encrypted snapshot. Previewing this page does not consume a view.</p>
 {error&&<p role="alert">{error}</p>}{!preview&&!error&&<p role="status">Checking link…</p>}
 {preview&&!opened&&<><p>{preview.disclosure}</p><p>A verified email address is required. {preview.passwordRequired?'The sender also protected this link with a separate password.':''}</p>
 {!challenge?<form onSubmit={event=>{event.preventDefault();void run(async()=>{const result=await client!.challenge(recipient,password||null);setChallenge(result.challenge);setPassword('')})}}>
 <label>Recipient email<input type="email" required autoComplete="email" value={recipient} onChange={e=>setRecipient(e.target.value)}/></label>
 {preview.passwordRequired&&<label>Link password<input type="password" required autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/></label>}
 <button disabled={busy}>{busy?'Sending…':'Send verification code'}</button></form>:<form onSubmit={event=>{event.preventDefault();void run(async()=>{const value=await client!.open(challenge,code);if(value.kind==='file')await downloadSharedAttachment(value.attachment);setOpened(value);setCode('')})}}>
 <p role="status">A code was sent to {recipient}. Opening now consumes a view.</p><label>Verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={e=>setCode(e.target.value)}/></label><button disabled={busy}>{busy?'Opening…':'Verify and open'}</button></form>}</>}
 {opened&&<section aria-label="Shared content"><h2>{opened.kind==='file'?'File downloaded':'Shared secret'}</h2>{opened.kind==='file'?<SharedAttachments attachments={[opened.attachment]}/>:<SharedValue value={opened.value}/>}<p>{opened.disclosure}</p><button onClick={()=>{client?.lock();setOpened(null);setPreview(null);setChallenge('');setError('This view is closed. Open the original link again to request another permitted view.')}}>Close this view</button></section>}
 </main>;
}
