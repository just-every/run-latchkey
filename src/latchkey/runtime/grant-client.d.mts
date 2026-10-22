import type { RuntimeGrant } from './client.mjs';
export interface RuntimeIdentity { machine: string; deviceKey: string; recipientKey: string }
export class RuntimeGrantClient {
 constructor(client: any);
 client: any;
 grant(identity: RuntimeIdentity, fingerprint: string, selections: { reference: string; read?: boolean; write?: boolean }[], options?: { expiresInSeconds?: number; maxUses?: number | null }): Promise<RuntimeGrant>;
 revoke(grant: string | RuntimeGrant): Promise<{ revoked: string }>;
 list(): Promise<{ grants: any[] }>;
}
