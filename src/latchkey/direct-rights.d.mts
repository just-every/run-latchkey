export const atomicActions: string[];
export const directRights: string[];
export interface DirectPermissions { version: number; legacy: boolean; source: string; rights: string[]; actions: Record<string, boolean> }
export function effectiveDirectRights(rights: string[], version?: number): string[];
export function directPreview(rights: string[], version: number, source: string): DirectPermissions;
export function currentDirectRights(db: any, vault: any, actor: string): Promise<DirectPermissions>;
