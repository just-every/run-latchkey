import type { Bindings } from '../../auth.server';
import type { Session } from '../../modules/operator-auth/index.mjs';
export class ItemErasureError extends Error { code: string; status: number; constructor(code: string, status?: number); }
export interface ErasureContext { db: D1Database; env: Bindings; now: number; actor: string; device: string; tenant: string; session: Session; fence: string; fenceArgs: (string | number)[]; }
export function erasureAuthenticated(route: string, input: Record<string, any>, context: ErasureContext): Promise<any | null>;
export function erasureKnown(context: Pick<ErasureContext, 'db' | 'tenant'>, vault: string, object: string): Promise<boolean>;
