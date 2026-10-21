import { digest, id, decode } from '../crypto/envelope.mjs';
import { check } from './fields.mjs';
// Kept inside the version envelope: names, content, MIME type and digests never
// appear in the service's attachment metadata or a separate upload request.
export async function createAttachment(name, content, mediaType = 'application/octet-stream') {
 const data = content instanceof Uint8Array ? content : new Uint8Array(content);
 check(typeof name === 'string' && name.length > 0 && name.length <= 500 && !/[\x00-\x1f]/.test(name), 'invalid_attachment_name');
 check(typeof mediaType === 'string' && /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(mediaType), 'invalid_attachment_media_type');
 check(data.length <= 512000, 'attachment_too_large');
 let binary = ''; for (let offset = 0; offset < data.length; offset += 8192) binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
 return { id: id(), name, mediaType, size: data.length, digest: await digest(data), data: btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') };
}
export async function attachmentBytes(attachment) {
 const data = decode(attachment.data, 512000);
 check(data.length === attachment.size && await digest(data) === attachment.digest, 'attachment_integrity_failed');
 return data;
}
