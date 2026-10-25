export function peopleRolePolicy(db: D1Database): (decision: any) => Promise<boolean>;
export function adminAuthenticated(route: string, input: any, ctx: any): Promise<any>;
export function requirePeople(ctx: any, permission: string): Promise<void>;
export const adminRights: string[];
