const DEVICE_ID_KEY = 'chinese.deviceId';

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

  const id = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
