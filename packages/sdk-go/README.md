# Go runtime SDK

Requires Go 1.20+ and an explicitly installed Latchkey Node runtime. This package
uses only Go's standard library; Node performs authenticated decryption locally
as a required consumer-runtime dependency.

Construct `latchkey.Client{BridgePath: installedBridgePath}` and call
`client.Load(ctx, request)`. Optional `Node` selects the executable (default
`node`). `request` is any JSON-marshalable value with the properties `profile`,
`grant`, `runtimeKey`, and `references`. The result is `map[string]string`.
Use an explicit path to the installed `packages/sdk-node/bridge.mjs`.

Calls honor the context with a maximum duration of 30 seconds, bound input and
output, and return `ErrRuntimeRequest` for failures without exposing child stderr.
Credentials travel only through private pipes, without a shell, credential
arguments or temporary files. Calls do not retry or cache.

See [the shared runtime boundary](../sdk-node/README.md). Both the Go consumer
and its Node child are authorized plaintext boundaries; the server cannot decrypt.
Never log requests/results. Revocation denies new fetches, not past copies.
