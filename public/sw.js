/* No financial data or authenticated pages are cached by this worker. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Thông báo quản trị', {
    body: data.body || 'Mở trang quản trị để kiểm tra.',
    icon: '/pwa/icon-192.png', badge: '/pwa/icon-192.png',
    tag: data.tag || 'admin-notification',
    data: { url: data.url || '/admin' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/admin', self.location.origin);
  if (target.origin !== self.location.origin || target.pathname !== '/admin') return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of windows) {
      if (new URL(client.url).pathname === '/admin') {
        client.postMessage({type:'ADMIN_PUSH_NAVIGATE',url:target.pathname+target.search});
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
