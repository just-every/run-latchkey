# Explicit CLI offline cache

The native Node CLI supports `cache-refresh` and `cache-read`. Supply JSON on
standard input, using an existing private `profile` file, the `vault` identifier,
a private `cache` path and a buyer-held 32-byte base64url `cacheKey`.
`cache-refresh` additionally requires the master `password`. `cache-read`
requires a new private `output` path and makes no network request.

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

`erasure-scan` takes the ordinary private profile and password, a vault, `terms`
and a new private output path. It decrypts authorized history locally and checks
fields and decoded attachment text. The report contains object references and
counts, never the search terms or matched content. No data changes automatically.
Binary encodings, inaccessible vaults, external recipients and provider backups
remain unverified. A clean text scan never establishes complete erasure.
