// Preferences contain no unlock authority and apply to one enrolled browser profile.
export const inactivityMinutes = [0, 1, 5, 15, 30];
const defaults = () => ({ minutes: 0, background: false });
export function browserLockBinding(client) {
 const p = client.profile;
 client.assertSession();
 return { origin: client.origin, tenant: p.tenant, account: p.account, device: p.device, generation: p.generation };
}
export function browserLockKey(binding) {
 return 'latchkey.browser-lock.' + JSON.stringify(binding);
}
function valid(value) {
 return value?.schema === 1 && inactivityMinutes.includes(value.minutes) && typeof value.background === 'boolean';
}
export function readBrowserLock(client, storage = globalThis.localStorage) {
 const binding = browserLockBinding(client), raw = storage.getItem(browserLockKey(binding));
 if (!raw) return defaults();
 const saved = JSON.parse(raw);
 if (!valid(saved) || JSON.stringify(saved.binding) !== JSON.stringify(binding)) throw { code: 'browser_lock_settings_invalid' };
 return { minutes: saved.minutes, background: saved.background };
}
export function reviewBrowserLock(client, settings) {
 const binding = browserLockBinding(client);
 if (!valid({ schema: 1, ...settings })) throw { code: 'browser_lock_settings_invalid' };
 return { binding, settings: { minutes: settings.minutes, background: settings.background }, session: client.session };
}
export function applyBrowserLock(client, review, storage = globalThis.localStorage) {
 client.assertSession(review.session);
 if (JSON.stringify(review.binding) !== JSON.stringify(browserLockBinding(client))) throw { code: 'profile_mismatch' };
 if (!valid({ schema: 1, ...review.settings })) throw { code: 'browser_lock_settings_invalid' };
 storage.setItem(browserLockKey(review.binding), JSON.stringify({ schema: 1, binding: review.binding, ...review.settings }));
}
// Wall-clock time never extends a live inactivity deadline; performance time is
// monotonic. Page lifecycle return always requires a new authorized unlock.
export function watchBrowserLock(client, lock, { window: win = globalThis.window, document: doc = globalThis.document } = {}) {
 let settings, lastActivity = win.performance.now(), timer, stopped = false;
 const stop = () => {
  if (stopped) return;
  stopped = true; win.clearTimeout(timer);
  for (const name of ['pointerdown', 'keydown', 'input', 'wheel']) doc.removeEventListener(name, activity, true);
  doc.removeEventListener('visibilitychange', visibility);
  win.removeEventListener('pagehide', leave); win.removeEventListener('pageshow', returned);
  win.removeEventListener('storage', storageChanged);
 };
 const expire = () => { if (!stopped) { stop(); lock(); } };
 const schedule = () => {
  win.clearTimeout(timer);
  if (!settings.minutes || stopped) return;
  const left = settings.minutes * 60000 - (win.performance.now() - lastActivity);
  if (left <= 0) expire(); else timer = win.setTimeout(schedule, left);
 };
 const activity = event => {
  if (!event.isTrusted || doc.visibilityState !== 'visible') return;
  // A late event must never revive a deadline already reached.
  schedule();
  if (stopped) return;
  lastActivity = win.performance.now(); schedule();
 };
 const visibility = () => { if (settings.background && doc.visibilityState === 'hidden') expire(); else schedule(); };
 const leave = () => expire();
 const returned = event => { if (event.persisted) expire(); };
 const reload = () => {
  if (stopped) return;
  try { settings = readBrowserLock(client); lastActivity = win.performance.now(); visibility(); }
  catch { expire(); }
 };
 const key = browserLockKey(browserLockBinding(client));
 const storageChanged = event => { if (event.key === key || event.key === null) expire(); };
 for (const name of ['pointerdown', 'keydown', 'input', 'wheel']) doc.addEventListener(name, activity, true);
 doc.addEventListener('visibilitychange', visibility);
 win.addEventListener('pagehide', leave); win.addEventListener('pageshow', returned);
 win.addEventListener('storage', storageChanged);
 reload();
 return { stop, reload };
}
