import { canonicalJson } from '../reviews/common.mjs';
// Client-side transport only. The caller owns preview, signature verification,
// authorization, erasure checks and durable delivery obligations.
const providers = {
  Evidence: null,
  Vanta: ['https://api.vanta.com', 'https://api.vanta-gov.com'],
  Drata: ['https://public-api.drata.com', 'https://public-api.eu.drata.com', 'https://public-api.apac.drata.com'],
  Secureframe: ['https://api.secureframe.com'],
};
const present = value => typeof value === 'string' && value.trim().length > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const filename = 'latchkey-signed-evidence.json';
const result = (state, status, stage, providerReference = null, retryable = false) => ({ state, providerReference, retryable, status, stage });
function baseUrl(destination, endpoint) {
  if (!Object.hasOwn(providers, destination)) throw new Error('Invalid destination');
  const url = new URL(endpoint || providers[destination]?.[0]);
  if (url.username || url.password || url.search || url.hash) throw new Error('Invalid endpoint');
  // A self-hosted Evidence installation may live on the buyer's own LAN.
  // HTTP is permitted only for literal loopback local installations.
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(destination === 'Evidence' && loopback && url.protocol === 'http:')) throw new Error('Invalid transport');
  if (providers[destination] && !providers[destination].includes(url.origin)) throw new Error('Invalid provider host');
  const allowedPath = destination === 'Drata' ? ['/','/public/v2','/public/v2/'] : ['/'];
  if (!allowedPath.includes(url.pathname)) throw new Error('Use provider origin');
  return url.origin + (destination === 'Drata' ? '/public/v2' : '');
}
function authorization(destination, credential) {
  if (destination === 'Secureframe') {
    if (!present(credential?.apiKey) || !present(credential?.keySecret) || /\s/.test(credential.apiKey + credential.keySecret)) throw new Error('Invalid credential');
    return credential.apiKey + ' ' + credential.keySecret;
  }
  if (!present(credential) || /\s/.test(credential)) throw new Error('Invalid credential');
  return 'Bearer ' + credential;
}
function form(bytes) {
  const value = new FormData();
  value.append('file', new Blob([bytes], { type: 'application/json' }), filename);
  return value;
}
async function json(response) { try { return await response.json(); } catch { return null; } }
function failed(response, stage, reference = null) {
  const retryable = response.status === 429 || response.status === 408 || response.status >= 500;
  return result(retryable ? 'backlog' : 'rejected', response.status, stage, reference, retryable);
}

/**
 * Send once; never retry or follow redirects. stage is a checkpoint object.
 * Optional resume accepts a previous stage checkpoint after known upload success,
 * and skips that upload. Persist checkpoints privately with the local package.
 * A transport failure/invalid success body is ambiguous: inspect the provider
 * before another dispatch (retryable=false), since POSTs are not idempotent.
 */
export async function deliverEvidence({ destination, endpoint, credential, target, workspace, packageValue, coveredFrom, coveredTo, fetcher = fetch, resume, beforeMutation, checkpoint }) {
  let stage = { name: 'validate' }, reference = null;
  try {
    const base = baseUrl(destination, endpoint), auth = authorization(destination, credential);
    if (!present(target) || !date(coveredFrom) || !date(coveredTo) || coveredFrom > coveredTo) throw new Error('Invalid target or period');
    if (!packageValue || typeof packageValue !== 'object' || Array.isArray(packageValue)) throw new Error('Invalid signed package');
    if (destination === 'Drata' && (!Number.isSafeInteger(Number(workspace)) || Number(workspace) <= 0)) throw new Error('Invalid workspace');
    const bytes = canonicalJson(packageValue);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes))), b => b.toString(16).padStart(2, '0')).join('');
    const binding = JSON.stringify([destination, base, target, workspace ?? null, coveredFrom, coveredTo, digest]);
    if (resume && (resume.binding !== binding || !present(resume.uploadReference) || !['Vanta', 'Drata'].includes(destination) || resume.name !== (destination === 'Vanta' ? 'submit' : 'create'))) throw new Error('Invalid checkpoint');
    stage = { name: 'upload', binding, ...(resume ? { uploadReference: resume.uploadReference } : {}) };
    const post = async (path, body, contentType) => {
      await beforeMutation?.({ ...stage });
      // The deadline covers response headers and body consumption. Aborting does
      // not prove the provider rejected a write; keep its durable attempt fenced.
      return fetcher(base + path, { method: 'POST', signal: AbortSignal.timeout(15000), redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Authorization: auth, ...(contentType ? { 'Content-Type': contentType } : {}) }, ...(body === undefined ? {} : { body }) });
    };
    const id = encodeURIComponent(target);
    if (destination === 'Evidence') {
      const body = form(bytes);
      body.set('requirement_id', target); body.set('covered_from', coveredFrom); body.set('covered_to', coveredTo);
      body.set('source', 'Latchkey signed evidence');
      const response = await post('/v1/evidence', body);
      if (!response.ok) return failed(response, stage);
      const value = await json(response);
      if (response.status !== 201 || !present(value?.receipt) || value.origin !== 'manually-asserted' || value.label !== 'source-reported') return result('backlog', response.status, { ...stage, name: 'unverified-response' });
      return result('accepted', 201, { ...stage, name: 'complete' }, value.receipt);
    }
    if (destination === 'Vanta') {
      if (!resume) {
        const body = form(bytes); body.set('effectiveAtDate', coveredTo); body.set('description', 'Latchkey signed evidence');
        const response = await post('/v1/documents/' + id + '/uploads', body);
        if (!response.ok) return failed(response, stage);
        const value = await json(response);
        if (![200, 201].includes(response.status) || !present(value?.id) || !present(value.fileName) || !present(value.mimeType) || !present(value.creationDate)) return result('backlog', response.status, { ...stage, name: 'unverified-response' });
        stage.uploadReference = value.id;
        await checkpoint?.({ ...stage });
      }
      reference = stage.uploadReference; stage = { ...stage, name: 'submit' };
      const response = await post('/v1/documents/' + id + '/submit');
      if (!response.ok) return failed(response, stage, reference);
      if (![200, 204].includes(response.status)) return result('backlog', response.status, { ...stage, name: 'unverified-response' }, reference);
      return result('accepted', response.status, { ...stage, name: 'complete' }, reference);
    }
    if (destination === 'Drata') {
      const path = '/workspaces/' + encodeURIComponent(String(workspace));
      if (!resume) {
        const response = await post(path + '/evidence-files', form(bytes));
        if (!response.ok) return failed(response, stage);
        const value = await json(response);
        if (response.status !== 201 || !present(value?.fileKey)) return result('backlog', response.status, { ...stage, name: 'unverified-response' });
        stage.uploadReference = value.fileKey;
        await checkpoint?.({ ...stage });
      }
      stage = { ...stage, name: 'create' };
      const response = await post(path + '/evidence', JSON.stringify({ name: target.slice(0, 191), artifacts: [{ type: 'S3_FILE', artifactName: filename, fileKey: stage.uploadReference, filedAt: coveredTo }] }), 'application/json');
      if (!response.ok) return failed(response, stage);
      const value = await json(response);
      reference = Number.isSafeInteger(value?.id) && value.id > 0 ? String(value.id) : null;
      if (response.status !== 201 || !reference || value.artifactsRequested !== 1 || value.artifactsCreated !== 1 || !Array.isArray(value.artifacts) || value.artifacts.length !== 1) return result('backlog', response.status, { ...stage, name: 'unverified-response' }, reference);
      return result('accepted', 201, { ...stage, name: 'complete' }, reference);
    }
    const response = await post('/tests/' + id + '/evidences?activity_completion=' + encodeURIComponent(coveredTo), form(bytes));
    if (!response.ok) return failed(response, stage);
    // Secureframe documents a default JSON response without an ID schema.
    // Preserve a provider Location only; never fabricate a receipt from target.
    const location = response.headers.get('location');
    if (location) { try { const url = new URL(location, base); if (url.origin === new URL(base).origin && !url.username && !url.password && !url.search && !url.hash) reference = url.href; } catch { /* no verified reference */ } }
    return result('accepted', response.status, { ...stage, name: 'complete', referenceAvailable: reference !== null }, reference);
  } catch {
    return result(stage.name === 'validate' ? 'rejected' : 'backlog', null, stage, reference, false);
  }
}


const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableText = value => value === null || typeof value === 'string';
const uploadedFile = row => row && present(row.id) && nullableText(row.fileName) && typeof row.title === 'string'
 && nullableText(row.description) && typeof row.mimeType === 'string' && typeof row.url === 'string'
 && timestamp(row.creationDate) && timestamp(row.updatedDate)
 && (row.deletionDate === null || timestamp(row.deletionDate)) && (row.effectiveDate === null || timestamp(row.effectiveDate))
 && (row.uploadedBy === null || present(row.uploadedBy?.id) && ['USER', 'APPLICATION'].includes(row.uploadedBy.type));
// Read-only, bounded inspection. Finding a retained upload does not prove that
// a later submit succeeded, and never authorizes repeating that mutation.
export async function inspectVantaUpload({ endpoint, credential, target, uploadReference, fetcher = fetch, beforeRead, pagination = {}, checkpoint }) {
 let cursor = pagination.cursor ?? null, pages = pagination.pages ?? 0; const seen = new Set(pagination.seenCursors ?? []), signal = AbortSignal.timeout(15000);
 try {
  const base = baseUrl('Vanta', endpoint), auth = authorization('Vanta', credential);
  if (!present(target) || !present(uploadReference)) throw Error();
  for (let page = pages; page < 10; page++) {
   await beforeRead?.();
   const query = new URLSearchParams({ pageSize: '100', ...(cursor ? { pageCursor: cursor } : {}) });
   pages++;
   const response = await fetcher(base + '/v1/documents/' + encodeURIComponent(target) + '/uploads?' + query, {
    method: 'GET', signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Authorization: auth },
   });
   if (response.status !== 200) {
    const retry = response.headers.get('retry-after');
    const seconds = /^\d+$/.test(retry ?? '') ? Number(retry) : Math.ceil((Date.parse(retry)-Date.now())/1000);
    await response.body?.cancel();
    return { presence:'unknown',status:response.status,pages:page+1,retryAfterSeconds:Number.isFinite(seconds)?Math.max(0,Math.min(86400,seconds)):0,provesSubmit:false };
   }
   const value = await json(response), data = value?.results?.data, info = value?.results?.pageInfo;
   if (!Array.isArray(data) || data.length > 100 || !data.every(uploadedFile) || typeof info?.hasNextPage !== 'boolean'
    || typeof info.hasPreviousPage !== 'boolean' || !nullableText(info.startCursor) || !nullableText(info.endCursor)) throw Error();
   const matches = data.filter(row => row?.id === uploadReference);
   if (matches.length > 1) throw Error();
   if (matches.length === 1) {
    await checkpoint?.({cursor,nextCursor:null,page:page+1});
    const row = matches[0];
    return { presence: row.fileName === filename && row.mimeType === 'application/json' && row.deletionDate === null ? 'found' : 'unknown',
     providerReference: uploadReference, status: 200, pages: page + 1, observedAt: Date.now(), provesSubmit: false };
   }
   if (!info.hasNextPage) {await checkpoint?.({cursor,nextCursor:null,page:page+1});return { presence: 'not-found', status: 200, pages: page + 1, provesSubmit: false };}
   if (!present(info.endCursor) || info.endCursor.length > 2000 || seen.has(info.endCursor)) throw Error();
   await checkpoint?.({cursor,nextCursor:info.endCursor,page:page+1});
   cursor = info.endCursor; seen.add(cursor);
  }
 } catch { /* Keep missing, malformed, denied and interrupted observations unknown. */ }
 return { presence: 'unknown', status: null, pages, provesSubmit: false };
}
