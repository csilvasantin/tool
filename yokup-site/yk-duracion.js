/* Yokup · yk-duracion.js — cuánto DURÓ una incidencia (o cuánto lleva abierta).
 *
 * Carlos, 01-10-2026: en una incidencia finalizada «Abierta hace 31s» engaña —
 * parece que sigue abierta—. Lo que interesa es la DURACIÓN: de la creación al
 * cierre; mientras sigue viva, el tiempo transcurrido EN VIVO.
 *
 * Una sola fuente para la ficha (/ticket), la bandeja (/incidencias) y el informe
 * (/informe-incidencia). Sin dependencias ni DOM: se carga como <script> clásico
 * (window.YkDuracion) y como módulo CommonJS en las pruebas.
 *
 * Marcas de tiempo: D1 guarda unas en ms y otras en segundos (mismo umbral que
 * fecha()/fechaCorta(): por debajo de 4102444800 son segundos).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YkDuracion = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var SLA_MS = 2 * 3600 * 1000; // el mismo SLA de 2 h que pinta YkMisiones.slaLeft

  function toMs(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return n < 4102444800 ? n * 1000 : n;
  }

  function cerrada(t) {
    var s = t && (t.visible_state || t.status);
    return s === "resolved" || s === "done" || s === "cancelled";
  }

  // Fin del ciclo: la finalización; una eliminada cierra con closed_at.
  function finDe(t) {
    if (!t || !cerrada(t)) return null;
    return toMs(t.resolved_at) || toMs(t.closed_at) || toMs(t.updated_at);
  }

  // { ms, viva, inicio, fin } — viva=true si sigue abierta (duración en curso).
  function duracion(t, ahora) {
    var inicio = toMs(t && t.created_at);
    if (!inicio) return null;
    var fin = finDe(t), viva = !fin;
    var hasta = fin || (ahora == null ? Date.now() : ahora);
    return { ms: Math.max(0, hasta - inicio), viva: viva, inicio: inicio, fin: fin };
  }

  // 31 s · 4 min 12 s · 25 min · 2 h 14 min · 3 h · 2 d 5 h
  function formato(ms) {
    if (ms == null || !isFinite(ms)) return "—";
    var s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return s + " s";
    var m = Math.floor(s / 60);
    if (m < 10) return m + " min" + (s % 60 ? " " + (s % 60) + " s" : "");
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
    var d = Math.floor(h / 24);
    return d + " d" + (h % 24 ? " " + (h % 24) + " h" : "");
  }

  // Texto principal de la tarjeta Fechas / la bandeja.
  function etiqueta(t, ahora) {
    var d = duracion(t, ahora);
    if (!d) return "Sin fecha de creación";
    return (d.viva ? "Abierta hace " : "Duración ") + formato(d.ms);
  }

  // Tiempo hasta que alguien se puso con ella (started_at); null si no consta.
  function atencion(t) {
    var inicio = toMs(t && t.created_at), empezada = toMs(t && t.started_at);
    if (!inicio || !empezada || empezada < inicio) return null;
    return empezada - inicio;
  }

  // SLA de la casa (2 h desde la creación): { ok, ms, sla, restante }.
  function sla(t, ahora) {
    var d = duracion(t, ahora);
    if (!d) return null;
    return { ok: d.ms <= SLA_MS, ms: d.ms, sla: SLA_MS, restante: SLA_MS - d.ms, viva: d.viva };
  }

  return { toMs: toMs, cerrada: cerrada, finDe: finDe, duracion: duracion, formato: formato,
    etiqueta: etiqueta, atencion: atencion, sla: sla, SLA_MS: SLA_MS };
});
