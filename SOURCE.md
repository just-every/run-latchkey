# Source

Latchkey starts from [runeditrun/base](https://github.com/runeditrun/base/tree/d1249b3d696c4011e9c72de2097f3757436074a6) commit `d1249b3d696c4011e9c72de2097f3757436074a6`. Base's foundation generator and committed edition assembler exported the runtime and modules into this editable seed. Base's `scripts/export-cli.mjs --to-package` converted its tooling to exact published `@runeditrun/rer` 0.2.74. No local CLI copy ships.

`edition.json` records the edition-owned source and Base comparison origins; `sources.lock.json` and `.edition/sources/` retain their baselines. `composition.lock.json` records the initial foundation export. App runtime copies in `src/base/` remain unchanged. Latchkey's theme (`public/rer-theme.css`) and mark (`public/brand/`) replaced Base's defaults in the design round of 21 October 2026. This source provenance is not product acceptance.

The listing preparation refreshes recorded Base copies to rer-v0.2.80 at commit `11f94fec479228d71ba6d7dd6ea7796c0d42c544` through the edition authoring CLI. Adapted source retains its explicit comparison origins.

## Agent-door source

`src/modules/agent-door`, `src/modules/business-settings` and their theme/icon
dependencies in `src/foundation/runtime` are verbatim source from Base commit
`d555e789cffb744a9f83d76ebe42a2e3bdd7a055`. `base-copies.json` records the
individual bytes and executable modes. Base's module unit tests and Business
settings test signing fixtures are excluded from the runtime copy.

Additive migrations `0045_business_settings.sql`, `0046_business_people.sql` and
`0047_agent_door.sql` install their storage without replacing applied history.
The copied modules are not mounted in Latchkey's Worker. Existing client-held
authority and the documented posture/access-request interface remain the active
product doors; copying source does not establish shared-door conformance or
Business-agent support.
