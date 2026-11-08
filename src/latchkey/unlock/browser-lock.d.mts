export const inactivityMinutes: number[];
export function browserLockBinding(client: any): { origin: string; tenant: string; account: string; device: string; generation: number };
export function browserLockKey(binding: any): string;
export function readBrowserLock(client: any, storage?: Storage): { minutes: number; background: boolean };
export function reviewBrowserLock(client: any, settings: any): any;
export function applyBrowserLock(client: any, review: any, storage?: Storage): void;
export function watchBrowserLock(client: any, lock: () => void, options?: { window?: Window; document?: Document }): { stop: () => void; reload: () => void };
