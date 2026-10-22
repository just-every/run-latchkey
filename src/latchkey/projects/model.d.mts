export interface Connection {
 type: 'connection'; driver: string; host: string; port?: number;
 database?: string; username?: string; password?: string; options?: Record<string, string>;
}
export type SecretValue = string | Connection;
export type ParsedReference = { kind: 'project'; project: string; environment: string; path: string } | { kind: 'field'; vault: string; object: string; field: string };
export function pathValue(value: string): string;
export function title(value: string): string;
export function connection(value: unknown): Connection;
export function secretValue(value: unknown): SecretValue;
export function catalog(value: unknown): any;
export function projectReference(project: string, environment: string, path: string): string;
export function fieldReference(vault: string, object: string, field: string): string;
export function parseReference(reference: string): ParsedReference;
