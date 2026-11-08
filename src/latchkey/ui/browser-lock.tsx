import { useState } from 'react';
import { applyBrowserLock, inactivityMinutes, readBrowserLock, reviewBrowserLock } from '../unlock/browser-lock.mjs';
import { message } from './types';

export function BrowserLockPanel({ client, onApplied }: { client: any; onApplied: () => void }) {
 const [settings, setSettings] = useState(() => readBrowserLock(client));
 const [review, setReview] = useState<any>(null), [error, setError] = useState(''), [saved, setSaved] = useState(false);
 const change = (next: any) => { setSettings(next); setReview(null); setSaved(false); };
 return <section className="detail section" aria-labelledby="browser-lock-title"><h1 id="browser-lock-title">Browser lock</h1>
  <p>Choose when this enrolled browser profile locks. Locking clears the open vault and requires your profile file and password again.</p>
  <p>These settings apply only here. They do not expire an offline cache or clear secrets already copied to the clipboard.</p>
  {error && <p role="alert">{error}</p>}
  <form onSubmit={event => { event.preventDefault(); try { setError(''); setReview(reviewBrowserLock(client, settings)); setSaved(false); } catch (cause) { setError(message(cause)); } }}>
   <label>Lock after inactivity<select value={settings.minutes} onChange={event => change({ ...settings, minutes: Number(event.target.value) })}>{inactivityMinutes.map((minutes: number) => <option key={minutes} value={minutes}>{minutes ? `${minutes} minute${minutes === 1 ? '' : 's'}` : 'Manual lock only'}</option>)}</select></label>
   <label className="check"><input type="checkbox" checked={settings.background} onChange={event => change({ ...settings, background: event.target.checked })}/>Lock when this page goes into the background</label>
   <p>Closing, reloading or leaving this page always locks the vault.</p>
   <button className="primary">Review lock settings</button>
  </form>
  {review && <section className="notice" aria-label="Lock settings review"><h2>Review this profile</h2>
   <dl>{Object.entries(review.binding).map(([key, value]) => <div key={key}><dt>{key[0].toUpperCase() + key.slice(1)}</dt><dd style={{ overflowWrap: 'anywhere', marginInlineStart: 0 }}>{String(value)}</dd></div>)}</dl>
   <p>Inactivity: {review.settings.minutes ? `${review.settings.minutes} minute${review.settings.minutes === 1 ? '' : 's'}` : 'manual lock only'}. Background lock: {review.settings.background ? 'on' : 'off'}.</p>
   <div className="actions"><button className="primary" onClick={() => { try { applyBrowserLock(client, review); onApplied(); setReview(null); setSaved(true); } catch (cause) { setError(message(cause)); } }}>Apply reviewed lock settings</button>
    <button onClick={() => { setReview(null); setSettings(readBrowserLock(client)); }}>Cancel lock changes</button></div>
  </section>}
  {saved && <p role="status">Browser lock settings saved for this profile.</p>}
 </section>;
}
