import { resolveRuntime } from '../runtime/client.mjs';

export async function loadSecrets({ profile, grant, runtimeKey, references }) {
 try {
  const values = await resolveRuntime({ profile, grant, runtimeKey, references });
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some(value => typeof value !== 'string')) throw Error();
  return values;
 } catch { throw new Error('runtime_request_failed'); }
}
