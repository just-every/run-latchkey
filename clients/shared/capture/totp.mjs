import { parseTotpUri } from '../../../src/latchkey/totp/index.mjs';
import { check } from '../../../src/latchkey/items/fields.mjs';
import jsQR from 'jsqr';

// No image or decoded seed leaves this client. Permissions and source picking
// are the browser's actual media APIs, invoked from the member's user gesture.
export async function captureTotp({ source, target, video, signal, timeout = 60000 }) {
 check(target && typeof target.object === 'string' && target.object && typeof target.issuer === 'string' && target.issuer && typeof target.account === 'string' && target.account, 'select_totp_target_first');
 check(['screen', 'camera'].includes(source) && Number.isFinite(timeout) && timeout > 0 && timeout <= 120000, 'invalid_capture_source');
 check(globalThis.isSecureContext && navigator.mediaDevices, 'secure_capture_unavailable');
 if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
 const stream = source === 'screen'
  ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  : await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
 const preview = video ?? document.createElement('video'), canvas = document.createElement('canvas');
 let timer, abort;
 try {
  preview.muted = true; preview.playsInline = true; preview.srcObject = stream;
  await preview.play();
  const context = canvas.getContext('2d', { willReadFrequently: true }); check(context, 'capture_canvas_unavailable');
  const deadline = performance.now() + timeout;
  for (;;) {
   if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
   check(performance.now() < deadline, 'capture_timed_out');
   check(stream.getVideoTracks().some(track => track.readyState === 'live'), 'capture_ended');
   if (preview.videoWidth && preview.videoHeight) {
    canvas.width = preview.videoWidth; canvas.height = preview.videoHeight;
    context.drawImage(preview, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
    pixels.data.fill(0);
    if (code) return parseTotpUri(code.data, target);
   }
   await new Promise((resolve, reject) => {
    abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 150);
   });
  }
 } finally {
  clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort);
  for (const track of stream.getTracks()) track.stop();
  preview.pause(); preview.srcObject = null;
  canvas.width = 0; canvas.height = 0;
 }
}
