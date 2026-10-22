import type { RuntimeInput } from '../runtime/client.mjs';
export function loadSecrets(input: RuntimeInput & { references: Record<string, string> }): Promise<Record<string, string>>;
