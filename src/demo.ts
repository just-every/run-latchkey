import type { Bindings } from './auth.server'

// Vault keys and content belong to the visitor's client. Only first-run state
// can be completed before that client performs its own OPAQUE registration.
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
 const owner = await env.DB.prepare("SELECT id FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(ownerEmail).first<{ id: string }>()
 if (!owner) throw new Error('Demo owner is missing')
 await env.DB.prepare('INSERT INTO oa_first_run(singleton, completed_by, completed_at) VALUES(1, ?, ?) ON CONFLICT DO NOTHING').bind(owner.id, now.getTime()).run()
}
