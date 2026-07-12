/* ============================================================================
 * yk-frame.js — Marco CUADRÁTICO de AdmiraNeXT para el perímetro de Yokup.
 * Script CLÁSICO (sin módulos). Se inicializa tras DOMContentLoaded.
 *
 * yk-frame v3 (2026-07-12, canon precisado por Carlos):
 *   · Construye la BARRA SUPERIOR REAL (.yk-bar) como entidad propia del sitio,
 *     fixed y de ancho completo:
 *       [icono OPCIONES] · logotipo YO KUP (→ /) · rótulo de la página ·
 *       referencias de la home · FLOTA admira.tv + reloj ·
 *       [icono AVANZADO] [icono EXPERTO]
 *   · Los tres paneles OVERLAY nacen bajo la barra (top: alto de la barra) y NO
 *     encogen el contenido: flotan encima. La esquina inf-dcha queda para el avatar.
 *   · Los ICONOS viven DENTRO de la barra y NO se mueven: toggle + Escape, con
 *     estado encendido (aria-pressed) cuando su panel está abierto.
 *   · El reloj lo pinta la barra (intervalo propio); las páginas ya no lo llevan.
 *
 * Mecánica de slots: MUEVE (no clona, para preservar los handlers ya enlazados
 * por la página) los nodos [data-yk-slot="left|right|bottom"] al panel
 * correspondiente. Si un slot no tiene nodos, muestra «— sin opciones».
 *
 * Estado abierto/plegado por panel en localStorage. NO toca acceso.js ni
 * avatar-widget.js.
 * ==========================================================================*/
(function () {
  "use strict";

  var WORKER = "https://yokup-rtc.csilvasantin.workers.dev";
  var VERSION = "v.12.07.2026.r4";
  var LS = "yk_frame_open_";  // + panel  -> "1" | "0"

  // Referencias de la home (los 4 primeros son anclas de la landing)
  var NAV = [
    ["Plataforma",   "/#plataforma"],
    ["Agentes IoT",  "/#como"],
    ["as a Service", "/#xaas"],
    ["Equipo",       "/#equipo"],
    ["Incidencias",  "/incidencias"],
    ["admira.live",  "/admira-live"],
    ["Asistencia",   "/asistencia"],
    ["App",          "/app"]
  ];

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // id del recurso en la URL (?id=…) para el EXPERTO de ficha
  function urlId() {
    try { return new URLSearchParams(location.search).get("id") || ""; } catch (e) { return ""; }
  }

  // rótulo de la página actual: data-yk-title del <body>, o derivado de la ruta
  function pageTitle() {
    var t = document.body.getAttribute("data-yk-title");
    if (t) return t;
    var seg = location.pathname.replace(/\/+$/, "").split("/").pop() || "";
    seg = seg.replace(/\.html$/, "").toLowerCase();
    var map = {
      incidencias: "SOPORTE", ticket: "TICKET", agentes: "AGENTES",
      "admira-live": "ADMIRA.LIVE",
      asistencia: "ASISTENCIA", intervencion: "INTERVENCIÓN"
    };
    return map[seg] || "";
  }

  function build() {
    if (document.getElementById("yk-frame")) return;
    document.documentElement.classList.add("yk-framed"); // aplica padding-top al body

    var root = el("div", "yk-frame");
    root.id = "yk-frame";

    // ------------------------- BARRA SUPERIOR ------------------------------
    var bar = el("header", "yk-bar");
    bar.setAttribute("role", "banner");

    // [icono OPCIONES] al extremo izquierdo
    var icoL = icon("yk-ico yk-ico-left", "left", "▤", "Opciones");

    // logotipo YO KUP (→ /)
    var logo = el("a", "yk-logo",
      '<span class="yk-dot" aria-hidden="true"></span>Yo<b>kup</b>');
    logo.href = "/";
    logo.setAttribute("aria-label", "Yokup · inicio");

    // rótulo de la página
    var pt = pageTitle();
    var page = el("span", "yk-page", pt);
    if (!pt) page.style.display = "none";

    // referencias de la home
    var nav = el("nav", "yk-nav");
    nav.setAttribute("aria-label", "Secciones de Yokup");
    NAV.forEach(function (r) {
      var a = el("a", null, r[0]);
      a.href = r[1];
      nav.appendChild(a);
    });

    // FLOTA admira.tv · reloj
    var meta = el("div", "yk-meta",
      '<span class="yk-meta-lbl">Flota <b>admira.tv</b> · </span><span class="yk-clock">—</span>');

    // [icono AVANZADO] [icono EXPERTO] al extremo derecho
    var icoR = icon("yk-ico yk-ico-adv", "right", "◨", "Avanzado");
    var icoB = icon("yk-ico yk-ico-exp", "bottom", "▦", "Experto");

    bar.appendChild(icoL);
    bar.appendChild(logo);
    bar.appendChild(page);
    bar.appendChild(nav);
    bar.appendChild(meta);
    bar.appendChild(icoR);
    bar.appendChild(icoB);

    // ------------------------- PANELES (raíles) ----------------------------
    var railL = el("aside", "yk-rail yk-rail-left");
    railL.appendChild(el("div", "yk-hd", "OPCIONES"));
    var slotL = el("div", "yk-slot"); railL.appendChild(slotL);

    var railR = el("aside", "yk-rail yk-rail-right");
    railR.appendChild(el("div", "yk-hd", "AVANZADO"));
    var slotR = el("div", "yk-slot"); railR.appendChild(slotR);

    var railB = el("aside", "yk-rail yk-rail-bottom");
    var expert = el("div", "yk-expert");
    expert.appendChild(el("div", "yk-hd", "EXPERTO"));
    var slotB = el("div", "yk-slot"); expert.appendChild(slotB);
    railB.appendChild(expert);

    root.appendChild(bar);
    root.appendChild(railL); root.appendChild(railR); root.appendChild(railB);
    document.body.appendChild(root);

    // --- MOVER los nodos marcados a su slot ---
    fillSlot(slotL, "left");
    fillSlot(slotR, "right");
    fillSlot(slotB, "bottom", expert);

    // --- estado abierto/plegado por panel ---
    wire(icoL, "left");
    wire(icoR, "right");
    wire(icoB, "bottom");

    // --- cerrar cualquier panel abierto con Escape ---
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        ["left", "right", "bottom"].forEach(function (p) { if (isOpen(p)) setOpen(p, false); });
      }
    });

    // --- reloj de la barra (intervalo propio) ---
    startClock();

    // --- botones del EXPERTO (fetch al worker + volcado JSON) ---
    wireExpertFetch(root);
  }

  // botón-icono cuadrático de la barra
  function icon(cls, panel, glyph, label) {
    // canon 2026-07-12: el botón es SOLO el glifo; el rótulo vive en el tooltip
    var b = el("button", cls,
      '<span class="yk-ico-gl" aria-hidden="true">' + glyph + '</span>');
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.setAttribute("data-yk-panel", panel);
    return b;
  }

  function fillSlot(slot, name, expertHost) {
    var nodes = document.querySelectorAll('[data-yk-slot="' + name + '"]');
    if (!nodes.length) {
      slot.appendChild(el("div", "yk-empty", "— sin opciones en esta vista"));
    } else {
      // mover (no clonar): preserva los event listeners ya enlazados
      Array.prototype.forEach.call(nodes, function (n) {
        n.removeAttribute("data-yk-slot");
        slot.appendChild(n);
      });
    }
    // el panel inferior SIEMPRE lleva pie de versión
    if (name === "bottom" && expertHost) {
      expertHost.appendChild(el("div", "yk-ver",
        'yokup · perímetro de seguridad · <b>' + VERSION + '</b>'));
    }
  }

  function startClock() {
    var paint = function () {
      var c = document.querySelector(".yk-clock");
      if (c) c.textContent = new Date().toTimeString().slice(0, 8);
    };
    paint();
    setInterval(paint, 1000);
  }

  function isOpen(panel) { return localStorage.getItem(LS + panel) === "1"; }
  function setOpen(panel, v) {
    try { localStorage.setItem(LS + panel, v ? "1" : "0"); } catch (e) {}
    document.documentElement.classList.toggle("yk-open-" + panel, !!v);
    // reflejar el estado en el icono (encendido/apagado)
    var ico = document.querySelector('.yk-ico[data-yk-panel="' + panel + '"]');
    if (ico) ico.setAttribute("aria-pressed", v ? "true" : "false");
  }

  function wire(ico, panel) {
    // restaurar estado guardado
    setOpen(panel, isOpen(panel));
    ico.addEventListener("click", function () {
      setOpen(panel, !isOpen(panel));
    });
  }

  function wireExpertFetch(root) {
    var out = root.querySelector(".yk-expert-out");
    var btns = root.querySelectorAll("[data-yk-fetch]");
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener("click", function () {
        var path = b.getAttribute("data-yk-fetch").replace("{id}", encodeURIComponent(urlId()));
        var pick = b.getAttribute("data-yk-pick"); // subcampo opcional
        if (out) out.textContent = "… solicitando " + path;
        // fetch normal de window: acceso.js ya inyecta el Bearer al llamar al worker
        window.fetch(WORKER + path, { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var data = (pick && d && d[pick] != null) ? d[pick] : d;
            if (out) out.textContent = JSON.stringify(data, null, 2);
          })
          .catch(function () {
            if (out) out.textContent = "El worker no responde ahora (o la sesión ha caducado).";
          });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
