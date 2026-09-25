const DEVICE_ID_KEY = 'chinese.deviceId';

/**
 * RFC 4122 v4 UUID.
 *
 * crypto.randomUUID exists only in secure contexts, so it is undefined when
 * the app is opened over plain http on a LAN address - testing on a phone
 * against the dev server. getRandomValues has no such restriction.
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Server-side rendering has no device; writes only ever happen in the browser. */
const SERVER_DEVICE_ID = 'server';

/**
 * Stable per-device id, used to tag writes so a row's origin is visible when
 * reconciling two devices. Persisted in localStorage rather than IndexedDB so
 * it is available synchronously.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return SERVER_DEVICE_ID;

  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = uuid();
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
