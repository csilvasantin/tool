// Service Worker de Yokup — push en segundo plano (app cerrada) para avisos de incidencias.
const API = "https://yokup-rtc.csilvasantin.workers.dev";

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let title = "🔴 Nueva incidencia · Yokup", body = "Se ha abierto un ticket de soporte", url = "/incidencias";
    try {
      const r = await fetch(API + "/tickets", { cache: "no-store" });
      const d = await r.json();
      const open = (d.tickets || []).filter(t => t.status === "open").sort((a, b) => b.created_at - a.created_at);
      const t = open[0];
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
