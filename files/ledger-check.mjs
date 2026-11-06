import { DatabaseSync } from 'node:sqlite';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const {appliedMigrations,migrationInventory}=await import(join(root,'node_modules/@runeditrun/rer/cli/portability-migrations.mjs'));
const folder=join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
let connection;
for(const name of await readdir(folder)){
 if(!name.endsWith('.sqlite'))continue;
 const candidate=new DatabaseSync(join(folder,name),{readOnly:true});
 if(candidate.prepare("SELECT 1 FROM sqlite_master WHERE name='lky_recovery_scopes'").get()){connection=candidate;break}
 candidate.close();
}
assert.ok(connection,'setup database containing the scoped migration must exist');
try{
 const db={prepare(sql){const statement=connection.prepare(sql);let args=[];return {bind(...values){args=values;return this},async all(){return {results:statement.all(...args)}}}}};
 const files=await migrationInventory(root,'DB',{}),applied=await appliedMigrations(root,db,'DB',{});
 assert.deepEqual(applied.map(row=>row.name).sort(),files.map(row=>row.name).sort());
 assert.ok(applied.some(row=>row.name==='0049_latchkey_scoped_recovery.sql'));
 console.log(JSON.stringify({check:'installed migration ledger against checkout inventory',exit:0,migrations:applied.length,scopedRecoveryMigration:true,unmatched:0}));
}finally{connection.close()}
