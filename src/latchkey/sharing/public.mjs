import { digest, id, random } from '../crypto/envelope.mjs';
import { operatorMail } from '../../mail.server.mjs';
import { access, disclosure, email, exact, hashString, need, sourceLive, uuid } from './common.mjs';

// Every fetch of ciphertext is an actual, counted POST. No durable download
// capability or object-store URL survives revocation.
const available = `l.revoked_at IS NULL AND l.starts_at<=? AND l.expires_at>? AND l.views<l.max_views AND ${sourceLive('l')} AND EXISTS(SELECT 1 FROM lky_versions x WHERE x.vault_id=l.vault_id AND x.object_id=l.object_id AND x.version=l.source_version) AND EXISTS(SELECT 1 FROM lky_sharing_policy p WHERE p.tenant=l.tenant AND p.external_enabled=1 AND l.expires_at-l.created_at<=p.max_days*86400000 AND EXISTS(SELECT 1 FROM json_each(p.domains) WHERE value=substr(l.recipient_email,instr(l.recipient_email,'@')+1)))`;
export async function sharingPublic(route, input, ctx) {
 if (!['sharing/link/preview', 'sharing/link/challenge', 'sharing/link/open'].includes(route)) return null;
 const { first, stmt, event } = access(ctx), { now, db, env } = ctx;
 await ctx.limited('external-sharing:' + route);
 if (route === 'sharing/link/preview') {
  exact(input, ['link']);
  const row = await first(`SELECT id,password_salt,password_required FROM lky_links l WHERE id=? AND ${available}`, uuid(input.link), now, now);
  need(row, 'link_unavailable', 403);
  return { link: row.id, passwordSalt: row.password_salt, passwordRequired: row.password_required === 1, verifiedRecipientRequired: true, disclosure };
 }
 exact(input, route.endsWith('/challenge') ? ['link', 'verifier', 'recipient'] : ['link', 'verifier', 'challenge', 'code']);
 const link = uuid(input.link), verifier = await digest(hashString(input.verifier));
 await ctx.limited('external-sharing:' + link);
 const row = await first(`SELECT * FROM lky_links l WHERE id=? AND verifier_hash=? AND ${available}`, link, verifier, now, now);
 need(row, 'link_unavailable', 403);
 if (route.endsWith('/challenge')) {
  need(email(input.recipient) === row.recipient_email, 'recipient_verification_failed', 403);
  const sender = operatorMail(env); need(sender && env.MAIL_FROM, 'mail_unavailable', 503);
  const challenge = id(), value = new DataView(random(4).buffer).getUint32(0), code = String(value % 1000000).padStart(6, '0');
  const result = await db.batch([
   stmt('DELETE FROM lky_link_challenges WHERE expires_at<=?', now),
   stmt(`INSERT INTO lky_link_challenges SELECT ?,?,?,?,0,NULL WHERE EXISTS(SELECT 1 FROM lky_links l WHERE id=? AND verifier_hash=? AND ${available})`, challenge, link, await digest(`${challenge}:${code}`), Math.min(now + 600000, row.expires_at), link, verifier, now, now),
  ]);
  need(result[1].meta.changes, 'link_unavailable', 403);
  let sent;
  try { sent = await sender.send({ deliveryId: challenge, from: env.MAIL_FROM, to: [row.recipient_email], subject: 'Latchkey recipient verification', text: `Latchkey verification code: ${code}\nExpires in ten minutes. Only enter this code on the Latchkey page you opened.`, html: `<p>Latchkey verification code: <strong>${code}</strong></p><p>Expires in ten minutes. Only enter this code on the Latchkey page you opened.</p>`, headers: { 'Auto-Submitted': 'auto-generated' } }); } catch {}
  if (sent?.status !== 'accepted') { await stmt('DELETE FROM lky_link_challenges WHERE id=?', challenge).run(); need(false, 'mail_unavailable', 503); }
  return { challenge, expires: Math.min(now + 600000, row.expires_at) };
 }
 const challenge = uuid(input.challenge);
 need(typeof input.code === 'string' && /^\d{6}$/.test(input.code), 'recipient_verification_failed', 403);
 const attempt = await first('UPDATE lky_link_challenges SET attempts=attempts+1 WHERE id=? AND link_id=? AND expires_at>? AND consumed_at IS NULL AND attempts<5 RETURNING code_hash', challenge, link, now);
 need(attempt && attempt.code_hash === await digest(`${challenge}:${input.code}`), 'recipient_verification_failed', 403);
 const mutation = id();
 const result = await db.batch([
  stmt(`UPDATE lky_links AS l SET views=views+1,mutation=? WHERE id=? AND verifier_hash=? AND ${available} AND EXISTS(SELECT 1 FROM lky_link_challenges c WHERE c.id=? AND c.link_id=l.id AND c.expires_at>? AND c.consumed_at IS NULL AND c.attempts<=5 AND c.code_hash=?) RETURNING envelope,tenant,vault_id,epoch,source_version,views,max_views`, mutation, link, verifier, now, now, challenge, now, attempt.code_hash),
  stmt('UPDATE lky_link_challenges SET consumed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM lky_links WHERE id=? AND mutation=?)', now, challenge, link, mutation),
  event('external_link_opened', link, 'EXISTS(SELECT 1 FROM lky_links WHERE id=? AND mutation=?)', [link, mutation]),
 ]);
 need(result[0].meta.changes && result[0].results?.length, 'link_unavailable', 403);
 const opened = result[0].results[0];
 return { link, tenant: opened.tenant, vault: opened.vault_id, epoch: opened.epoch, sourceVersion: opened.source_version, envelope: JSON.parse(opened.envelope), views: opened.views, maxViews: opened.max_views, disclosure };
}
