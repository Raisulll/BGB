// Web push on this device (spec #58 extension, DOUBT-015): calls and messages reach the phone
// while BIRDS is closed. The service worker (public/sw.js) shows the notifications.
import * as pushApi from '../api/push';
import { isIos, isStandalone } from './pwa';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const registration = async () => (supported() ? navigator.serviceWorker.getRegistration('/') : null);

/** VAPID public key (base64url) -> the Uint8Array PushManager wants. */
function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * This device's state:
 * 'unsupported' | 'install-first' (iPhone/iPad: only an installed app gets push) | 'server-off'
 * (no VAPID keys) | 'denied' (blocked in browser settings) | 'off' | 'on'
 */
export async function pushState() {
  if (!supported()) return isIos() && !isStandalone() ? 'install-first' : 'unsupported';
  const reg = await registration();
  if (!reg) return 'unsupported'; // development build, or the worker isn't installed yet
  const cfg = await pushApi.config().catch(() => null);
  if (!cfg?.enabled) return 'server-off';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await reg.pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted') return 'off';
  const { active } = await pushApi.status(sub.endpoint).catch(() => ({ active: false }));
  return active ? 'on' : 'off';
}

/** Asks for permission (must run from a click) and registers this device. */
export async function enablePush() {
  const reg = await registration();
  const cfg = await pushApi.config();
  if (!reg || !cfg.enabled) throw new Error('unavailable');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with other keys (the server's keys changed) can't be used
  const current = sub?.options?.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(cfg.publicKey)))) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) });
  await pushApi.subscribe(sub.toJSON());
  return 'on';
}

/** Unregisters this device on the server and in the browser. */
export async function disablePush() {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'off';
  await pushApi.unsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
  return 'off';
}

/**
 * After sign-in: a device this user turned on before is bound to the new session (pushes are tied
 * to the session they were registered in). Never turns push on by itself.
 */
export async function resumePush() {
  if (!supported() || Notification.permission !== 'granted') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await pushApi.subscribe(sub.toJSON(), { resume: true }).catch(() => {});
}

/** Closes this device's notifications with this tag (e.g. a call that was answered in the app). */
export async function closeNotifications(tag) {
  const reg = await registration().catch(() => null);
  const list = await reg?.getNotifications({ tag }).catch(() => []);
  list?.forEach((n) => n.close());
}

/** The service worker writes notifications in the interface language. */
export async function tellWorkerLanguage(lang) {
  const reg = await registration().catch(() => null);
  reg?.active?.postMessage({ type: 'lang', lang });
}
