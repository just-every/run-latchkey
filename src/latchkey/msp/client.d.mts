export interface ProviderIdentity { schema: 'latchkey/provider/v1'; provider: string; origin: string; publicKey: string; privateKey: string }
export interface PublicProviderIdentity { provider: string; publicKey: string; consoleOrigin: string }
export interface Delegation { schema: 'latchkey/delegation/v1'; origin: string; tenant: string; delegation: string; provider: string; publicKey: string; consoleOrigin: string; scopes: string[]; expiresAt: number }
export interface FleetPolicy { externalEnabled: boolean; domains: string[]; defaultDays: number; maxDays: number }
export interface FleetPreview { id: string; hash: string; tenant: string; delegation: string; revision: string | null; before: FleetPolicy; after: FleetPolicy; expiresAt: number; exceptions: unknown[] }
export interface FleetSummary { tenant: string; delegation: string; revision: string | null; observedAt: number; onboarding: { active: number; invited: number; suspended: number; enrolled: number }; members: { reference: string; status: string; enrolled: boolean }[]; health: { coverage: string; reason: string }; adoption: { coverage: string; reason: string }; commercial: { status: string; reference?: string }; policy: FleetPolicy; exceptions: unknown[] }
export class FleetError extends Error { code: string; status: number; constructor(code: string, status?: number) }
export function createProviderIdentity(consoleOrigin: string): Promise<ProviderIdentity>;
export function publicProviderIdentity(identity: ProviderIdentity): PublicProviderIdentity;
export function parsePublicProviderIdentity(value: unknown): Promise<PublicProviderIdentity>;
export function parseProviderIdentity(value: unknown, consoleOrigin: string): Promise<ProviderIdentity>;
export function parseDelegation(value: unknown, identity: ProviderIdentity): Delegation;
export class FleetClient {
 constructor(identity: ProviderIdentity, options?: { fetcher?: typeof fetch; consoleOrigin?: string });
 call(delegation: Delegation, action: string, input?: Record<string, unknown>): Promise<any>;
 summary(delegation: Delegation): Promise<FleetSummary>;
 preview(delegation: Delegation, policy: FleetPolicy): Promise<FleetPreview>;
 apply(delegation: Delegation, preview: FleetPreview): Promise<{ applied: true; operation: string; policy: FleetPolicy }>;
}
