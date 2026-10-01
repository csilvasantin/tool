/* Yokup · yk-equipo.js — el «Equipo» de una incidencia y su ficha en el inventario ITIL.
 *
 * Carlos, 01-10-2026: desde el campo Equipo de la incidencia (p. ej.
 * 'demo:starbucks-alsea-paseo-de-gracia:tpv:manual:3ec933e9-…') hay que poder ver
 * las características del equipo averiado: modelo, nº de serie, fecha de compra,
 * proveedor, garantía (meses y fin) y estado. Los datos salen del inventario ITIL
 * de Yokup (yokup-api · CMDB de los Xpacios) por GET api.yokup.com/ticket/equipo.
 *
 * Una sola fuente para la ficha (/ticket), la ficha de inventario
 * (/equipo-inventario) y el informe (/informe-incidencia). Sin dependencias ni DOM:
 * <script> clásico (window.YkEquipo) y módulo CommonJS en las pruebas.
 * NADA se inventa: un dato vacío es «sin dato» y una garantía sin fechas es «Sin dato».
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YkEquipo = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var SIN = "sin dato";
  var CATEGORIA = { pantalla: "Pantalla", player: "Player", tpv: "TPV", audio: "Audio / altavoz", iot: "Sensor IoT / cámara", red: "Red", kiosk: "Kiosco", mobiliario: "Mobiliario", iluminacion: "Iluminación", otro: "Otro" };
  var ESTADO = { operational: "Operativo", degraded: "Degradado (avería)", maintenance: "En mantenimiento", retired: "Retirado", planned: "Planificado" };
  var MOTIVO = {
    no_inventariado: "No está en el inventario",
    sin_referencia: "No está en el inventario",
    xpacio_no_encontrado: "No está en el inventario (su establecimiento tampoco)",
    ambiguo: "No está en el inventario de forma inequívoca: hay varios equipos posibles",
    sin_ficha: "Está registrado, pero sin ficha en el inventario ITIL"
  };
  function vacio(v) { return v === null || v === undefined || (typeof v === "string" && !v.trim()); }
  function txt(v) { return vacio(v) ? SIN : String(v).trim(); }
  // 'AAAA-MM-DD' → 'DD/MM/AAAA' (sin zona: es un día de calendario).
  function dia(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] : (vacio(v) ? SIN : String(v)); }
  function hoyISO(now) { return new Date(now == null ? Date.now() : now).toISOString().slice(0, 10); }
  function difDias(a, b) { return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000); }

  // Insignia de garantía: en_garantia · vencida · sin_dato (pronto = vence en ≤30 días).
  function garantia(lc, now) {
    lc = lc || {};
    var hasta = lc.warranty_until || lc.warranty_end || null;
    var w = lc.warranty, dias = typeof lc.warranty_days === "number" ? lc.warranty_days : null;
    if (!w || (w !== "none" && dias === null && hasta)) {
      if (!hasta || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) w = "none";
      else { dias = difDias(hasta, hoyISO(now)); w = dias < 0 ? "expired" : dias <= 30 ? "expiring" : "valid"; }
    }
    var calc = !!lc.warranty_until_derived;
    if (w === "valid" || w === "expiring") {
      var pronto = w === "expiring";
      return { estado: "en_garantia", label: "En garantía", pronto: pronto, hasta: hasta, dias: dias,
        detalle: (pronto ? "vence en " + dias + (dias === 1 ? " día" : " días") + " · " : "hasta ") + dia(hasta) + (calc ? " (calculado)" : "") };
    }
    if (w === "expired") return { estado: "vencida", label: "Vencida", pronto: false, hasta: hasta, dias: dias, detalle: "desde " + dia(hasta) + (calc ? " (calculado)" : "") };
    return { estado: "sin_dato", label: "Sin dato", pronto: false, hasta: null, dias: null, detalle: "sin fechas de garantía en el inventario" };
  }
  function meses(n) { return typeof n === "number" && n > 0 ? n + (n === 1 ? " mes" : " meses") : SIN; }

  // Ficha completa: [{k, v, vacio, grupo}] en el orden en que se lee una ficha de CMDB.
  function campos(ci) {
    ci = ci || {}; var lc = ci.lifecycle || {}, g = garantia(lc);
    var fin = lc.warranty_end ? dia(lc.warranty_end) : lc.warranty_until ? dia(lc.warranty_until) + " (calculado)" : SIN;
    var ubic = [ci.group_name, ci.position].filter(function (x) { return !vacio(x); }).join(" · ");
    var rows = [
      ["Identificación", "Código ITIL", ci.itil_code], ["Identificación", "Nombre", ci.name],
      ["Identificación", "Categoría", CATEGORIA[ci.category] || ci.category], ["Identificación", "Uso / rol", ci.role],
      ["Modelo y especificaciones", "Fabricante", lc.manufacturer], ["Modelo y especificaciones", "Modelo", lc.model],
      ["Modelo y especificaciones", "Nº de serie", lc.serial], ["Modelo y especificaciones", "Orientación", ci.orientation === "vertical" ? "Vertical" : ci.orientation === "horizontal" ? "Horizontal" : ""],
      ["Compra", "Fecha de compra", lc.purchase_date ? dia(lc.purchase_date) : ""], ["Compra", "Proveedor", lc.supplier], ["Compra", "Factura / albarán", lc.invoice_ref],
      ["Garantía", "Estado de la garantía", g.estado === "sin_dato" ? "" : g.label + " · " + g.detalle], ["Garantía", "Inicio de garantía", lc.warranty_start ? dia(lc.warranty_start) : ""],
      ["Garantía", "Duración (meses)", meses(lc.warranty_months) === SIN ? "" : meses(lc.warranty_months)], ["Garantía", "Fin de garantía", fin === SIN ? "" : fin],
      ["Estado y ubicación", "Estado", ESTADO[lc.status] || lc.status], ["Estado y ubicación", "Ubicación", ubic], ["Estado y ubicación", "Depende de", ci.parent_itil_code],
      ["Estado y ubicación", "Instalado el", lc.installed_at ? dia(lc.installed_at) : ""], ["Estado y ubicación", "Instalado por", lc.installed_by],
      ["Estado y ubicación", "Mantenimiento", lc.maintenance_interval_days ? "cada " + lc.maintenance_interval_days + " días" + (lc.maintenance_due_on ? " · próximo " + dia(lc.maintenance_due_on) : "") : ""],
      ["Estado y ubicación", "Gestionado por", ci.managed_by === "itil" ? "ITIL (Yokup)" : ci.managed_by === "catalogo" ? "Catálogo de Admira (provisional)" : ""]
    ];
    return rows.map(function (r) { return { grupo: r[0], k: r[1], v: txt(r[2]), vacio: vacio(r[2]) }; });
  }

  // Enlaces. La ficha (staff) va por la incidencia o por el código ITIL; el alta y la edición, al Inventario ITIL del portal.
  function fichaUrl(o) { o = o || {}; return "/equipo-inventario?" + (o.ticket ? "ticket=" + encodeURIComponent(o.ticket) : "code=" + encodeURIComponent(o.code || "")); }
  function inventarioUrl(res) {
    var ci = res && res.ci, x = res && res.xpacio, q = [];
    if (x && x.admira_store_id) q.push("xpacio=" + encodeURIComponent(x.admira_store_id));
    else if (x && x.site_id) q.push("site=" + encodeURIComponent(x.site_id));
    if (ci && ci.itil_code) q.push("itil=" + encodeURIComponent(ci.itil_code));
    return "/retailer" + (q.length ? "?" + q.join("&") : "") + "#itil";
  }
  // Alta prefijada: Xpacio, categoría y nombre salen del propio id del equipo (nunca serie ni fechas).
  function altaUrl(res, ticket) {
    var c = (res && res.create) || {}, q = ["itil_alta=1"];
    if (c.admira_store_id) q.push("xpacio=" + encodeURIComponent(c.admira_store_id));
    else if (c.site_id) q.push("site=" + encodeURIComponent(c.site_id));
    if (c.category) q.push("categoria=" + encodeURIComponent(c.category));
    if (c.name) q.push("nombre=" + encodeURIComponent(c.name));
    if (c.adopt_device_id) q.push("adoptar=" + encodeURIComponent(c.adopt_device_id));
    if (res && res.ref) q.push("ref=" + encodeURIComponent(res.ref));
    if (ticket) q.push("incidencia=" + encodeURIComponent(ticket));
    return "/retailer?" + q.join("&") + "#itil";
  }
  function motivo(res) { return MOTIVO[res && res.reason] || MOTIVO.no_inventariado; }
  // Línea corta para el informe y el correo.
  function resumen(res) {
    if (!res || !res.found || !res.ci) return res && res.ok ? motivo(res) : "";
    var ci = res.ci, lc = ci.lifecycle || {}, g = garantia(lc);
    return [ci.name, ci.itil_code, "Nº de serie " + txt(lc.serial), "Garantía: " + g.label + (g.estado === "sin_dato" ? "" : ", " + g.detalle)].filter(Boolean).join(" · ");
  }
  return { SIN: SIN, CATEGORIA: CATEGORIA, ESTADO: ESTADO, MOTIVO: MOTIVO, txt: txt, dia: dia, garantia: garantia, meses: meses, campos: campos,
    fichaUrl: fichaUrl, inventarioUrl: inventarioUrl, altaUrl: altaUrl, motivo: motivo, resumen: resumen };
});
