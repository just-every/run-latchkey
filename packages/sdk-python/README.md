# Python runtime SDK

Python 3.8+ and an explicitly installed Latchkey Node runtime are required.
The Node runtime is a required local dependency and performs authenticated
decryption in the consumer's child process. No Python crypto package is needed.

Add this directory to your application's import path, then use:

```python
from latchkey_sdk import load_secrets
values = load_secrets(request, bridge_path=installed_bridge_path)
```

`request` is a dictionary with `profile`, `grant`, `runtimeKey`, and `references`.
`bridge_path` explicitly points to `packages/sdk-node/bridge.mjs` in the installed
runtime tree. Optional `node` selects the executable (default `node`); optional
`timeout` defaults to 30 seconds. Returns a dictionary of approved string values.
Failure raises `RuntimeRequestError("runtime_request_failed")` without raw
subprocess diagnostics. Input and output are bounded, with credentials sent
only over private stdin/stdout pipes and no shell. The child is stopped on timeout.

See [the shared runtime boundary](../sdk-node/README.md). There is no retry or
cache. The Python process and its Node child hold plaintext in memory; the server
does not decrypt it. Never log requests/results or send credentials in arguments.
