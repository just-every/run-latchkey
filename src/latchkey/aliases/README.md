# Hide-my-email aliases

An alias is a unique address on the buyer's own forwarding domain that forwards to one approved mailbox, so a login can be created without giving a site the real address. The provider is Cloudflare Email Routing on the buyer's zone: a buyer-controlled mail service reached through its documented API. Latchkey keeps the login, the alias relationship and the provider-reported state. It is never a mail host, never reads or stores mail, and never forwards anything itself.

## Custody

`cloudflare.mjs` is a client-side transport. Never expose it as a server fetch proxy: the host is fixed to api.cloudflare.com and a token, zone, account or rule reference can only select a resource under it. The Cloudflare token is typed into the authorized person's client, used from memory and never sent to the service, saved, retried or logged.

The alias address is written into the login, which is encrypted on the client. The service stores only ownership, the vault and item identifiers, the approved domain and mailbox, the provider rule reference and the states below. Company aliases are exported by the installation owner alone, personal aliases by their owner alone, and never together.

## Ownership and who may change what

- Scope follows the vault: a company vault makes a company alias, a private-work or family vault a personal one.
- The installation owner approves company domains and mailboxes. A person approves only their own. A mailbox must be reported verified by the provider before it can receive an alias.
- A company alias forwards only to an approved company mailbox and a personal alias only to the creator's own mailbox. Work mail is never forwarded to a personal account, even at the owner's request.
- The creator or the installation owner may disable or replace a company alias. Re-pointing its forwarding is the installation owner's alone. A personal alias is its creator's alone. Every other caller is refused before any provider call.
- Revoking a domain or mailbox stops new aliases. Existing aliases show forwarding as unavailable and nothing is changed at the provider automatically.

## States

An alias is `pending` while a provider write is authorized and unanswered, then `active`, `disabled`, `failed` or `reconcile`. The service accepts a provider result as settled only when the reported read-back shows what was asked: a created or re-pointed rule enabled and forwarding to exactly the approved mailbox, a disabled rule not enabled. A rule that forwards elsewhere is `reconcile` with `provider_target_mismatch`. A refusal such as a bad token, rate limit or unverified destination changed nothing. An outage, timeout or malformed answer may have changed something, so the alias is `reconcile` and the address written with the login is used to settle it against the provider: the rule is read by reference, or searched by exact address when no reference was ever returned.

Delivery is separate and starts `unconfirmed`. The provider returns no receipt, so the only later states are a person's report that mail arrived or did not, and `forwarding-stopped` after a disable that the provider read back. Nothing here ever claims mail arrived.

A zone the provider no longer reports as enabled and ready stops new aliases and shows existing ones as unavailable: the alias depends on the provider's routing subscription staying healthy.

## Replacement, restore and erasure

Replacing an alias creates a new one for the same login, saves it with the login and then disables the old one. The login is untouched apart from its new username and alias record. A restored archive brings aliases back inactive with their provider state unverified. Person erasure removes personal alias records and a person's own configuration; company records stay with the person detached.

Primary specifications consulted 26 October 2026: the Cloudflare API reference for Email Routing settings, destination addresses and rules, whose success envelope, zone status values and literal forward rule shape `cloudflare.mjs` follows.
