# Explicit CLI offline cache

The native Node CLI supports `cache-refresh` and `cache-read`. Supply JSON on
standard input, using an existing private `profile` file, the `vault` identifier,
a private `cache` path and a buyer-held 32-byte base64url `cacheKey`.
`cache-refresh` additionally requires the master `password`. `cache-read`
requires a new private `output` path and makes no network request.

`node scripts/latchkey.mjs cache-totp` also accepts JSON on standard input.
Select the same `profile`, `vault`, `cache` and `cacheKey`, the exact `object`
identifier, an optional `field` identifier (default `totp`), and a new private
`output` path. No password or connection is needed for this disconnected door;
possession of the buyer-held cache key unlocks its encrypted content. The output
file is created with mode 0600 and never replaces an existing file. It contains
only the code, its validity interval, last sync and disconnected-authority status.
Terminal output reports that the file was written and never prints the code,
seed, account label or issuer. Keep the file private and delete it after use.
For a custom item, select its exact OTP field identifier. A missing field or a
field of another type is refused; the command never chooses a different field.

A successful refresh captures the verified vault owner and lifecycle state at
the same revision as the decrypted snapshot. Offline TOTP is currently available
only to that vault owner, for active typed items with a unique latest version
and an OTP field. It never falls back to an older version when the latest one
has no OTP field. Archived and trashed items, ambiguous versions, foreign
bindings, invalidated caches and caches without this eligibility metadata are
refused. Refresh an older cache while authorized before requesting offline codes.
Ordinary read recipients can still refresh and read their existing cache; this
new TOTP door does not grant them owner eligibility.

The command uses the local clock and the same RFC-tested implementation as
connected TOTP. A wrong device clock produces wrong codes; this does not provide
rollback-resistant elapsed time or implement finite offline-expiry policies.
The default remains no expiry or mandatory renewal, including multi-day outages.

Refresh writes an invalidated record before authentication or any network use.
Only a fresh authorized vault read replaces it with encrypted content. Revoked
authority, an unavailable service, an interrupted process or refused authentication
leaves the old cache inaccessible through this door. An exclusive adjacent lock
serializes reads and refreshes; after a crash, remove that lock only after verifying
that its process has stopped. Never restore an older cache to bypass invalidation.

Offline reads have no default expiry and explicitly report disconnected,
unverified authority. Reconnection reconciles item erasure proofs and key epochs
through the existing signed vault snapshot. This is the Node CLI implementation,
not a claim of laptop autofill, secure hardware storage or a mobile release.
Copies of old cache files and separately saved plaintext cannot be recalled.
An archive, trash, revocation or erasure that occurs after the last refresh is
unknown while disconnected. An old copied cache can still generate codes;
reconnect invalidation protects this CLI path, not those external copies.
Provider credential rotation and verified rejection remain separate work.

`erasure-scan` takes the ordinary private profile and password, a vault, `terms`
and a new private output path. It decrypts authorized history locally and checks
fields and decoded attachment text. The report contains object references and
counts, never the search terms or matched content. No data changes automatically.
Binary encodings, inaccessible vaults, external recipients and provider backups
remain unverified. A clean text scan never establishes complete erasure.
