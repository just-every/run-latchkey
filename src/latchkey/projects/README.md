# Encrypted projects and environments

`ProjectClient` takes an unlocked `VaultClient`. `create({name,vault?})` creates a
project in an existing company vault or a new vault. `createEnvironment(project,
{name,shared:[],inherits:[]})` creates an encrypted catalog. All names, paths,
values, connection fields and reference definitions remain inside authenticated
client-encrypted `lky_versions` records. The server stores opaque project,
environment, catalog and resource identifiers. Company vault rights govern human
reads and writes; personal/family vaults cannot host machine projects.

`set(environment,path,value,{expectedVersion?})` writes a string or typed
connection `{type:'connection',driver,host,port?,database?,username?,password?,
options?}`. A path is a nonempty slash-separated ASCII identifier; dot segments
and prototype property names are refused. Each concrete value is a distinct
encrypted object with its own derived key. A machine granted one value never
receives the environment catalog key or vault key.

`reference(environment,path,{project,environment,path})` stores a reference.
`configure(environment,{shared?,inherits?,name?})` changes a catalog.
`resolve(environment,paths)` resolves shared parents first, inherited parents
second, and local entries last. Later parents override earlier ones. Local
entries override both groups, including local references. References resolve
through the destination environment's effective configuration. Every visited
environment is checked through the authenticated service; missing resources,
foreign tenants and cycles refuse the entire resolution. No stale/default
credential is substituted. A resolution holds one local catalog snapshot per
environment and has a bounded graph size.

`preview` shows the current effective value/source and proposed value before
`set`; `history` and `compare` expose retained vault versions. `previewRollback`
and `rollback(...,{confirmed:true,expectedVersion})` restore a local resource by
appending a new encrypted version. They explicitly report `providerState:
'unchanged'`: changing vault state cannot revert an external credential. To
change an inherited resource, act on its source environment explicitly.

Creating a project/value uses the existing encrypted item door before registering
its opaque definition. A refused registration or concurrent catalog edit leaves
an encrypted, unreferenced object in the vault and reports failure. It does not
activate a partially configured reference or mint a runtime grant.

Service integration: `projectsAuthenticated(route,input,ctx)` accepts the same
live signed context as existing product modules, including `fenceArgs`. Its
routes are `project/list`, `project/create`, `project/environments`,
`project/environment/create`, `project/environment/read`,
`project/resource/create`, and `project/resource/read`.
