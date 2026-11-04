export interface MigrationReview { plan: any; hash: string }
export interface MigrationApproval { approvedHash: string; vault: string; confirmed: boolean; ownership: string; sourceOwner: string }
export function validateMigrationPlan(plan: any): Promise<MigrationReview>;
export function openMigrationPreview(data: Uint8Array, previewKey: string): Promise<MigrationReview>;
export function importMigration(client: any, plan: any, approval: MigrationApproval): Promise<{ imported: number; unchanged: number; duplicate: number; cutoverComplete: false }>;
export const migrationBinding: Record<string, string | number>;
