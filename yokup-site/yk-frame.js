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
  var VERSION = "v.19.07.2026.r1";
  var LS = "yk_frame_open_";  // + panel  -> "1" | "0"

  // NAV DE PLATAFORMA — fuente ÚNICA del menú tras la DMZ (zona app). Las
  // páginas de plataforma declaran <body data-yk-zone="app"> y nada más: los
  // items y el activo (deducido del pathname) salen de aquí, idénticos en
  // todas — no pueden divergir. Solo las intros/homes públicas llevan menú
  // propio (data-yk-nav o el NAV global de abajo).
  var APP_NAV = [
    ["DASHBOARD",   "/agentica"],
    ["MISIONES",    "/misiones"],
    ["TAREAS",      "/tareas"],
    ["INCIDENCIAS", "/incidencias"],
    ["INFORMES",    "/informes"],
    ["EQUIPO",      "/equipo"],
    ["STATUS",      "/status"]
  ];

  // Proyectos del MISMO helpdesk. El activo se deduce de la ruta (ver
  // activeProjectKey): /admira-live -> admira.live; el resto -> admira.tv.
  var PROJECTS = {
    "admira.tv":   { icon: "🖥", name: "www.admira.tv",   short: "admira.tv",   sub: "flota DOOH", href: "/incidencias" },
    "admira.live": { icon: "🌐", name: "www.admira.live", short: "admira.live", sub: "encolados",  href: "/admira-live" }
  };
  var PROJECT_ORDER = ["admira.tv", "admira.live"];

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
      incidencias: "INCIDENCIAS", ticket: "TICKET", agentes: "AGENTES",
      "admira-live": "ADMIRA.LIVE", misiones: "MISIONES", tareas: "TAREAS",
      agentica: "DASHBOARD", informes: "INFORMES", status: "STATUS", equipo: "EQUIPO",
      asistencia: "ASISTENCIA", intervencion: "INTERVENCIÓN"
    };
    return map[seg] || "";
  }

  // menú de la barra: zona app (body[data-yk-zone="app"]) → APP_NAV único con
  // activo por pathname; si no, por página (body[data-yk-nav], JSON o lista
  // «Label:href|…»); sin nada, el menú global de la home.
  function pageNav() {
    if (document.body.getAttribute("data-yk-zone") === "app") {
      var path = (location.pathname.replace(/\/+$/, "") || "/").toLowerCase();
      return APP_NAV.map(function (r) {
        return { label: r[0], href: r[1], active: (path === r[1] || path === r[1] + ".html") };
      });
    }
    var raw = document.body.getAttribute("data-yk-nav");
    if (raw) {
      try {
        var j = JSON.parse(raw);
        if (Array.isArray(j) && j.length) {
          return j.map(function (it) {
            return Array.isArray(it) ? { label: it[0], href: it[1] } : it;
          });
        }
      } catch (e) {
        return raw.split("|").map(function (s) {
          var p = s.split(":");
          return { label: (p[0] || "").trim(), href: (p.slice(1).join(":") || "").trim() || null };
        }).filter(function (x) { return x.label; });
      }
    }
    return NAV.map(function (r) { return { label: r[0], href: r[1] }; });
  }

  // proyecto activo según la ruta: cualquier variante con «admira-live» es
  // admira.live; en el resto del perímetro, admira.tv.
  function activeProjectKey() {
    var p = location.pathname.replace(/\/+$/, "").toLowerCase();
    return (p.indexOf("admira-live") >= 0) ? "admira.live" : "admira.tv";
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

    // menú de la barra (se calcula ya para deducir el ítem activo)
    var navItems = pageNav();
    var activeLbl = "";
    for (var _i = 0; _i < navItems.length; _i++) { if (navItems[_i].active) { activeLbl = navItems[_i].label; break; } }

    // rótulo de la página — se OCULTA si coincide con el ítem ACTIVO del menú, para
    // no duplicarlo (p.ej. «DASHBOARD DASHBOARD» en /agentica). En páginas fuera del
    // menú (p.ej. /ticket → «TICKET») el rótulo sigue mostrándose.
    var pt = pageTitle();
    var page = el("span", "yk-page", pt);
    if (!pt || (activeLbl && pt === activeLbl)) page.style.display = "none";

    // menú de la barra: por página (body[data-yk-nav]) o el global por defecto
    var nav = el("nav", "yk-nav");
    nav.setAttribute("aria-label", "Secciones de Yokup");
    navItems.forEach(function (it) {
      var a = el("a", it.active ? "on" : null, it.label);
      a.href = it.href || "#";
      if (it.active) a.setAttribute("aria-current", "page");
      if (it.panel) {
        // MISIONES/TAREAS: abre/enfoca el raíl izquierdo/derecho en vez de navegar
        a.setAttribute("data-yk-open", it.panel);
        a.addEventListener("click", function (e) { e.preventDefault(); setOpen(it.panel, true); });
      }
      nav.appendChild(a);
    });

    // [PROYECTO ACTIVO ▾] — desplegable que absorbe el antiguo rótulo de flota
    var proj = buildProjMenu();

    // (el reloj de la barra se retiró — canon 2026-07-13, Carlos)

    // [icono AVANZADO] [icono EXPERTO] al extremo derecho
    var icoR = icon("yk-ico yk-ico-adv", "right", "◨", "Avanzado");
    var icoB = icon("yk-ico yk-ico-exp", "bottom", "▦", "Experto");

    bar.appendChild(icoL);
    bar.appendChild(logo);
    bar.appendChild(page);
    bar.appendChild(nav);
    bar.appendChild(proj);
    bar.appendChild(icoR);
    bar.appendChild(icoB);

    // ------------------------- PANELES (raíles) ----------------------------
    // Rótulos por página: <body data-yk-rail-left="…" data-yk-rail-right="…">.
    // Sin atributos, se mantiene el canon OPCIONES / AVANZADO (resto de páginas
    // intactas). En incidencias son MISIONES / TAREAS (modelo misiones·tareas).
    var railLeftLabel = document.body.getAttribute("data-yk-rail-left") || "OPCIONES";
    var railRightLabel = document.body.getAttribute("data-yk-rail-right") || "AVANZADO";

    var railL = el("aside", "yk-rail yk-rail-left");
    railL.appendChild(el("div", "yk-hd", railLeftLabel));
    var slotL = el("div", "yk-slot"); railL.appendChild(slotL);
    // pie del raíl OPCIONES: AJUSTES + versión, abajo del todo (Carlos, 2026-07-19).
    // Vive en el marco, no en las páginas → idéntico en toda la zona-app.
    railL.appendChild(buildRailFoot());

    var railR = el("aside", "yk-rail yk-rail-right");
    railR.appendChild(el("div", "yk-hd", railRightLabel));
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

    // --- botones del EXPERTO (fetch al worker + volcado JSON) ---
    wireExpertFetch(root);
  }

  // Pie fijo del raíl OPCIONES: AJUSTES (plegado por defecto, contenido REAL de
  // la sesión de acceso.js) y la versión del perímetro debajo, abajo del todo.
  function buildRailFoot() {
    var foot = el("div", "yk-rail-foot");

    var set = el("div", "yk-set");
    var btn = el("button", "yk-set-btn",
      '<span aria-hidden="true">⚙</span> AJUSTES <span class="yk-set-cx" aria-hidden="true">▾</span>');
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");

    var body = el("div", "yk-set-body");
    var email = "";
    try { email = localStorage.getItem("yk_email") || ""; } catch (e) {}
    body.appendChild(el("div", "yk-set-row",
      '<span class="yk-set-k">Sesión</span><b class="yk-set-v" title="' + (email || "sesión local") + '">' +
      (email || "sesión local") + '</b>'));
    var out = el("button", "yk-set-out", "CERRAR SESIÓN");
    out.type = "button";
    out.addEventListener("click", function () {
      try { localStorage.removeItem("yk_session"); localStorage.removeItem("yk_email"); } catch (e) {}
      location.reload();
    });
    body.appendChild(out);

    btn.addEventListener("click", function () {
      var open = !set.classList.contains("open");
      set.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    set.appendChild(btn);
    set.appendChild(body);

    foot.appendChild(set);
    foot.appendChild(el("div", "yk-ver",
      'yokup · perímetro de seguridad · <b>' + VERSION + '</b>'));
    return foot;
  }

  // desplegable de PROYECTO en la barra: el proyecto activo se lee en el botón,
  // el menú (clic, no hover) ofrece cambiar al otro y navega. Cierre por clic
  // fuera y Escape (Escape cierra ANTES el menú que los paneles: capture phase).
  function buildProjMenu() {
    var active = activeProjectKey();
    var ap = PROJECTS[active];

    var wrap = el("div", "yk-proj");

    var btn = el("button", "yk-proj-btn",
      '<span class="yk-proj-ic" aria-hidden="true">' + ap.icon + '</span>' +
      '<span class="yk-proj-nm">' +
        '<b class="yk-pj-full">' + ap.name + '</b>' +
        '<b class="yk-pj-short">' + ap.short + '</b>' +
      '</span>' +
      '<span class="yk-proj-cx" aria-hidden="true">▾</span>');
    btn.type = "button";
    btn.id = "yk-proj-btn";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Proyecto activo: " + ap.name + ". Cambiar de proyecto");
    btn.title = "Proyecto · " + ap.name;

    var menu = el("div", "yk-proj-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-labelledby", "yk-proj-btn");
    PROJECT_ORDER.forEach(function (k) {
      var p = PROJECTS[k];
      var on = (k === active);
      var a = el("a", "yk-proj-opt" + (on ? " on" : ""),
        '<span class="yk-proj-ic" aria-hidden="true">' + p.icon + '</span>' +
        '<span class="yk-proj-txt"><b>' + p.name + '</b><em>' + p.sub + '</em></span>');
      a.href = p.href;
      a.setAttribute("role", "menuitem");
      if (on) a.setAttribute("aria-current", "true");
      menu.appendChild(a);
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    function isMenuOpen() { return wrap.classList.contains("open"); }
    function setMenu(open) {
      wrap.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !isMenuOpen();
      setMenu(open);
      if (open) { var f = menu.querySelector("a"); if (f) f.focus(); }
    });

    // clic fuera cierra
    document.addEventListener("click", function (e) {
      if (isMenuOpen() && !wrap.contains(e.target)) setMenu(false);
    });

    // Escape en CAPTURA: si el menú está abierto, lo cierra y frena el evento
    // para que el handler de paneles (fase burbuja) no se dispare.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isMenuOpen()) {
        setMenu(false);
        btn.focus();
        e.stopPropagation();
      }
    }, true);

    return wrap;
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
