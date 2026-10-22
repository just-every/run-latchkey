export interface Field { id: string; label: string; type: string; secret: boolean; required?: boolean; value?: any; [key: string]: any }
export interface Item { schema: string; type: string; title: string; fields: Field[]; labels: string[]; tags: string[]; favorite: boolean; ownership: string; urls: any[]; attachments: any[]; template?: any; change?: any; [key: string]: any }
export interface ItemRecord { object: string; version: number; value: Item }
export type Task = (work: () => Promise<unknown>) => Promise<void>;
export function message(error: unknown) {
 const code = (error as any)?.code ?? (error as any)?.name;
 const explanations: Record<string, string> = { device_revoked: 'This device has been revoked. Unlock from an approved device.', authentication_failed: 'The profile and password could not unlock this account.', version_conflict: 'This item changed elsewhere. Reload it before saving.', restore_conflict: 'The item changed after your preview. Preview the current history again.', recipient_confirmation_required: 'Confirm the vault owner’s identity on a trusted client before opening this vault.', locked: 'Unlock your vault to continue.', NotAllowedError: 'Permission was declined or the request was cancelled.', AbortError: 'Capture cancelled.' };
 if (code === 'SyntaxError') return 'Check the JSON format and try again.';
 if (code === 'authority_expired') return 'Your unlock session expired or this device’s access was revoked. Unlock again with an approved profile.';
 return explanations[code] ?? (typeof code === 'string' ? code.replaceAll('_', ' ') : 'The action could not finish. Please try again.');
}
export function download(name: string, value: BlobPart, type = 'application/json') {
 const url = URL.createObjectURL(new Blob([value], { type }));
 const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copy(value: unknown) { await navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); }
