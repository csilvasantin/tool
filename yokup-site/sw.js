// Service Worker de Yokup — push en segundo plano (app cerrada) para avisos de incidencias.
const API = "https://yokup-rtc.csilvasantin.workers.dev";

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let title = "🔴 Nueva incidencia · Yokup", body = "Se ha abierto un ticket de soporte", url = "/incidencias";
    try {
      // El push llega SIN payload, así que hay que preguntar qué anunciar. NO se
      // puede usar /tickets: está tras el perímetro Google y un service worker no
      // lleva sesión — devolvía 401 y el aviso salía siempre genérico. Se usa
      // /push/peek con la llave del dispositivo, que viaja en la URL con la que
      // se registró este SW (self.location) y por tanto sobrevive a los reinicios.
      const k = new URL(self.location.href).searchParams.get("k") || "";
      const r = await fetch(API + "/push/peek?k=" + encodeURIComponent(k), { cache: "no-store" });
      const d = await r.json();
      const t = d && d.ticket;
      if (t) { title = "🔴 Incidencia " + t.id; body = t.subject + " — " + t.screen + " · 👷 " + t.assignee; url = "/ticket?id=" + t.id; }
    } catch (e) {}
    await self.registration.showNotification(title, { body, tag: "yk-inc", renotify: true, icon: "/app/icon-192.png", badge: "/app/icon-192.png", data: { url } });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const url = (e.notification.data && e.notification.data.url) || "/incidencias";
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { try { await c.navigate(url); } catch (e) {} return c.focus(); } }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
