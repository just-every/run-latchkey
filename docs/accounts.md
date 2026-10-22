# Keep linked work and family accounts independent

The CLI can keep several existing account profiles in a client-owned encrypted registry. A work profile and a personal or family profile must use different installation origins, tenants and account keys. Linking does not copy vaults, grant access, share a password or recovery kit, or create a personal account. Provision the independent installation and retain its own profile and recovery kit first.

Choose a random 32-byte registry key encoded as base64url. Keep that key and a backup of the registry under your own control, separately from company vault keys. The registry contains encrypted device profiles, not passwords, recovery kits or active sessions. Losing its key does not replace or invalidate the original profiles and recovery kits. Company account suspension does not revoke the independent installation.

All inputs, including passwords and the registry key, enter through standard input. Use a private input file outside the checkout and company exports, readable only by its owner; never put these inputs in command arguments or environment variables. The examples describe the input fields; placeholders are not usable keys or passwords.

Create a new registry with `node scripts/latchkey.mjs accounts-create < /private/create-accounts.json`. The input has this shape:

```json
{
  "accountRegistry": "/private/accounts.json",
  "registryKey": "<separately held random 32-byte base64url key>",
  "confirmed": true,
  "links": [
    {"name": "Work", "kind": "work", "profile": "/private/work-profile.json", "password": "<work password>"},
    {"name": "Family", "kind": "family", "profile": "/private/family-profile.json", "password": "<family password>"}
  ]
}
```

Each profile is verified by signing in to its own origin. A failed link creates no registry. The registry supports up to 20 profiles and a 1,000,000-byte plaintext payload; an oversized update refuses instead of replacing the registry. The registry and original profile files require owner-only permissions. No profile is uploaded to the other installation.

`accounts-list` takes `accountRegistry` and `registryKey`, and returns only names, kinds and origins. `accounts-link` additionally takes `name`, `kind`, `profile`, `password` and `confirmed: true`. The kinds are `work`, `personal` and `family`. `accounts-unlink` takes `accountName` and `confirmed: true`; unlinking removes only the local link and leaves the account and its data intact. An unavailable or suspended work account can be unlinked without contacting it.

For an existing CLI command, replace `profile` with `accountRegistry`, `registryKey` and `accountName`. Supply the selected account's password, plus the command's ordinary fields. Supported commands are `identity`, `vault-create`, `put`, `read`, `export`, `item-save`, `item-search`, `item-history`, `item-field`, `item-attachment`, `api`, `audit` and `devices`. Value-bearing results still go only to an explicitly named private output file. Export still requires its separate export key. Recovery, password changes and device enrollment continue through their original profile/kit doors; after replacing a profile, explicitly unlink and relink the updated profile.

The selected account signs in independently. Switching locks the previous client's key bundle before attempting the next sign-in. A failed switch leaves no active account and never falls back to company credentials. Commands serialize changes to the registry using an adjacent `.lock` file. `account_registry_busy` refuses before signing in or writing; after an interrupted command, remove only your own stale lock after confirming that its process has stopped. Do not remove a live command's lock.

The registry does not depend on company sponsorship or commercial entitlement. Keep the independent origin, its hosting and recovery materials under the person's control when benefits or employment end. The current proof covers CLI linking and suspension through the public administration API. Web account linking, extension and native phone clients, directory-driven hand-back, benefit lifecycle and complete independent family emergency access remain unfinished under LKY-027. A Family vault inside the company installation continues to use that installation's sign-in and is not an independent personal account.

## Move an intentionally selected family item into work

In **Find and organize**, select the family item and preview a move to a company or private-work vault. Review every selected version and the entire destination recipient set. In addition to ordinary move approval, the personal owner must explicitly confirm that the reviewed copies and history become company-owned. A corporate role cannot provide that consent, including when the person previously shared ordinary item rights. Changing recipients, rights, source versions or the destination requires a fresh preview and consent.

The client re-encrypts every selected history version and its attachments for the destination key domain and records the company ownership label. The original source is archived with personal history; unrelated family items are untouched. The audit records the operation reference and ownership change without item titles, fields or attachment content. Undo can restore the source's active state, but cannot recall company copies or past plaintext access. This existing move door works within one installation; it does not claim an atomic transfer between independent installations.
