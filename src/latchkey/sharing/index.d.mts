import type { Bindings } from '../../auth.server';
import type { Session } from '../../modules/operator-auth/index.mjs';
export class SharingError extends Error { code: string; status: number; constructor(code: string, status?: number); }
interface PublicContext { db: D1Database; env: Bindings; now: number; limited(account: string): Promise<void>; }
interface AuthenticatedContext extends Omit<PublicContext, 'limited'> { actor: string; device: string; tenant: string; session: Session; fence: string; fenceArgs: (string | number)[]; }
export function sharingPublic(route: string, input: Record<string, any>, context: PublicContext): Promise<unknown | null>;
export function sharingAuthenticated(route: string, input: Record<string, any>, context: AuthenticatedContext): Promise<unknown | null>;
