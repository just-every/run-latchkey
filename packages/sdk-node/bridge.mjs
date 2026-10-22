#!/usr/bin/env node
import { loadSecrets } from './index.mjs';

try {
 const chunks = []; let length = 0;
 for await (const chunk of process.stdin) {
  length += chunk.length;
  if (length > 1_500_000) throw Error();
  chunks.push(chunk);
 }
 const request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
 const output = JSON.stringify(await loadSecrets(request));
 if (Buffer.byteLength(output) > 4_000_000) throw Error();
 process.stdout.write(output + '\n');
} catch {
 process.stderr.write('runtime_request_failed\n');
 process.exitCode = 1;
}
