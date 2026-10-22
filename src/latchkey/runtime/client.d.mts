import type { SecretValue } from '../projects/model.mjs';
export interface RuntimeScope {
 id: string; reference: string; kind: 'project' | 'field'; vault: string;
 object: string; epoch: number; read: boolean; write: boolean; wrapped: any;
}
export interface RuntimeGrant {
 schema: 1; id: string; origin: string; tenant: string; account: string;
 authorityKey: string; machine: string; token: string; expiresAt: number;
 maxUses: number | null; scopes: RuntimeScope[];
}
export interface RuntimeInput {
 profile: any; grant: RuntimeGrant; runtimeKey: string;
 references?: Record<string, string>; fetcher?: typeof fetch;
}
export function resolveRuntime(input: RuntimeInput & { references: Record<string, string> }): Promise<Record<string, string>>;
export function writeRuntime(input: RuntimeInput, reference: string, value: SecretValue, options: { expectedVersion: number }): Promise<{ object: string; version: number; providerState: 'unchanged' }>;
