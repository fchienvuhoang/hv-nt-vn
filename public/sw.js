/* No financial data or authenticated pages are cached by this worker. */
const APP_ORIGIN = 'https://hvntvn.danasangha.org';
const LEGACY_ORIGIN = 'https://hocviennguyenthuy-vietnam.vercel.app';
function adminTarget(value) {
  try {
    const target = new URL(value || '/admin', APP_ORIGIN);
    if (![APP_ORIGIN, LEGACY_ORIGIN].includes(target.origin) || target.pathname !== '/admin') return null;
    return new URL(target.pathname + target.search, APP_ORIGIN);
  } catch { return null; }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Thông báo quản trị', {
    body: data.body || 'Mở trang quản trị để kiểm tra.',
    icon: APP_ORIGIN + '/pwa/icon-192.png', badge: APP_ORIGIN + '/pwa/icon-192.png',
    tag: data.tag || 'admin-notification',
    data: { url: (adminTarget(data.url) || new URL('/admin', APP_ORIGIN)).href },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = adminTarget(event.notification.data?.url);
  if (!target) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of windows) {
      if (new URL(client.url).origin === APP_ORIGIN && new URL(client.url).pathname === '/admin') {
        client.postMessage({type:'ADMIN_PUSH_NAVIGATE',url:target.pathname+target.search});
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
