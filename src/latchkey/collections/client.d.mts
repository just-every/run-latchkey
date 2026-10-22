export type ItemState = 'active' | 'archived' | 'trash';
export interface Criteria {
 query?: string; type?: string; tag?: string; favorite?: boolean; owner?: string;
 expiryBefore?: number | string; health?: string; state?: ItemState;
}
export interface RecordRow { object: string; version: number; value: Record<string, any> }
export interface Lifecycle { object: string; state: ItemState; expiresAt?: number | null }
export interface ItemRow extends RecordRow { lifecycle: Lifecycle }
export interface LoadedVault {
 records: RecordRow[]; lifecycle: Lifecycle[];
 vault: { id: string; kind: string; owner: string };
}
export interface OrganizationTransport {
 readVault(vault: string): Promise<{ versions: RecordRow[] }>;
 call(route: string, input: Record<string, unknown>): Promise<any>;
 put(vault: string, value: Record<string, unknown>, object: string, expectedVersion?: number): Promise<any>;
}
export function filterRecords(records: RecordRow[], criteria?: Criteria, options?: {
 lifecycle?: Lifecycle[]; owner?: string; now?: number | (() => number);
}): ItemRow[];
export class OrganizationClient {
 constructor(client: OrganizationTransport);
 client: OrganizationTransport;
 load(vault: string): Promise<LoadedVault>;
 search(vault: string, criteria?: Criteria): Promise<ItemRow[]>;
 filters(vault: string): Promise<RecordRow[]>;
 saveFilter(vault: string, filter: { name: string; criteria: Criteria }, object?: string): Promise<any>;
 collections(vault: string): Promise<RecordRow[]>;
 collection(vault: string, collection: { name: string; parent?: string | null; items?: string[] }, object?: string): Promise<any>;
}
