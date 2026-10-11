// BIRDS service worker (specs #41, #58: installable on phones, fast start, opens offline).
//
// It caches the application itself and nothing else:
//   - page loads (navigations): network first, so a new release is picked up at once; offline,
//     the last index.html is used and the app shows its own "offline" state
//   - /assets/* (Vite's hashed bundles, fonts): cache first; a name never changes content
//   - other files of this site (crest, icons, manifest): served from cache, refreshed in the background
// Never cached: /api/* (incident data, evidence, messages, voice, photos), anything that isn't a
// GET, and other origins. Data stays behind authentication on the server.
const SHELL_CACHE = 'birds-shell-v1';
const ASSET_CACHE = 'birds-assets-v1';
const ASSET_LIMIT = 120; // bundles of old releases are dropped first
const SHELL = ['/', '/manifest.webmanifest', '/bgb.png', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('birds-') && ![SHELL_CACHE, ASSET_CACHE, 'birds-prefs'].includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - ASSET_LIMIT))) await cache.delete(key);
}

async function pageLoad(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    // Every client route is the same index.html; keep the latest good copy
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) await cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

async function siteFile(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return hit || (await fresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') event.respondWith(pageLoad(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request));
  else if (url.pathname !== '/sw.js') event.respondWith(siteFile(request));
});

// ---------------------------------------------------------------------------
// Web push (DOUBT-015): calls and messages while BIRDS is closed. Payloads carry names only,
// never message text. The interface language comes from the app (postMessage 'lang'); the few
// notification texts live here because a service worker can't load the app's i18n files.
// ---------------------------------------------------------------------------
const PREFS_CACHE = 'birds-prefs';
const TEXT = {
  en: {
    message: (p) => (p.groupTitle ? `${p.senderName} in ${p.groupTitle}` : p.senderName),
    messageBody: (p, n) => (n > 1 ? `${n} new messages` : p.voice ? 'Voice message' : 'New message'),
    call: 'Incoming call',
    callBody: (p) => `${p.callerName} is calling you`,
    answer: 'Answer',
    decline: 'Decline',
    missed: 'Missed call',
    missedBody: (p) => `Missed call from ${p.callerName}`,
  },
  bn: {
    message: (p) => (p.groupTitle ? `${p.groupTitle}-এ ${p.senderName}` : p.senderName),
    messageBody: (p, n) => (n > 1 ? `${n}টি নতুন বার্তা` : p.voice ? 'ভয়েস বার্তা' : 'নতুন বার্তা'),
    call: 'ইনকামিং কল',
    callBody: (p) => `${p.callerName} আপনাকে কল করছেন`,
    answer: 'ধরুন',
    decline: 'কাটুন',
    missed: 'মিসড কল',
    missedBody: (p) => `${p.callerName}-এর মিসড কল`,
  },
};
const RING_REPEAT_MS = 4000; // a ringing call notification sounds and vibrates again this often
const handledCalls = new Set(); // answered/declined from the notification: stop ringing

async function language() {
  const hit = await (await caches.open(PREFS_CACHE)).match('/__lang');
  const lang = hit ? await hit.text() : 'en';
  return TEXT[lang] ? lang : 'en';
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'lang' && TEXT[event.data.lang]) {
    event.waitUntil(caches.open(PREFS_CACHE).then((c) => c.put('/__lang', new Response(event.data.lang))));
  }
});

/** A BIRDS window the user is looking at handles it in the app instead. */
async function appInFront() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return windows.some((w) => w.visibilityState === 'visible' && w.focused);
}

async function showPush(payload) {
  const t = TEXT[await language()];
  const icon = '/icons/icon-192.png';
  const badge = '/icons/icon-192.png';

  if (payload.kind === 'message') {
    if (await appInFront()) return;
    const tag = `conv-${payload.conversationId}`;
    const [previous] = await self.registration.getNotifications({ tag });
    const count = (previous?.data?.count ?? 0) + 1;
    return self.registration.showNotification(t.message(payload), {
      body: t.messageBody(payload, count),
      tag,
      renotify: true,
      icon,
      badge,
      data: { url: `/messages/${payload.conversationId}`, count },
    });
  }

  if (payload.kind === 'call') {
    if (await appInFront()) return; // the app is ringing already
    const tag = `call-${payload.callId}`;
    const ringUntil = Date.now() + (payload.ringSeconds || 30) * 1000;
    const options = {
      body: t.callBody(payload),
      tag,
      renotify: true, // each repeat sounds and vibrates again, like a phone ringing
      requireInteraction: true,
      vibrate: [600, 300, 600, 300, 600],
      icon,
      badge,
      actions: [
        { action: 'decline', title: t.decline },
        { action: 'answer', title: t.answer },
      ],
      data: { url: '/messages', callId: payload.callId, declineToken: payload.declineToken },
    };
    await self.registration.showNotification(t.call, options);
    // Keep ringing until the call is answered, declined, missed or the notification is swiped away
    while (Date.now() + RING_REPEAT_MS < ringUntil) {
      await new Promise((r) => setTimeout(r, RING_REPEAT_MS));
      if (handledCalls.has(payload.callId)) return;
      const [shown] = await self.registration.getNotifications({ tag });
      if (!shown || shown.data?.missed || (await appInFront())) return;
      await self.registration.showNotification(t.call, options);
    }
    await new Promise((r) => setTimeout(r, Math.max(0, ringUntil - Date.now()) + 2000));
    const still = await self.registration.getNotifications({ tag });
    still.filter((n) => !n.data?.missed).forEach((n) => n.close());
    return;
  }

  if (payload.kind === 'call-ended' && payload.missed) {
    return self.registration.showNotification(t.missed, {
      body: t.missedBody(payload),
      tag: `call-${payload.callId}`,
      icon,
      badge,
      data: { url: '/calls', missed: true },
    });
  }
}

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (payload) event.waitUntil(showPush(payload));
});

// Tapping a notification opens BIRDS on the right page (an open window is reused)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (data.callId) handledCalls.add(data.callId);

  // Decline without opening BIRDS: the push carried a token for exactly this call
  if (event.action === 'decline' && data.callId && data.declineToken) {
    event.waitUntil(
      fetch(`/api/v1/calls/${data.callId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.declineToken }),
      }).catch(() => {}),
    );
    return;
  }
  // Answer: open BIRDS and answer as soon as the call reaches the app
  const target = event.action === 'answer' && data.callId ? `/messages?answer=${data.callId}` : data.url || '/';
  const url = new URL(target, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        // The open app changes page itself: a full reload would drop its in-memory sign-in
        win.postMessage({ type: 'navigate', url });
        return win.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
