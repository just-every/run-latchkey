import {readFile,writeFile} from 'node:fs/promises';
import {parseContract} from '../src/base/seed-contract.mjs';

// The held Base pin predates the documentation generator. Preserve the existing
// acceptance journeys while deriving each requested evidence and gap from the
// only status source. An explicit clause list keeps unrelated legacy prose intact.
const [mode,...ids]=process.argv.slice(2);
if(!['write','check'].includes(mode)||!ids.length)throw Error('usage: node scripts/contract-docs.mjs write|check CLAUSE...');
let source=await readFile('CONTRACT.md','utf8');
// Summary rows are generated from the authoritative Status table too.
const statusRows=[...source.matchAll(/^\| `([A-Z]+-\d+)` \| ([^\n]+)$/gm)].map(match=>match[2].split(/(?<!\\)\|/).map(cell=>cell.trim())).filter(cells=>['done','partial','missing'].includes(cells[2]));
source=source.replace(/^\| (Published|Target and push further|All) \| \d+ \| \d+ \| \d+ \| \d+ \|$/gm,(line,label)=>{
 const rows=statusRows.filter(cells=>label==='All'||(label==='Published'?cells[1]==='published':cells[1]!=='published'));
 return `| ${label} | ${['done','partial','missing'].map(status=>rows.filter(cells=>cells[2]===status).length).join(' | ')} | ${rows.length} |`;
});
if(mode==='write')await writeFile('CONTRACT.md',source);
else if(source!==await readFile('CONTRACT.md','utf8'))throw Error('CONTRACT.md summary differs from its Status table; run write');
const model=parseContract(source),lines=source.split('\n');
const current=await readFile('ACCEPTANCE.md','utf8');
let acceptance=current;
for(const id of ids){
 const clause=model.clauses.find(row=>row.id===id);
 if(!clause)throw Error('unknown clause: '+id);
 const cells=lines[clause.row-1].split(/(?<!\\)\|/).slice(1,-1).map(cell=>cell.trim());
 const entries=acceptance.split('\n'),index=entries.findIndex(line=>line.startsWith(`- **${id} — `));
 if(index<0)throw Error('acceptance journey missing: '+id);
 const evidence=entries[index].indexOf(' Evidence: '),remaining=entries[index].indexOf(' Remaining scope: ');
 const marker=evidence>=0?evidence:remaining;
 if(marker<0)throw Error('acceptance evidence boundary missing: '+id);
 const journey=entries[index].slice(0,marker).replace(/Status: (?:done|partial|missing)\.\*\*/,`Status: ${clause.status}.**`);
 entries[index]=`${journey} Evidence: ${cells[4]} Gap: ${cells[5]}`;
 acceptance=entries.join('\n');
}
const rows=model.clauses.map(clause=>`| ${clause.id} | ${clause.title.replaceAll('/', ' and ')} | ${clause.kind} | ${clause.status} | ${[...new Set(clause.evidence)].map(path=>`[${path}](../${path})`).join('; ')} | [Exact assertions and remaining scope](../CONTRACT.md#status) |`);
const claims=['# Implementation claims','','Generated from CONTRACT.md. Acceptance requirements, exact assertions and remaining gaps are in that source. The status below does not claim completion for partial or missing clauses.','','| Clause | Title | Kind | Status | Evidence paths | Scope |','| --- | --- | --- | --- | --- | --- |',...rows,''].join('\n');
for(const [path,expected]of [['ACCEPTANCE.md',acceptance],['docs/CLAIMS.md',claims]]){
 let actual;try{actual=await readFile(path,'utf8')}catch(error){if(error.code!=='ENOENT')throw error}
 if(mode==='write')await writeFile(path,expected);
 else if(actual!==expected)throw Error(path+' differs from CONTRACT.md; run the matching write command');
}
console.log(`Contract documents ${mode}: ${ids.join(', ')}; ${model.counts.done} done, ${model.counts.partial} partial, ${model.counts.missing} missing.`);
