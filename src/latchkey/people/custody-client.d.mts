export class CustodyClient {
 constructor(client: any);
 enroll(vault: string, custodian: string, fingerprint: string, options?: {confirmed?: boolean}): Promise<any>;
 preview(operation: string, action?: string): Promise<any>;
 trustSource(review: any, fingerprint: string): Promise<void>;
 commit(review: any, options?: {confirmed?: boolean; approvedPlanHash?: string}): Promise<any>;
}
