export interface ExpiryCapture { id: string; vault: string; revision: number; observedAt: number; totalActiveItems: number; withExpiry: number; expiredCount: number; active: boolean }
export function captureExpiry(client: any, vault: string, options?: { confirmed?: boolean }): Promise<unknown>;
