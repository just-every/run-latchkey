import { useEffect, useRef, useState } from 'react';
import { captureTotp, parseTotpUri } from './runtime.mjs';
import type { Task } from './types';

export function TotpCapture({ object, onAccept, run }: { object?: string; onAccept: (value: any) => void; run: Task }) {
 const [issuer, setIssuer] = useState(''), [account, setAccount] = useState(''), [uri, setUri] = useState(''), [preview, setPreview] = useState<any>(null), [active, setActive] = useState(false);
 const video = useRef<HTMLVideoElement>(null), controller = useRef<AbortController | null>(null);
 useEffect(() => () => controller.current?.abort(), []);
 const target = { object, issuer, account };
 const capture = (source: string) => void run(async () => {
  controller.current = new AbortController(); setActive(true);
  try { setPreview(await captureTotp({ source, target, video: video.current, signal: controller.current.signal })); } finally { setActive(false); }
 });
 return <details className="tool-box"><summary>Add an authenticator code</summary>
  <p className="muted">Select the saved item first, then confirm the issuer and account exactly as shown by the provider. Screen and camera images stay on this device.</p>
  {!object && <p>Save this item before capturing a code.</p>}
  <div className="form-grid"><label>Issuer<input disabled={active} value={issuer} onChange={e => { setIssuer(e.target.value); setPreview(null); }}/></label><label>Account<input disabled={active} value={account} onChange={e => { setAccount(e.target.value); setPreview(null); }}/></label></div>
  <div className="actions"><button type="button" disabled={!object || !issuer || !account || active} onClick={() => capture('screen')}>Capture screen QR</button><button type="button" disabled={!object || !issuer || !account || active} onClick={() => capture('camera')}>Scan camera QR</button>{active && <button type="button" onClick={() => controller.current?.abort()}>Cancel capture</button>}</div>
  <video ref={video} hidden={!active} aria-label="Authenticator QR capture preview"/>
  <label>Or paste an otpauth URI<input type="password" value={uri} onChange={e => setUri(e.target.value)} autoComplete="off"/></label>
  <button type="button" disabled={!object || !issuer || !account || !uri || active} onClick={() => void run(async () => setPreview(parseTotpUri(uri, target)))}>Review code identity</button>
  {preview && <div className="notice"><p><strong>{preview.issuer}</strong><br/>{preview.account}</p><p>Confirm this is the account you intended to protect.</p><button type="button" onClick={() => { onAccept(preview); setPreview(null); setUri(''); }}>Confirm and add code</button></div>}
 </details>;
}
