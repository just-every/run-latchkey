export type BulkAction = 'move' | 'tag' | 'archive';
export interface BulkReference { vault: string; object: string }
export interface BulkRecipient {
 account: string; rights: string[]; generation: number; recipientKey: string; authorityKey: string;
 operatorVersion: number; status: string; keyHash: string;
}
export interface BulkVault {
 id: string; kind: string; owner: string; epoch: number; revision: number;
 rights: string[]; recipients: BulkRecipient[];
}
export interface BulkSelection extends BulkReference {
 version: number | null; versions: number[]; state: string; stateVersion: number | null;
 rights: string[]; allowed: boolean; reason?: string; historyHash?: string; lifecycleHash?: string;
}
export interface BulkPlan {
 schema: 'latchkey/bulk-plan/v1'; tenant: string; actor: string; operation: string;
 createdAt: number; expiresAt: number; action: BulkAction; selection: BulkSelection[];
 destination: BulkVault | null; recipients: BulkRecipient[]; vaults: BulkVault[];
 tagsHash: string; subjectFenceCount: number;
}
export interface BulkPreview extends BulkPlan { planHash: string; tags: string[] }
export interface BulkTransport {
 profile: any;
 call(route: string, input: Record<string, unknown>): Promise<any>;
 snapshot(vault: string): Promise<{ key: Uint8Array; result: any }>;
 decodeVersions(snapshot: any): Promise<{ object: string; version: number; value: any }[]>;
}
export class BulkClientError extends Error { code: string; status: number; constructor(code: string, status?: number) }
export class BulkClient {
 constructor(client: BulkTransport);
 client: BulkTransport;
 preview(input: { selection: BulkReference[]; destination?: string | null; action: BulkAction; tags?: string[] }): Promise<BulkPreview>;
 commit(preview: BulkPreview, options: { confirmed: true }): Promise<{ operation: string }>;
 undo(operation: string, options: { confirmed: true }): Promise<{ operation: string; undone: true; undoneAt: number }>;
}
