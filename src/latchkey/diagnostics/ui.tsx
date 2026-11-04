import { useCallback, useEffect, useRef, useState } from 'react';
import { diagnosticPreview } from './client.mjs';
import { download } from '../ui/types';

export function DiagnosticsPanel({ errorCode, onClose }: { errorCode: string | null; onClose: () => void }) {
 const [preview, setPreview] = useState<string | null>(null), [approved, setApproved] = useState(false);
 const [notice, setNotice] = useState(''), [failed, setFailed] = useState(false);
 const heading = useRef<HTMLHeadingElement>(null), reviewHeading = useRef<HTMLHeadingElement>(null), start = useRef<HTMLButtonElement>(null);
 useEffect(() => { heading.current?.focus(); }, []);
 const refresh = useCallback(() => {
  if (preview === null) return;
  const next = diagnosticPreview(errorCode);
  if (preview !== next) { setPreview(next); setApproved(false); setNotice('Diagnostics changed. Review the new payload and confirm again.'); }
 }, [preview, errorCode]);
 useEffect(() => { refresh(); }, [errorCode, refresh]);
 useEffect(() => {
  window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
  return () => { window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
 }, [refresh]);
 useEffect(() => { if (preview !== null) reviewHeading.current?.focus(); }, [preview]);
 const clear = () => { setPreview(null); setApproved(false); requestAnimationFrame(() => start.current?.focus()); };
 const save = () => {
  if (preview === null || !approved) return;
  const next = diagnosticPreview(errorCode);
  if (next !== preview) { setPreview(next); setApproved(false); setNotice('Diagnostics changed. Review the new payload and confirm again.'); return; }
  try {
   download('latchkey-diagnostics.json', preview);
   clear(); setFailed(false); setNotice('Browser download initiated. Delivery has not been verified.');
  } catch {
   clear(); setFailed(true); setNotice('The browser could not start the download. Preview again to retry.');
  }
 };
 return <section className="detail section" aria-labelledby="diagnostics-title">
  <h1 id="diagnostics-title" ref={heading} tabIndex={-1}>Support diagnostics</h1>
  <p>Preview a small local file for support. Nothing is uploaded or sent to support by this page.</p>
  <p>It contains public release versions, feature availability and one normalized error code, if present. It excludes vault contents, keys, profiles, identities, addresses, device identifiers and arbitrary logs.</p>
  <div className="notice"><h2>Help while the service is unavailable</h2><p>Service status: unknown. Browser connectivity is a local observation and does not establish service health.</p><p>Keep your profile and recovery material private. Never send them, your master password or a saved credential to support. This file cannot unlock a vault.</p><p>The loaded page can prepare this file without contacting the service. It does not verify updates or certify browser compatibility. A fresh page load may still need a connection.</p></div>
  {notice && <p role={failed ? 'alert' : 'status'}>{notice}</p>}
  {preview === null ? <div className="actions"><button ref={start} type="button" className="primary" onClick={() => { setApproved(false); setNotice(''); setFailed(false); setPreview(diagnosticPreview(errorCode)); }}>Preview diagnostic bundle</button><button type="button" onClick={onClose}>Close diagnostics</button></div> : <section aria-labelledby="diagnostic-review-title">
   <h2 id="diagnostic-review-title" tabIndex={-1} ref={reviewHeading}>Exact download preview</h2>
   <label>Exact diagnostic payload<textarea readOnly rows={20} spellCheck={false} value={preview}/></label>
   <p>The downloaded file will contain exactly the text above. A changed payload requires new confirmation. Downloaded copies remain in your custody.</p>
   <label className="check"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)}/>I allow downloading this exact diagnostic payload</label>
   <div className="actions"><button type="button" className="primary" disabled={!approved} onClick={save}>Download diagnostic bundle</button><button type="button" onClick={() => { clear(); setNotice('Preview cancelled. Nothing was downloaded.'); setFailed(false); }}>Cancel preview</button></div>
  </section>}
 </section>;
}
