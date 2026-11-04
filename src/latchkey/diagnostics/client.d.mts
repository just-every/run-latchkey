export interface DiagnosticPayload {
 schema: string;
 build: { web: string; foundation: string };
 capabilities: { secureContext: boolean; webCrypto: boolean; fileRead: boolean; localDownload: boolean; clipboardWrite: boolean; browserOnline: boolean };
 serviceStatus: 'unknown';
 errors: string[];
}
export function diagnosticErrorCode(error: unknown): string | null;
export function diagnosticPayload(error?: unknown): DiagnosticPayload;
export function diagnosticPreview(error?: unknown): string;
