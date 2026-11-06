import { DatabaseSync } from 'node:sqlite';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=process.cwd(),directory=join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files=(await readdir(directory)).filter(name=>name.endsWith('.sqlite')&&name!=='metadata.sqlite');
if(files.length!==1)throw Error('Local migration database is ambiguous');
const local=new DatabaseSync(join(directory,files[0]),{readOnly:true});
const db={prepare(sql){let args=[];const statement=local.prepare(sql);return {bind(...values){args=values;return this},async all(){return {results:statement.all(...args)}},async first(){return statement.get(...args)??null}}}};
try{
 const { nativeMigrationPreflight }=await import(pathToFileURL(join(root,'node_modules/@runeditrun/rer/cli/portability-migrations.mjs')));
 const result=await nativeMigrationPreflight({root,db});
 if(result.nativeApply)throw Error('Local migrations are unapplied');
 console.log(JSON.stringify({check:'nativeMigrationPreflight',...result,applied:local.prepare('SELECT COUNT(*) AS count FROM d1_migrations').get().count,scopedRecovery:!!local.prepare("SELECT name FROM d1_migrations WHERE name='0049_latchkey_scoped_recovery.sql'").get()}));
}finally{local.close()}
