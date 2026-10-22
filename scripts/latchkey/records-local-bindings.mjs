import { readFile, readdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseJsonc } from '@runeditrun/rer/jsonc';
import { migrationReplay } from '@runeditrun/rer/modules/portability/migration-history';
import { appliedMigrations } from '@runeditrun/rer/internal/modules/portability/bridge.mjs';
import { migrationStatements } from '@runeditrun/rer/internal/modules/portability/migration-sql.mjs';
import { portabilityPlan, ensurePortabilitySchema } from '@runeditrun/rer/internal/modules/container/portability-schema.mjs';
import { legacyTargetState, requireLegacyEmpty } from '@runeditrun/rer/modules/portability/legacy-safety';
import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { requireRecords as need } from '../../src/latchkey/portability/common.mjs';
import { fingerprint } from './records-local-input.mjs';

export async function configuration(root, policy) {
 const config = parseJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
 need(Array.isArray(config.d1_databases) && config.d1_databases.length === 1 && config.d1_databases[0].binding === 'DB', 'records_database_inventory');
 const source = config.d1_databases[0], directory = await realpath(resolve(root, source.migrations_dir ?? 'migrations'));
 const within = relative(root, directory); need(within !== '..' && !within.startsWith('..' + sep) && !isAbsolute(within), 'records_migration_directory');
 const migrations = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.sql')).sort().map(async name => {
  const sql = await readFile(join(directory, name), 'utf8'); return { name, sql, sha256: fingerprint(sql) };
 }));
 const r2 = (config.r2_buckets ?? []).map(bucket => ({ binding: bucket.binding, bucket_name: bucket.bucket_name }));
 need(r2.every(bucket => Object.hasOwn(policy.buckets ?? {}, bucket.binding)), 'records_bucket_policy_required');
 need(Object.keys(policy.buckets ?? {}).every(name => r2.some(bucket => bucket.binding === name)), 'records_bucket_inventory');
 const data = { name: config.name, compatibility_date: config.compatibility_date, compatibility_flags: config.compatibility_flags ?? [],
  d1_databases: [{ binding: 'DB', database_name: source.database_name, database_id: source.database_id, migrations_dir: directory }], ...(r2.length ? { r2_buckets: r2 } : {}) };
 const policyBytes = await readFile(join(root, 'scripts/latchkey/archive-policy.mjs'));
 return { data, migrations, hash: fingerprint(canonicalJson({ data, migrations: migrations.map(({ name, sha256 }) => ({ name, sha256 })), policy: fingerprint(policyBytes) })) };
}
export async function localBindings(root, config, policy, operationToken, resuming) {
 const require = createRequire(join(root, 'package.json')), wrangler = require('wrangler');
 const temporary = await mkdtemp(join(root, '.wrangler', 'latchkey-records-'));
 const configPath = join(temporary, 'wrangler.json'), envFile = join(temporary, 'no-local-variables');
 await writeFile(configPath, JSON.stringify(config.data), { mode: 0o600 });
 let proxy;
 const close = async () => { await proxy?.dispose(); proxy = undefined; await rm(temporary, { recursive: true, force: true }); };
 const connect = () => wrangler.getPlatformProxy({ configPath, envFiles: [envFile], persist: { path: join(root, '.wrangler/state/v3') }, remoteBindings: false });
 try {
  proxy = await connect();
  const bindingNames = Object.keys(policy.buckets ?? {}), buckets = () => Object.fromEntries(bindingNames.map(name => [name, proxy.env[name]]));
  const applied = await appliedMigrations(proxy.env.DB) ?? [];
  need(applied.every(name => config.migrations.some(migration => migration.name === name)), 'records_migration_source_missing');
  const replay = async () => {
   const names = await appliedMigrations(proxy.env.DB) ?? [];
   return migrationReplay(names.map(name => {
    const entry = config.migrations.find(migration => migration.name === name); need(entry, 'records_migration_source_missing');
    return { name, sha256: entry.sha256, statements: migrationStatements(entry.sql, wrangler.unstable_splitSqlQuery) };
   }), policy);
  };
  if (config.migrations.some(migration => !applied.includes(migration.name))) {
   need(!resuming, 'records_resume_migrations_changed', 409);
   // Do not let a refused restore migrate somebody's existing product data.
   await requireLegacyEmpty({ db: proxy.env.DB, buckets: buckets() }, await legacyTargetState(proxy.env.DB, replay));
   await proxy.dispose(); proxy = undefined;
   const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
   Object.assign(env, { CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'error', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false', RER_LOCAL_OPERATION: operationToken });
   const cli = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
   await promisify(execFile)(process.execPath, [cli, 'd1', 'migrations', 'apply', config.data.d1_databases[0].database_name, '--local', '--persist-to', join(root, '.wrangler/state'), '--config', configPath], { cwd: root, env, maxBuffer: 1024 * 1024, timeout: 120000 });
   proxy = await connect();
  }
  await ensurePortabilitySchema(proxy.env.DB, await portabilityPlan(wrangler.unstable_splitSqlQuery));
  return { db: proxy.env.DB, buckets: buckets(), migrations: replay, close };
 } catch (error) { await close(); throw error; }
}
