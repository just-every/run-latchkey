export class RuntimeError extends Error { code: string; status: number; constructor(code: string, status?: number); }
export interface RuntimePublicContext { db: D1Database; now: number; request: Request; raw: Uint8Array }
export interface RuntimeAuthenticatedContext {
 db: D1Database; now: number; tenant: string; actor: string; device: string;
 fence: string; fenceArgs: (string | number)[];
}
export function runtimePublic(route: string, input: Record<string, any>, context: RuntimePublicContext): Promise<unknown | null>;
export function runtimeAuthenticated(route: string, input: Record<string, any>, context: RuntimeAuthenticatedContext): Promise<unknown | null>;
