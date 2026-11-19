// Network first, so updates show up right away; the cached copy is used only when offline.
const CACHE = 'nasaq-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then(
            (hit) =>
              hit ||
              (req.mode === 'navigate' ? caches.match(new URL('./', self.registration.scope).href) : Response.error()),
          ),
      ),
  );
});

// Reminders. The service sends an empty push on reminder days; the text comes from this device only
// (saved by the app under 'nasaq:reminders' in the same IndexedDB the app uses, see src/kv.ts).
function readReminders() {
  return new Promise((resolve) => {
    const req = indexedDB.open('nasaq', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => resolve({});
    req.onsuccess = () => {
      try {
        const get = req.result.transaction('kv', 'readonly').objectStore('kv').get('nasaq:reminders');
        get.onsuccess = () => {
          try {
            resolve(JSON.parse(get.result || '{}'));
          } catch {
            resolve({});
          }
        };
        get.onerror = () => resolve({});
      } catch {
        resolve({});
      }
    };
  });
}

const pad = (n) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

self.addEventListener('push', (e) => {
  e.waitUntil(
    readReminders().then((all) => {
      const r = all[todayKey()] || {
        title: 'نَسَق',
        body: 'عندك منتجات تحتاج انتباهك، افتحي التطبيق وشوفيها.',
      };
      return self.registration.showNotification(r.title, {
        body: r.body,
        icon: new URL('icon-192.png', self.registration.scope).href,
        // Android shows the badge as a white silhouette in the status bar.
        badge: new URL('badge.png', self.registration.scope).href,
        lang: 'ar',
        dir: 'rtl',
        tag: 'nasaq-reminder',
      });
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
