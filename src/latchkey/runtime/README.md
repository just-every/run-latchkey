# Client-held machine runtime

Create a machine profile with the existing `MachineClient.create(origin,key)`
and inspect its identity with `MachineClient.identity(profile)`.
`RuntimeGrantClient(unlockedVaultClient).grant(identity,fingerprint,selections,
{expiresInSeconds:3600,maxUses:null})` creates an exact, revocable grant.
Selections are `{reference,read:true,write:false}`; at least one right is required.
Project selections support independent read/write; ordinary fields are read-only.
The sponsoring human needs current read/share rights and edit for machine write.
Both source and destination must be company vaults.

References are constructed with `projectReference(project,environment,path)` or
`fieldReference(vault,item,field)` from `projects/model.mjs`. They serialize as
`latchkey://project/<uuid>/environment/<uuid>/<path>` and
`latchkey://vault/<uuid>/item/<uuid>/field/<encoded-field>`.
Aliases and plaintext reference paths stay in the client-held grant descriptor;
the server receives opaque identifiers and path digests.

`resolveRuntime({profile,grant,runtimeKey,references:{OUTPUT_NAME:reference}})`
fetches live encrypted scopes and returns a string-valued object. Typed
connections and non-string ordinary fields return JSON strings. No cache, retry,
default value or offline approval exists. Every fetch and machine write consumes
one use, independent of how many approved scopes a fetch contains. Reads check
account/device generation, operator version, active membership, company ownership,
vault epoch, expiry, use budget and current source/catalog versions. Signed
nonces cannot be replayed. Scope and dependency checks, use accounting, audit and
data reads/writes share a D1 transaction.

`writeRuntime(input,reference,value,{expectedVersion})` appends a project value
under the exact resource key and a conditional version. It cannot write a catalog,
another path or an ordinary field. It reports vault versus provider state
separately. For a write-only grant, the caller must supply the current version
from its approved deployment/configuration workflow; no read permission is implied.

Ordinary field grants encrypt a newly selected-field projection under independent
random key material. Only that projection key is wrapped to the machine; the
ordinary item's key and sibling fields are never given to it. These grants depend
on the exact source version and fail after an edit until a new grant is reviewed.
Project grants depend on exact resolved catalogs, while concrete value edits
remain visible on the next fetch through their separate resource keys.

The SDK bridge at `packages/sdk-node/bridge.mjs` invokes this client runtime.
SDK consumers and the required local Node process are authorized decryption
boundaries. Machine private keys, runtime keys and decrypted values never enter
the control plane or model context. Previously returned values cannot be recalled;
revoke the grant and rotate exposed provider credentials separately.

Integration: import `runtimeAuthenticated`, `runtimePublic`, `RuntimeError` from
`service.mjs`. Invoke public handling after the service's origin/body validation
and before session authentication, with `{db,now,request,raw}`. Public routes are
`runtime/fetch` and `runtime/write`. Authenticated routes are `runtime/grant`,
`runtime/grants` and `runtime/revoke`; context includes existing `fenceArgs`.

Archive project/environment/resource definitions as historical domain data, but
exclude all `lky_runtime_*` authority tables. Lifecycle archive/trash must
permanently revoke grants whose scopes or dependencies touch the object, so a
later restore cannot reactivate them. Erasure must delete those grants/scopes/
dependencies along with encrypted source values. These mappings belong to the
installation's central archive, lifecycle and erasure integration.
