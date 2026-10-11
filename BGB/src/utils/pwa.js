// Progressive web app (specs #41, #58): service worker registration and the install prompt.
// The worker (public/sw.js) caches the application files only, never API data.

let deferredPrompt = null; // Chrome/Edge/Samsung Internet: the saved beforeinstallprompt event
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPhone/iPad Safari has no install prompt: people add it from the Share menu
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 'prompt' (the browser can install it now), 'ios' (show the Share-menu steps) or null. */
export function installMode() {
  if (isStandalone()) return null;
  if (deferredPrompt) return 'prompt';
  if (isIos()) return 'ios';
  return null;
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Shows the browser's install dialog; resolves true when the user accepted. */
export async function promptInstall() {
  const e = deferredPrompt;
  if (!e) return false;
  deferredPrompt = null;
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // offered from the user menu instead of the browser's mini bar
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
  // Development (Vite) serves modules that must not be cached
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    });
  }
}
