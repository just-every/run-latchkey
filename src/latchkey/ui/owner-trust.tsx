import { useState } from 'react';
import type { Task } from './types';

export function OwnerTrust({ owner, client, run, onConfirmed }: { owner: { account: string; fingerprint: string }; client: any; run: Task; onConfirmed: () => Promise<void> }) {
 const [fingerprint, setFingerprint] = useState('');
 return <section className="detail section"><h1>Confirm this vault’s owner</h1><p>Compare this fingerprint with the owner through a trusted channel before opening their vault.</p><p className="muted">Account: {owner.account}</p><p className="fingerprint"><code>{owner.fingerprint}</code></p><form onSubmit={event => { event.preventDefault(); void run(async () => { await client.pinAccount(owner.account, fingerprint.trim()); await onConfirmed(); }); }}><label>Fingerprint confirmed with the owner<input required autoComplete="off" value={fingerprint} onChange={event => setFingerprint(event.target.value)}/></label><button className="add" disabled={!fingerprint.trim()}>Confirm owner and open vault</button></form></section>;
}
