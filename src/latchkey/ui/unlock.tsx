import { useEffect, useRef, useState } from 'react';
import { VaultClient } from './runtime.mjs';
import { download, type Task } from './types';
const cancelledRegistration = Symbol('registration cancelled');
const passwordAutocomplete = { unlock: 'current-password', register: 'new-password' };

export function Unlock({ run, busy, onUnlock }: { run: Task; busy: boolean; onUnlock: (client: any) => Promise<void> }) {
 const [ready, setReady] = useState(false);
 useEffect(() => setReady(true), []);
 const [mode, setMode] = useState<'unlock' | 'register'>('unlock');
 const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
 const [staged, setStaged] = useState<any>(null), [saved, setSaved] = useState(false), [downloaded, setDownloaded] = useState({ profile: false, kit: false }), [finishing, setFinishing] = useState(false);
 const profileFile = useRef<HTMLInputElement>(null);
 const mounted = useRef(true), registering = useRef(false), attempt = useRef(0), custody = useRef<{ resolve: () => void; reject: (reason: unknown) => void } | null>(null);
 useEffect(() => {
  mounted.current = true;
  return () => { mounted.current = false; attempt.current++; custody.current?.reject(cancelledRegistration); custody.current = null; };
 }, []);
 return <section className="lk-unlock detail" aria-labelledby="unlock-title">
  <div className="section"><h1 id="unlock-title">{staged ? 'Keep your keys safe' : mode === 'unlock' ? 'Unlock your vault' : 'Create your private vault'}</h1>
  <p className="muted">Your profile file and password unlock your keys on this device. Keep your profile and recovery kit somewhere safe.</p>
  <fieldset disabled={!ready} style={{border:0,padding:0,margin:0,minWidth:0}}>{!ready && <p role="status">Preparing your private client…</p>}
  {staged ? <><p>{finishing ? 'Completing account creation and unlocking your vault…' : 'Your account has not been enrolled yet. Download both files before continuing. Your recovery kit is sensitive; store it separately.'}</p>
   <div className="actions"><button type="button" onClick={() => { download('latchkey-profile.json', JSON.stringify(staged.profile)); setDownloaded(previous => ({ ...previous, profile: true })); }}>Download profile</button><button type="button" onClick={() => { download('latchkey-recovery-kit.json', JSON.stringify(staged.kit)); setDownloaded(previous => ({ ...previous, kit: true })); }}>Download recovery kit</button></div>
   <label className="check"><input type="checkbox" disabled={!downloaded.profile || !downloaded.kit || finishing} checked={saved} onChange={e => setSaved(e.target.checked)}/>I saved both files securely</label>
   <div className="actions"><button type="button" className="add" disabled={!saved || !downloaded.profile || !downloaded.kit || finishing} onClick={() => { const pending = custody.current; if (!pending) return; custody.current = null; setFinishing(true); pending.resolve(); }}>Create account and open vault</button>{!finishing && <button type="button" onClick={() => { const pending = custody.current; custody.current = null; attempt.current++; setStaged(null); setSaved(false); setPassword(''); setConfirm(''); pending?.reject(cancelledRegistration); }}>Cancel account creation</button>}</div>
  </> : <form onSubmit={e => { e.preventDefault(); void run(async () => {
   const client = new VaultClient(location.origin);
   if (mode === 'register') {
    if (registering.current) return;
    if (password !== confirm) throw { code: 'passwords_do_not_match' };
    registering.current = true; const ticket = ++attempt.current;
    try {
     const result = await client.register(password, { beforeCommit: async (files: any) => {
      if (!mounted.current || ticket !== attempt.current) throw cancelledRegistration;
      await new Promise<void>((resolve, reject) => {
       custody.current = { resolve, reject }; setDownloaded({ profile: false, kit: false }); setSaved(false); setFinishing(false); setStaged(files);
      });
      if (!mounted.current || ticket !== attempt.current) throw cancelledRegistration;
     } });
     if (!mounted.current) return;
     setMode('unlock');
     await client.unlock(result.profile, password);
     if (mounted.current) await onUnlock(client); else client.lock();
    } catch (error) { if (error !== cancelledRegistration) throw error; }
    finally { registering.current = false; custody.current = null; if (mounted.current) { setStaged(null); setSaved(false); setFinishing(false); setPassword(''); setConfirm(''); } }
   }
   else {
    // Read the selected file at submission, including a selection retained while
    // the page hydrated. A missed change event must not discard that selection.
    const file = profileFile.current?.files?.[0];
    if (!file) throw { code: 'choose_profile_file' };
    if (file.size > 16 * 1024 * 1024) throw { code: 'profile_too_large' };
    const selected = JSON.parse(await file.text());
    await client.unlock(selected, password); setPassword(''); await onUnlock(client);
   }
  }); }}>
   {mode === 'unlock' && <label>Profile file<input ref={profileFile} required type="file" accept=".json,application/json"/></label>}
   <label>Master password<input required type="password" autoComplete={passwordAutocomplete[mode]} value={password} onChange={e => setPassword(e.target.value)}/></label>
   {mode === 'register' && <label>Confirm master password<input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label>}
   <button className="primary" type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'unlock' ? 'Unlock vault' : 'Create account'}</button>
   <button type="button" className="link" disabled={busy} onClick={() => { setMode(mode === 'unlock' ? 'register' : 'unlock'); setPassword(''); setConfirm(''); }}>{mode === 'unlock' ? 'First time? Create an account' : 'Use an existing profile'}</button>
  </form>}
  </fieldset></div>
 </section>;
}
