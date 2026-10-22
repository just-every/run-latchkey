import type { Bindings } from '../../auth.server';
import type { Session } from '../../modules/operator-auth/index.mjs';
export class RecordsError extends Error { code: string; status: number; constructor(code: string, status?: number); }
export interface RecordsContext { db: D1Database; env: Bindings; now: number; actor: string; device: string; tenant: string; session: Session; fence: string; fenceArgs: (string | number)[]; }
export const restoreOwnerRights: readonly string[];
export function portabilityAuthenticated(route: string, input: Record<string, any>, context: RecordsContext): Promise<any | null>;
export const portabilityResponse: typeof portabilityAuthenticated;
