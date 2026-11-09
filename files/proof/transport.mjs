import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
const require=createRequire(realpathSync('/workspace/run-latchkey/node_modules/wrangler/package.json'));
const undici=require('undici');
for(const name of ['Agent','Pool','Client']){
 const Original=undici[name];
 undici[name]=class extends Original{constructor(...args){const index=name==='Agent'?0:1;args[index]={...args[index],pipelining:0};super(...args)}};
}
undici.setGlobalDispatcher(new undici.Agent({pipelining:0}));
globalThis.fetch=undici.fetch;
