import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const {migrationLedgerShape,ledgerShapeQuery}=await import(pathToFileURL(join(process.cwd(),'node_modules/@runeditrun/rer/modules/deploy-kit/migration-ledger.mjs')));
const directory='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const paths=(await readdir(directory)).filter(name=>name.endsWith('.sqlite')&&name!=='metadata.sqlite');
assert.equal(paths.length,1);
const db=new DatabaseSync(join(directory,paths[0]),{readOnly:true});
try{
 const shape=migrationLedgerShape(db.prepare(ledgerShapeQuery).all());
 const applied=db.prepare(`SELECT name FROM ${shape.name} ORDER BY name`).all().map(row=>row.name);
 const expected=(await readdir('migrations/core')).filter(name=>name.endsWith('.sql')).sort();
 assert.deepEqual(applied,expected);
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lky_recovery_scopes'").get());
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lky_scoped_recovery_enrollments'").get());
 console.log(JSON.stringify({check:'migration-ledger',shape:shape.shape,applied:applied.length,pending:0,scopedRecoveryTables:true,historicalHashes:'not available in Wrangler ledger'}));
}finally{db.close()}
