import { aliasRoutes } from './common.mjs';
import { createAlias, findAlias, generateLocalPart, observeDomain, observeMailbox, readAlias, requestMailbox, retargetAlias, setAliasEnabled } from './cloudflare.mjs';
import { id } from '../crypto/envelope.mjs';
const need = (condition, code, extra) => { if (!condition) { const error = new Error(code); error.code = code; Object.assign(error, extra); throw error; } };
// A provider failure is returned to the caller as it happened; Latchkey never turns it into a success.
const providerError = result => { const error = new Error(result.failure ?? 'provider_failed'); error.code = result.failure ?? 'provider_failed'; error.provider = result; return error; };
const unusable = result => result.outcome !== 'ok';
export class AliasClient {
 constructor(client) { this.client = client; }
 domains() { return this.client.call(aliasRoutes.domains, {}); }
 mailboxes() { return this.client.call(aliasRoutes.mailboxes, {}); }
 list() { return this.client.call(aliasRoutes.list, {}); }
 /** Read the zone's routing state from the provider, then record what it reported. */
 async saveDomain({ scope, zone, token, confirmed = true, fetcher }) {
  const seen = await observeDomain({ zone, token, fetcher }); if (unusable(seen)) throw providerError(seen);
  return this.client.call(aliasRoutes.domainSave, { scope, provider: 'cloudflare', zone, domain: seen.observation.domain, observation: { enabled: seen.observation.enabled, status: seen.observation.status }, confirmed });
 }
 /** Ask the provider to verify a destination, then record the verification state it reports. */
 async saveMailbox({ scope, account, address, token, requestVerification = false, confirmed = true, fetcher }) {
  const seen = requestVerification ? await requestMailbox({ account, address, token, fetcher }) : await observeMailbox({ account, address, token, fetcher });
  if (unusable(seen)) throw providerError(seen);
  need(seen.observation.found, 'alias_mailbox_not_at_provider');
  return this.client.call(aliasRoutes.mailboxSave, { scope, address, providerRef: seen.observation.providerRef, verified: seen.observation.verified, confirmed });
 }
 revokeDomain(domain) { return this.client.call(aliasRoutes.domainRevoke, { id: domain.id, revision: domain.revision, confirmed: true }); }
 revokeMailbox(mailbox) { return this.client.call(aliasRoutes.mailboxRevoke, { id: mailbox.id, revision: mailbox.revision, confirmed: true }); }
 report(alias, provider, extra = {}) {
  return this.client.call(aliasRoutes.result, { alias, outcome: provider.outcome === 'unknown' ? 'ambiguous' : provider.outcome, ruleRef: provider.ruleRef ?? null, failure: provider.outcome === 'ok' ? null : provider.failure ?? 'provider_failed', status: provider.status ?? null, observed: provider.observed ?? null, ...extra });
 }
 async #saved(alias, provider, context) {
  try { return await this.report(alias, provider); }
  catch (cause) { need(false, 'alias_result_not_saved', { alias, provider, ...context, cause }); }
 }
 /** Authorize, create the provider rule, and report the provider's own read-back. The address is returned for the caller to save with the login. */
 async create({ vault, object, domain, mailbox, replaces = null, prepare, token, fetcher }) {
  const alias = id(), began = await this.client.call(aliasRoutes.createBegin, { alias, vault, object, domain: domain.id, mailbox: mailbox.id, replaces, confirmed: true });
  const address = `${generateLocalPart()}@${began.domain.domain}`;
  // The address is written with the login before the provider is asked, so an unanswered write can always be settled against it.
  if (prepare) await prepare({ id: alias, address });
  const provider = await createAlias({ zone: began.domain.zone, alias: address, destination: began.mailbox.address, name: `Latchkey ${alias.slice(0, 8)}`, token, fetcher });
  const row = await this.#saved(alias, provider, { address });
  if (provider.outcome !== 'ok') throw Object.assign(providerError(provider), { alias: row });
  need(row.state === 'active', row.failure ?? 'alias_provider_state_mismatch', { alias: row, address });
  return { alias: row, address, replaced: replaces };
 }
 async disable(alias, { token, fetcher }) {
  const began = await this.client.call(aliasRoutes.disableBegin, { alias: alias.id, confirmed: true });
  const provider = await setAliasEnabled({ zone: began.domain.zone, ruleRef: began.ruleRef, enabled: false, token, fetcher });
  const row = await this.#saved(alias.id, provider, {});
  if (provider.outcome !== 'ok') throw Object.assign(providerError(provider), { alias: row });
  return row;
 }
 async retarget(alias, mailbox, { token, fetcher }) {
  const began = await this.client.call(aliasRoutes.retargetBegin, { alias: alias.id, mailbox: mailbox.id, confirmed: true });
  const provider = await retargetAlias({ zone: began.domain.zone, ruleRef: began.ruleRef, destination: began.mailbox.address, token, fetcher });
  const row = await this.#saved(alias.id, provider, {});
  if (provider.outcome !== 'ok') throw Object.assign(providerError(provider), { alias: row });
  return row;
 }
 /** Make a new alias, then stop the abused one. The login itself is never touched here. */
 async replace(alias, { domain, mailbox, token, fetcher }) {
  const created = await this.create({ vault: alias.vault, object: alias.object, domain: domain ?? { id: alias.domain.id }, mailbox: mailbox ?? { id: alias.mailbox.id }, replaces: alias.id, token, fetcher });
  return { ...created, disabled: await this.disable(alias, { token, fetcher }) };
 }
 /** Settle an interrupted or mismatched change by reading the rule at the provider. */
 async reconcile(alias, { address, token, fetcher }) {
  need(alias.state === 'reconcile' && alias.domain, 'alias_reconcile_not_needed'); need(address || alias.ruleRef, 'alias_reconcile_address_required');
  const domain = (await this.domains()).find(row => row.id === alias.domain.id);
  // A rule reference is read directly; without one the provider is searched for exactly this address.
  const provider = alias.ruleRef ? await readAlias({ zone: domain.zone, ruleRef: alias.ruleRef, alias: address, token, fetcher }) : await findAlias({ zone: domain.zone, alias: address, token, fetcher });
  need(provider.outcome === 'ok' || provider.failure === 'provider_rule_missing', provider.failure ?? 'provider_failed', { provider });
  return this.report(alias.id, provider);
 }
 reportDelivery(alias, state) { return this.client.call(aliasRoutes.delivery, { alias: alias.id, state, confirmed: true }); }
 /** Alias addresses live in the logins, so the client joins them to the service's relationship records by alias id. */
 async export(scope, readItems = async () => []) {
  const result = await this.client.call(aliasRoutes.export, { scope }), known = new Map((await readItems()).flatMap(row => (row.value?.aliases ?? []).map(entry => [entry.id, entry.address])));
  return { ...result, aliases: result.aliases.map(row => ({ ...row, address: known.get(row.id) ?? null })) };
 }
}
// The login keeps one record per alias it has had; the newest settled one is also its username.
export const pendingAlias = (item, entry) => ({ ...structuredClone(item), aliases: [...(item.aliases ?? []), { ...entry, provider: 'cloudflare', pending: true }] });
export function withAlias(item, created) {
 const next = structuredClone(item), field = next.fields.find(row => row.id === 'username');
 if (field) field.value = created.address; else next.fields.push({ id: 'username', label: 'Username', type: 'text', secret: false, value: created.address });
 next.aliases = (next.aliases ?? []).filter(entry => entry.id !== created.alias.id).concat({ id: created.alias.id, address: created.address, provider: 'cloudflare', domain: created.alias.domain?.domain ?? null, createdAt: created.alias.createdAt });
 return next;
}
