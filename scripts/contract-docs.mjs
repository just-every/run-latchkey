import {readFile,writeFile} from 'node:fs/promises';
import {parseContract} from '../src/base/seed-contract.mjs';

// The held Base pin predates the documentation generator. Preserve the existing
// acceptance journeys while deriving each requested evidence and gap from the
// only status source. An explicit clause list keeps unrelated legacy prose intact.
const [mode,...ids]=process.argv.slice(2);
if(!['write','check'].includes(mode)||!ids.length)throw Error('usage: node scripts/contract-docs.mjs write|check CLAUSE...');
const source=await readFile('CONTRACT.md','utf8'),model=parseContract(source),lines=source.split('\n');
const current=await readFile('ACCEPTANCE.md','utf8');
let acceptance=current;
for(const id of ids){
 const clause=model.clauses.find(row=>row.id===id);
 if(!clause)throw Error('unknown clause: '+id);
 const cells=lines[clause.row-1].split(/(?<!\\)\|/).slice(1,-1).map(cell=>cell.trim());
 const entries=acceptance.split('\n'),index=entries.findIndex(line=>line.startsWith(`- **${id} — `));
 if(index<0)throw Error('acceptance journey missing: '+id);
 const marker=entries[index].indexOf(' Evidence: ');
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
