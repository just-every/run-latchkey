import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// Workers forbid runtime WASM compilation. Extract the pinned package's exact
// embedded bytes at build time; Wrangler imports a precompiled Module. No
// cryptographic implementation is changed or vendored in the product source.
export function opaqueWorker() {
 const require = createRequire(import.meta.url);
 const sourcePath = resolve(dirname(require.resolve('@serenity-kit/opaque')), '../esm/index.js');
 const source = readFileSync(sourcePath, 'utf8');
 const match = source.match(/function wasmData\(imports\)\{return _loadWasmModule\(0, null, '([A-Za-z0-9+/=]+)'/);
 if (!match) throw Error('Pinned OPAQUE WASM package format changed');
 const cache = resolve('.cache/latchkey');
 mkdirSync(cache, { recursive: true });
 const modulePath = resolve(cache, 'opaque.wasm');
 writeFileSync(modulePath, Buffer.from(match[1], 'base64'));
 return {
  name: 'latchkey-opaque-worker', enforce: 'pre',
  transform(code, file) {
   if (!file.replaceAll('\\', '/').split('?')[0].endsWith('/@serenity-kit/opaque/esm/index.js') || this.environment?.name !== 'ssr') return;
   const start = code.indexOf('/* @ts-self-types=');
   if (start < 0 || !code.includes('module_or_path: wasmData()')) throw Error('Pinned OPAQUE initialization changed');
   return { code: `import opaqueModule from ${JSON.stringify(modulePath)};\n` + code.slice(start).replace('module_or_path: wasmData()', 'module_or_path: opaqueModule'), map: null };
  },
 };
}
