# Source

Latchkey starts from [runeditrun/base](https://github.com/runeditrun/base/tree/d1249b3d696c4011e9c72de2097f3757436074a6) commit `d1249b3d696c4011e9c72de2097f3757436074a6`. Base's foundation generator and committed edition assembler exported the runtime and modules into this editable seed. Base's `scripts/export-cli.mjs --to-package` converted its tooling to exact published `@runeditrun/rer` 0.2.74. No local CLI copy ships.

`edition.json` records the edition-owned source and Base comparison origins; `sources.lock.json` and `.edition/sources/` retain their baselines. `composition.lock.json` records the initial foundation export. App runtime copies in `src/base/` remain unchanged. Latchkey's theme (`public/rer-theme.css`) and mark (`public/brand/`) replaced Base's defaults in the design round of 21 October 2026. This source provenance is not product acceptance.
