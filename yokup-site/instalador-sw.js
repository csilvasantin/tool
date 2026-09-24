// Service worker del portal del instalador (Yokup Desk · FLT-100938 · MorfeoMacMini · 24-sep-2026).
// Avisos push REALES con el portal cerrado. El push llega sin carga útil (VAPID, igual que /incidencias):
// el worker pregunta qué hay nuevo a /api/installer/push/peek con el endpoint de su propia suscripción,
// que es lo que identifica al instalador sin necesitar la cookie de sesión.
const API = 'https://data.yokup.com/api/installer';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
 e.waitUntil((async () => {
  let title = '🔧 Yokup · nueva incidencia cerca', body = 'Tienes un trabajo disponible en tu zona.', tag = 'yk-installer';
  try {
   const sub = await self.registration.pushManager.getSubscription();
   if (sub) {
    const r = await fetch(API + '/push/peek', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({endpoint: sub.endpoint}), cache: 'no-store'});
    const d = await r.json();
    const n = d && d.items && d.items[0];
    if (n) {
     title = '🔧 Yokup' + (n.priority === 'urgent' ? ' · URGENTE' : '') + ' · ' + n.title;
     body = n.device_name + ' · a ' + Number(n.distance_km).toFixed(1).replace('.', ',') + ' km' + (d.items.length > 1 ? ' · +' + (d.items.length - 1) + ' más' : '');
     tag = 'yk-installer-' + n.notification_id;
    }
   }
  } catch {}
  await self.registration.showNotification(title, {body, tag, renotify: true, requireInteraction: true, icon: '/app/icon-192.png', badge: '/app/icon-192.png', data: {url: '/instalador'}});
 })());
});

self.addEventListener('notificationclick', e => {
 e.notification.close();
 e.waitUntil((async () => {
  const url = (e.notification.data && e.notification.data.url) || '/instalador';
  const open = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
  for (const c of open) if (new URL(c.url).pathname.startsWith('/instalador') && 'focus' in c) return c.focus();
  if (self.clients.openWindow) return self.clients.openWindow(url);
 })());
});
