import { ProjectClient } from './client.mjs';
import { need } from '../runtime/common.mjs';
import { pathValue, secretValue } from './model.mjs';

// One resolution holds an immutable local view of every visited catalog.
// Shared parents are lowest priority, then inherited parents, then local.
export class ProjectResolver {
 constructor(client) { this.client = client; this.projects = new ProjectClient(client); this.environments = new Map(); this.dependencies = new Map(); this.merged = new Map(); }
 async environment(id) {
  if (!this.environments.has(id)) {
   need(this.environments.size < 100, 'configuration_too_deep');
   const env = await this.projects.environment(id);
   this.environments.set(id, env);
   this.dependencies.set(`${env.vault}/${env.object}`, { vault: env.vault, object: env.object, epoch: env.epoch, version: env.version });
  }
  return this.environments.get(id);
 }
 async entries(environment, chain = new Set()) {
  need(!chain.has(environment), 'reference_cycle');
  if (this.merged.has(environment)) return this.merged.get(environment);
  const next = new Set([...chain, environment]), env = await this.environment(environment), entries = new Map();
  for (const parent of [...env.value.shared, ...env.value.inherits]) for (const [path, entry] of await this.entries(parent, next)) entries.set(path, entry);
  for (const [path, entry] of Object.entries(env.value.entries)) entries.set(path, { ...entry, sourceEnvironment: environment });
  this.merged.set(environment, entries);
  return entries;
 }
 async resolve(environment, path, chain = new Set()) {
  pathValue(path); const key = `${environment}/${path}`;
  need(!chain.has(key) && chain.size < 100, 'reference_cycle');
  const next = new Set([...chain, key]), entries = await this.entries(environment), entry = entries.get(path);
  need(entry, 'reference_missing');
  if (entry.kind === 'reference') {
   const target = await this.environment(entry.environment);
   need(target.project === entry.project, 'reference_context_mismatch');
   return this.resolve(entry.environment, entry.path, next);
  }
  const env = await this.environment(entry.sourceEnvironment);
  await this.client.call('project/resource/read', { environment: env.id, object: entry.object });
  const snapshot = await this.client.readItem(env.vault, entry.object), row = snapshot.versions.at(-1);
  need(row?.value.schema === 'latchkey/project-value/v1', 'reference_missing');
  return { environment: env.id, project: env.project, vault: env.vault, object: entry.object, epoch: snapshot.epoch, version: row.version, value: secretValue(row.value.value) };
 }
}
