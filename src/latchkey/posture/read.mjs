// Read-only provider edges. An inventory observation is not device attestation
// and never grants permission to unwrap a vault key.
export class PostureError extends Error {
 constructor(code) { super(code); this.code = code; }
}
const need = (value, code) => { if (!value) throw new PostureError(code); };
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
function timestamp(value) {
 if (typeof value !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
 const at = Date.parse(value);
 return Number.isSafeInteger(at) && at > 0 ? at : null;
}
const mdmAgents = ['mdm', 'easMdm', 'intuneClient', 'easIntuneClient', 'configurationManagerClientMdm', 'configurationManagerClientMdmEas'];
const endpoints = {
 jamf: id => `/api/v3/computers-inventory-detail/${id}`,
 kandji: id => `/api/v1/devices/${id}/details`,
 intune: id => `/v1.0/deviceManagement/managedDevices/${id}?$select=id,serialNumber,lastSyncDateTime,isEncrypted,osVersion,managementAgent`,
};
function providerOrigin(source, origin) {
 let url;
 try { url = new URL(origin); } catch { throw new PostureError('invalid_posture_origin'); }
 need(url.origin === origin && url.protocol === 'https:' && !url.username && !url.password && !url.port, 'invalid_posture_origin');
 const valid = source === 'intune' ? url.hostname === 'graph.microsoft.com'
  : source === 'jamf' ? /^[a-z0-9-]+\.jamfcloud\.com$/.test(url.hostname)
  : source === 'kandji' && /^[a-z0-9-]+\.api\.kandji\.io$/.test(url.hostname);
 need(valid, 'unapproved_posture_origin');
 return origin;
}
function normalize(source, value) {
 if (source === 'jamf') return {
  device: text(value.id), serial: text(value.hardware?.serialNumber),
  observedAt: timestamp(value.general?.reportDate), encrypted: boolean(value.diskEncryption?.fileVault2Enabled),
  osVersion: text(value.operatingSystem?.version), managed: boolean(value.general?.remoteManagement?.managed), screenLock: null,
 };
 if (source === 'kandji') return {
  device: text(value.general?.device_id), serial: text(value.hardware_overview?.serial_number),
  observedAt: timestamp(value.mdm?.last_check_in), encrypted: boolean(value.filevault?.filevault_enabled),
  osVersion: text(value.general?.os_version),
  managed: value.mdm?.mdm_enabled === 'True' ? true : value.mdm?.mdm_enabled === 'False' ? false : boolean(value.mdm?.mdm_enabled), screenLock: null,
 };
 return {
  device: text(value.id), serial: text(value.serialNumber), observedAt: timestamp(value.lastSyncDateTime),
  encrypted: boolean(value.isEncrypted), osVersion: text(value.osVersion),
  managed: mdmAgents.includes(value.managementAgent) ? true : value.managementAgent === 'eas' ? false : null, screenLock: null,
 };
}
async function boundedJson(response) {
 need(response.body, 'invalid_posture_response');
 const reader = response.body.getReader();
 let raw = '', length = 0;
 const decoder = new TextDecoder('utf-8', { fatal: true });
 try {
  while (true) {
   const { value, done } = await reader.read();
   if (done) break;
   length += value.length;
   need(length <= 262144, 'posture_response_too_large');
   raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  const value = JSON.parse(raw);
  need(value && typeof value === 'object' && !Array.isArray(value), 'invalid_posture_response');
  return value;
 } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Explicitly selected credentials stay in the client; no raw inventory is returned. */
export async function readPosture(input, { fetcher = globalThis.fetch, now = Date.now() } = {}) {
 const { source, origin, token, device, serial, maxAgeMs } = input;
 need(Object.hasOwn(endpoints, source), source === 'linen' ? 'linen_posture_schema_unavailable' : 'unsupported_posture_source');
 providerOrigin(source, origin);
 need(typeof token === 'string' && token.length > 0 && token.length <= 8192 && !/[\r\n\x00]/.test(token), 'posture_credential_required');
 need(text(device) && /^[A-Za-z0-9-]+$/.test(device) && text(serial), 'posture_identifier_required');
 need(Number.isSafeInteger(maxAgeMs) && maxAgeMs > 0 && maxAgeMs <= 86400000 && Number.isSafeInteger(now) && now > 0, 'invalid_posture_freshness');
 let value;
 try {
  const response = await fetcher(origin + endpoints[source](encodeURIComponent(device)), {
   method: 'GET', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
   headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(10000),
  });
  need(response.status === 200, response.status === 401 || response.status === 403 ? 'posture_permission_denied' : response.status === 429 ? 'posture_rate_limited' : 'posture_source_unavailable');
  value = normalize(source, await boundedJson(response));
 } catch (error) {
  if (error instanceof PostureError) throw error;
  throw new PostureError('posture_source_unavailable');
 }
 const matched = value.device === device && value.serial === serial;
 const freshness = !matched || !value.observedAt || value.observedAt > now ? 'unknown' : now - value.observedAt > maxAgeMs ? 'stale' : 'fresh';
 // Mismatches never expose the other device's observations or identifier.
 const controls = matched ? { encrypted: value.encrypted, osVersion: value.osVersion, managed: value.managed, screenLock: value.screenLock }
  : { encrypted: null, osVersion: null, managed: null, screenLock: null };
 return {
  schema: 'latchkey-device-posture-v1', source, matched, freshness,
  observedAt: matched ? value.observedAt : null, controls,
  authority: 'inventory-only-not-enrollment-or-unlock-authorization',
  fix: !matched ? 'Verify the enrolled device against the source record with an administrator.'
   : freshness !== 'fresh' ? 'Reconnect the device to its MDM and refresh the inventory.'
   : 'Resolve false controls in the MDM; obtain separate evidence for unknown controls.',
 };
}
