# Node runtime SDK

Requires the installed Latchkey runtime tree, including `../runtime/client.mjs`,
and Node 22.20.0 or newer. Import `loadSecrets` from `index.mjs` and call
`await loadSecrets({ profile, grant, runtimeKey, references })`. The returned
object maps requested names to approved string values. Obtain profiles and
grants through Latchkey's machine enrollment and authorization doors.

`bridge.mjs` is the shared executable used by the Python, Go and Java bindings.
It accepts one UTF-8 JSON request on stdin and returns one JSON object on stdout.
The request contains the same four properties as `loadSecrets`. It accepts at
most 1,500,000 input bytes and emits at most 4,000,000 response bytes, plus a
newline. Errors emit only `runtime_request_failed` on stderr and exit nonzero.

The runtime decrypts in the consumer process. The service receives encrypted
data and signed requests; it does not receive runtime keys or plaintext values.
The consumer and its Node child are authorized decryption boundaries. Treat
returned values and captured bridge output as secrets: never log them or put
them into command arguments, environment variables or temporary files for SDK
transport. There is no retry, persistent plaintext cache or offline fallback.
Every call checks current authority through the runtime service; previously
returned values cannot be recalled by revocation.
