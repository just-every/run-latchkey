import { management } from './management.mjs';
import { internal } from './internal.mjs';
import { links } from './links.mjs';
export { SharingError } from './common.mjs';
export { sharingPublic } from './public.mjs';
export async function sharingAuthenticated(route, input, ctx) {
 if (!route.startsWith('sharing/')) return null;
 return await management(route, input, ctx) ?? await internal(route, input, ctx) ?? await links(route, input, ctx);
}
