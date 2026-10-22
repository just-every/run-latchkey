import { id } from '../crypto/envelope.mjs';
import { need } from '../runtime/common.mjs';
import { catalog, pathValue, secretValue, title } from './model.mjs';
import { ProjectResolver } from './resolve.mjs';

export class ProjectClient {
 constructor(client) { this.client = client; }
 async create({ name, vault } = {}) {
  const label = title(name), target = vault ?? (await this.client.createVault()).vault, project = id(), object = id();
  await this.client.put(target, { schema: 'latchkey/project/v1', name: label }, object);
  return this.client.call('project/create', { project, vault: target, object });
 }
 async list() {
  const { projects } = await this.client.call('project/list', {});
  return Promise.all(projects.map(async project => ({ ...project, value: (await this.client.readItem(project.vault, project.object)).versions.at(-1)?.value })));
 }
 async createEnvironment(project, { name, shared = [], inherits = [] } = {}) {
  const projects = await this.client.call('project/list', {}), target = projects.projects.find(row => row.id === project);
  need(target, 'not_found', 404);
  const environment = id(), object = id(), value = catalog({ schema: 'latchkey/environment/v1', project, environment, name: title(name), shared, inherits, entries: {} });
  for (const parent of [...shared, ...inherits]) await this.environment(parent);
  await this.client.put(target.vault, value, object);
  return this.client.call('project/environment/create', { project, environment, object });
 }
 async environments(project) {
  const result = await this.client.call('project/environments', { project });
  return Promise.all(result.environments.map(row => this.environment(row.id)));
 }
 async environment(environment) {
  const descriptor = await this.client.call('project/environment/read', { environment });
  const snapshot = await this.client.readItem(descriptor.vault, descriptor.object), row = snapshot.versions.at(-1);
  need(row, 'environment_not_found'); const value = catalog(row.value);
  need(value.environment === environment && value.project === descriptor.project, 'context_mismatch');
  return { ...descriptor, epoch: snapshot.epoch, version: row.version, value };
 }
 async configure(environment, { name, shared, inherits }) {
  const current = await this.environment(environment);
  const value = catalog({ ...current.value, ...(name !== undefined ? { name: title(name) } : {}), ...(shared !== undefined ? { shared } : {}), ...(inherits !== undefined ? { inherits } : {}) });
  for (const parent of [...value.shared, ...value.inherits]) await this.environment(parent);
  return this.client.put(current.vault, value, current.object, current.version);
 }
 async preview(environment, path, value) {
  pathValue(path); const normalized = secretValue(value), resolver = new ProjectResolver(this.client);
  const entries = await resolver.entries(environment), previous = entries.has(path) ? await resolver.resolve(environment, path) : null;
  return { environment, path, previous, proposed: normalized, providerState: 'unchanged', warning: 'Saving changes vault state only; provider credentials are unchanged.' };
 }
 async set(environment, path, value, { expectedVersion } = {}) {
  pathValue(path); const normalized = secretValue(value), current = await this.environment(environment);
  const previous = current.value.entries[path], object = previous?.kind === 'resource' ? previous.object : id();
  let version;
  if (previous?.kind === 'resource') version = (await this.client.readItem(current.vault, object)).versions.at(-1)?.version;
  if (expectedVersion !== undefined) need((version ?? 0) === expectedVersion, 'version_conflict', 409);
  const written = await this.client.put(current.vault, { schema: 'latchkey/project-value/v1', value: normalized }, object, version);
  if (previous?.kind !== 'resource') {
   await this.client.call('project/resource/create', { environment, object });
   const next = catalog({ ...current.value, entries: { ...current.value.entries, [path]: { kind: 'resource', object } } });
   await this.client.put(current.vault, next, current.object, current.version);
  }
  return { object, version: written.version, providerState: 'unchanged' };
 }
 async history(environment, path) {
  const selected = await new ProjectResolver(this.client).resolve(environment, path);
  return (await this.client.readItem(selected.vault, selected.object, true)).versions;
 }
 async compare(environment, path, from, to) {
  const history = await this.history(environment, path), before = history.find(row => row.version === from), after = history.find(row => row.version === to);
  need(before && after, 'version_not_found');
  return { from: before, to: after, changed: JSON.stringify(before.value.value) !== JSON.stringify(after.value.value), providerState: 'unchanged' };
 }
 async reference(environment, path, target) {
  pathValue(path); const current = await this.environment(environment);
  const next = catalog({ ...current.value, entries: { ...current.value.entries, [path]: { kind: 'reference', project: target.project, environment: target.environment, path: target.path } } });
  return this.client.put(current.vault, next, current.object, current.version);
 }
 async resolve(environment, paths) {
  const resolver = new ProjectResolver(this.client), values = Object.create(null);
  for (const path of paths) values[pathValue(path)] = (await resolver.resolve(environment, path)).value;
  return values;
 }
 async previewRollback(environment, path, version) {
  const resolver = new ProjectResolver(this.client), selected = await resolver.resolve(environment, path);
  need(selected.environment === environment, 'inherited_value_read_only');
  const history = (await this.client.readItem(selected.vault, selected.object, true)).versions;
  const previous = history.find(row => row.version === version);
  need(previous?.value.schema === 'latchkey/project-value/v1', 'version_not_found');
  return { environment, path, object: selected.object, vault: selected.vault, version, currentVersion: history.at(-1).version, value: secretValue(previous.value.value), providerState: 'unchanged', warning: 'Rollback changes vault state only; it does not revert a provider credential.' };
 }
 async rollback(environment, path, version, { confirmed = false, expectedVersion } = {}) {
  need(confirmed, 'rollback_confirmation_required');
  const preview = await this.previewRollback(environment, path, version);
  if (expectedVersion !== undefined) need(preview.currentVersion === expectedVersion, 'version_conflict', 409);
  const written = await this.client.put(preview.vault, { schema: 'latchkey/project-value/v1', value: preview.value, change: { action: 'rollback', restoredFrom: version, author: this.client.profile.account } }, preview.object, preview.currentVersion);
  return { ...written, providerState: 'unchanged' };
 }
}
