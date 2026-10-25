export function appendAudit(ctx: any, facts: any): Promise<any>;
export function auditFacts(ctx: any, route: string, input: any, result: string, requestId: string): any;
export function auditAuthenticated(route: string, input: any, ctx: any): Promise<any>;
export function auditMac(ctx: any, domain: string, value: any): Promise<string>;
export function auditDisposition(ctx: any, row: any, reason: string): Promise<any>;
export function auditCheckpoint(ctx: any): Promise<any>;
export const retentionDays: number;
