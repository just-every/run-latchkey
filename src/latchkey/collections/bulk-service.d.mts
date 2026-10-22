export class BulkError extends Error { code: string; status: number; constructor(code: string, status?: number) }
export function bulkAuthenticated(route: string, input: Record<string, any>, context: any): Promise<any | null>;
