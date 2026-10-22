import { useState } from 'react';
import { createPasskey, usePasskey } from './runtime.mjs';
import { download, type Task } from './types';

export function Passkeys({ value, onAccept, run }: { value?: any; onAccept?: (value: any) => void; run: Task }) {
 const [challenge, setChallenge] = useState(''), [account, setAccount] = useState(''), [userId, setUserId] = useState(''), [result, setResult] = useState<any>(null);
 return <details className="tool-box"><summary>Platform passkey</summary>
  <p className="muted">The private key stays in your platform authenticator and cannot be exported with this vault. Only this site’s relying party is supported here. Supply its one-time challenge; it must verify the returned response before a sign-in or registration is complete.</p>
  <label>Relying party challenge (base64url)<input value={challenge} onChange={e => { setChallenge(e.target.value); setResult(null); }}/></label>
  {onAccept && <><label>Account name<input value={account} onChange={e => setAccount(e.target.value)}/></label><label>User ID (base64url, supplied by relying party)<input value={userId} onChange={e => setUserId(e.target.value)}/></label>
   <button type="button" disabled={!challenge || !account || !userId} onClick={() => void run(async () => {
    const created = await createPasskey({ rp: { id: location.hostname, name: location.hostname }, user: { id: userId, name: account, displayName: account }, challenge });
    onAccept(created.field); setResult(created.registration);
   })}>Create platform passkey</button></>}
  {value?.credentialId && <button type="button" disabled={!challenge} onClick={() => void run(async () => setResult(await usePasskey({ passkey: value, challenge })))}>Use platform passkey</button>}
  {result && <div className="notice"><p>Local ceremony completed. Relying party verification is still required.</p><button type="button" onClick={() => download('latchkey-passkey-response.json', JSON.stringify(result))}>Download response for verification</button></div>}
 </details>;
}
