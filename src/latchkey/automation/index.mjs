export { AutomationError } from './common.mjs';
export { automationPublic, tools } from './mcp.mjs';
import { mcpAuthenticated } from './mcp.mjs';
import { webhooksAuthenticated } from './webhooks.mjs';
export async function automationAuthenticated(route,input,ctx) {
 const mcp = await mcpAuthenticated(route,input,ctx);
 return mcp !== null ? mcp : webhooksAuthenticated(route,input,ctx);
}
