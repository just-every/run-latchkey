# Java runtime SDK

Requires Java 8+ and the explicitly installed Latchkey Node runtime. The Java
binding uses standard Java APIs; no JSON or cryptography dependency is required.
Compile/package `src/main/java/com/runeditrun/latchkey/RuntimeSecrets.java` with
your application. The required local Node child performs authenticated decryption.

Construct `new RuntimeSecrets(installedBridgePath)` or
`new RuntimeSecrets(installedBridgePath, nodeExecutable)`. Call
`fetchJson(requestJson)` with a JSON object containing `profile`, `grant`,
`runtimeKey`, and `references`. `installedBridgePath` explicitly names the
installed `packages/sdk-node/bridge.mjs`. The method returns the exact JSON object
of approved string values (surrounding whitespace removed); parse it with your
application's JSON library. This API intentionally does not implement a JSON parser.

Requests and captured output are bounded. Calls time out after 30 seconds and
fail with `RuntimeRequestException("runtime_request_failed")`; raw subprocess
diagnostics are never returned. Credentials travel through private pipes with
no shell, credential arguments, temporary files, retries or cache.

See [the shared runtime boundary](../sdk-node/README.md). The Java consumer and
Node child are authorized decryption boundaries; the server cannot decrypt.
Do not log JSON requests or returned values. Revocation denies the next fetch;
it cannot recall values already returned to the application.
