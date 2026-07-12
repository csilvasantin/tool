/* ============================================================================
 * yk-frame.js — Marco CUADRÁTICO de AdmiraNeXT para el perímetro de Yokup.
 * Script CLÁSICO (sin módulos). Se inicializa tras DOMContentLoaded.
 *
 * CANON refinado (2026-07-12): una UX cuadrática tiene 4 menús (superior,
 * inferior y los dos laterales). NO se explicitan con pestañas en los bordes,
 * sino con ICONOS FIJOS en las esquinas superiores:
 *   · arriba-IZQUIERDA (solo)        → OPCIONES  → panel lateral IZQUIERDO
 *   · arriba-DERECHA, a la izquierda → AVANZADO  → panel lateral DERECHO
 *   · arriba-DERECHA, extremo dcho   → EXPERTO   → panel INFERIOR
 *
 * Los tres paneles son OVERLAY (position:fixed, translateX/Y ±103%), plegados
 * por defecto. NO encogen el contenido: flotan encima. La esquina inferior
 * derecha queda libre para la burbuja del avatar.
 *
 * Los iconos van position:fixed en las esquinas (LECCIÓN vieja: nunca dentro
 * de una topbar que pueda scrollear, o desaparecen).
 *
 * Mecánica de slots: MUEVE (no clona, para preservar los handlers ya
 * enlazados por la página) los nodos [data-yk-slot="left|right|bottom"] al
 * panel correspondiente. Si un slot no tiene nodos, muestra «— sin opciones».
 *
 * Estado abierto/plegado por panel en localStorage. Cierre con el propio icono
 * (toggle) y con Escape. NO toca acceso.js ni avatar-widget.js.
 * ==========================================================================*/
(function () {
  "use strict";

  var WORKER = "https://yokup-rtc.csilvasantin.workers.dev";
  var VERSION = "v.12.07.2026.r3";
  var LS = "yk_frame_open_";  // + panel  -> "1" | "0"

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

  function build() {
    if (document.getElementById("yk-frame")) return;

    var root = el("div", "yk-frame");
    root.id = "yk-frame";

    // --- paneles (raíles OVERLAY) ---
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

    // --- ICONOS FIJOS en las esquinas superiores ---
    // arriba-izquierda (solo): OPCIONES → panel izquierdo
    var icoL = icon("yk-ico yk-ico-left", "left", "▤", "Opciones");
    // arriba-derecha: AVANZADO (a la izquierda) + EXPERTO (extremo derecho)
    var icoR = icon("yk-ico yk-ico-adv", "right", "◨", "Avanzado");
    var icoB = icon("yk-ico yk-ico-exp", "bottom", "▦", "Experto");

    root.appendChild(railL); root.appendChild(railR); root.appendChild(railB);
    root.appendChild(icoL);  root.appendChild(icoR);  root.appendChild(icoB);
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

    // --- botones del EXPERTO (fetch al worker + volcado JSON) ---
    wireExpertFetch(root);
  }

  // botón-icono cuadrático fijo en esquina
  function icon(cls, panel, glyph, label) {
    var b = el("button", cls,
      '<span class="yk-ico-gl" aria-hidden="true">' + glyph + '</span>' +
      '<span class="yk-ico-lbl">' + label + '</span>');
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

  function isOpen(panel) { return localStorage.getItem(LS + panel) === "1"; }
  function setOpen(panel, v) {
    try { localStorage.setItem(LS + panel, v ? "1" : "0"); } catch (e) {}
    document.documentElement.classList.toggle("yk-open-" + panel, !!v);
    // reflejar el estado en el icono
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
