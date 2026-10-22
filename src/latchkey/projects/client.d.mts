import type { SecretValue } from './model.mjs';
export interface ProjectDescriptor { project: string; vault: string; object: string }
export interface EnvironmentDescriptor { environment: string; project: string; vault: string; object: string }
export class ProjectClient {
 constructor(client: any);
 client: any;
 create(options: { name: string; vault?: string }): Promise<ProjectDescriptor>;
 list(): Promise<any[]>;
 createEnvironment(project: string, options: { name: string; shared?: string[]; inherits?: string[] }): Promise<EnvironmentDescriptor>;
 environments(project: string): Promise<any[]>;
 environment(environment: string): Promise<any>;
 configure(environment: string, options: { name?: string; shared?: string[]; inherits?: string[] }): Promise<any>;
 preview(environment: string, path: string, value: SecretValue): Promise<any>;
 set(environment: string, path: string, value: SecretValue, options?: { expectedVersion?: number;expectedCatalogVersion?:number }): Promise<{ object: string; version: number; providerState: 'unchanged' }>;
 reference(environment: string, path: string, target: { project: string; environment: string; path: string }): Promise<any>;
 resolve(environment: string, paths: string[]): Promise<Record<string, SecretValue>>;
 history(environment: string, path: string): Promise<any[]>;
 compare(environment: string, path: string, from: number, to: number): Promise<any>;
 previewRollback(environment: string, path: string, version: number): Promise<any>;
 rollback(environment: string, path: string, version: number, options?: { confirmed?: boolean; expectedVersion?: number;expectedCatalogVersion?:number }): Promise<any>;
}
