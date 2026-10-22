import type { RuntimeAuthenticatedContext } from '../runtime/service.mjs';
export function projectsAuthenticated(route: string, input: Record<string, any>, context: RuntimeAuthenticatedContext): Promise<unknown | null>;
