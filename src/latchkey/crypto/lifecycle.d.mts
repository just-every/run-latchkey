export type LifecycleRight = 'read' | 'create' | 'edit' | 'export' | 'share' | 'rotate' | 'delete' | 'restore';
export interface RetentionStatement {
 schema: 1; purpose: 'trash-retention'; tenant: string; vault: string; owner: string; days: 30;
}
export interface CapabilityStatement {
 schema: 1; purpose: 'vault-rights'; tenant: string; vault: string; owner: string;
 account: string; authorityKey: string; rights: LifecycleRight[]; epoch: number; generation: number;
}
export interface TrashStatement {
 schema: 1; purpose: 'trash-item'; tenant: string; vault: string; object: string;
 owner: string; actor: string; epoch: number; version: number; revision: number;
 nonce: string; trashedAt: number; expiresAt: number;
}
export interface SignedStatement<T> { statement: T; signature: string }
export interface DeletionConsent extends SignedStatement<TrashStatement> {
 policy: SignedStatement<RetentionStatement>;
 authorization: SignedStatement<CapabilityStatement> | null;
}
export function policyText(statement: RetentionStatement): string;
export function capabilityText(statement: CapabilityStatement): string;
export function trashText(statement: TrashStatement): string;
export function validDeletionConsent(proof: unknown, expected: Partial<TrashStatement>, ownerAuthorityKey: string): Promise<boolean>;
