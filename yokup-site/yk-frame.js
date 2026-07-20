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
  var VERSION = "v.20.07.2026.r1";
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

    // PERSONALIZACIÓN (Carlos, 2026-07-19): preferencias de las columnas del
    // perímetro. yk_pref_avatars → avatares de agente en las listas (def. ON);
    // lo leen yk-misiones.js y quien pinte agentes. Cambiar recarga la vista.
    body.appendChild(el("div", "yk-set-sec", "Personalización"));
    var avLbl = el("label", "yk-set-chk");
    var avChk = document.createElement("input");
    avChk.type = "checkbox";
    try { avChk.checked = localStorage.getItem("yk_pref_avatars") !== "0"; } catch (e) { avChk.checked = true; }
    avLbl.appendChild(avChk);
    avLbl.appendChild(el("span", null, "Avatares de agentes"));
    avChk.addEventListener("change", function () {
      try { localStorage.setItem("yk_pref_avatars", avChk.checked ? "1" : "0"); } catch (e) {}
      location.reload();
    });
    body.appendChild(avLbl);

    // PANEL DE CONTROL (Carlos, 2026-07-19): personalización de ordenadores y
    // agentes — icono o foto por cada uno, compartida en todo el perímetro
    // (prefs 'customize' del worker, escritura con sesión).
    var pcBtn = el("button", "yk-set-btn yk-pc-open",
      '<span aria-hidden="true">▣</span> PANEL DE CONTROL');
    pcBtn.type = "button";
    pcBtn.addEventListener("click", function () { openPanelControl(); });
    body.appendChild(pcBtn);

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

  // ── PANEL DE CONTROL · personalización de ordenadores y agentes ────────────
  // Modal cuadrático: una fila por agente y por ordenador con su visual actual,
  // un emoji (icono) y una FOTO subible (POST /fleet/media → URL en R2). Todo se
  // guarda en UN doc {agents:{slug:{icon,img}}, machines:{slug:{icon,img}}} vía
  // /prefs/customize (GET abierto · POST con sesión del perímetro). Las listas
  // (yk-misiones) lo leen al cargar: la foto pisa al avatar de /avatars, el
  // icono pisa al emoji por defecto (👷 agente · 🖥 máquina).
  var PC_AGENTES = ["Neo", "Morfeo", "Trinity", "Oráculo", "Smith"];
  // espejo del canon MAQ_NOMBRE de yk-misiones.js (nombres de pantalla)
  var PC_MAQUINAS = ["MacBookPro14", "MacBookPro16", "MacBookAir16plata", "MacBookAirPlata",
    "MacBookAirAzul", "MacBookAirCrema", "MacBookAirRosa", "MacMini", "ASUS Zenbook", "DGX Spark", "ThinkStation PGX"];
  function pcSlug(n) {
    return String(n || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function openPanelControl() {
    if (document.getElementById("yk-pc")) return;
    setOpen("left", false);   // el raíl fuera: el panel es un overlay enfocado
    var wrap = el("div", "yk-pc"); wrap.id = "yk-pc";
    var card = el("div", "yk-pc-card");
    card.appendChild(el("div", "yk-hd", "PANEL DE CONTROL · PERSONALIZACIÓN"));
    var bodyEl = el("div", "yk-pc-body", "Cargando personalización…");
    card.appendChild(bodyEl);
    var foot = el("div", "yk-pc-foot");
    var msg = el("span", "yk-pc-msg", "");
    var save = el("button", "yk-pc-save", "GUARDAR"); save.type = "button";
    var close = el("button", "yk-pc-close", "CERRAR"); close.type = "button";
    foot.appendChild(msg); foot.appendChild(save); foot.appendChild(close);
    card.appendChild(foot);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    function cerrar() {
      wrap.remove();
      document.removeEventListener("keydown", onEsc, true);
      document.removeEventListener("paste", onPaste);
    }
    function onEsc(e) { if (e.key === "Escape") { cerrar(); e.stopPropagation(); } }
    close.addEventListener("click", cerrar);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) cerrar(); });
    document.addEventListener("keydown", onEsc, true);

    var DATA = { agents: {}, machines: {} };
    function visual(kind, name) {
      var d = (DATA[kind] || {})[pcSlug(name)] || {};
      // la foto personalizada TAMBIÉN sondea: si su URL está rota (404, caída),
      // wireProbe la degrada al emoji con aviso — nunca el glifo de imagen rota.
      if (d.img) return '<img class="yk-pc-img yk-pc-probe" src="' + d.img + '" alt="">';
      if (d.icon) return '<span class="yk-pc-ico">' + d.icon + "</span>";
      // por defecto, SONDEO del avatar builtin (/avatars/<slug>.jpg): si el
      // fichero existe se ve (Trinity apareció así sin tocar listas); si 404,
      // wireProbe lo degrada al emoji canónico. Nada hardcodeado.
      if (kind === "agents") {
        return '<img class="yk-pc-img yk-pc-probe" src="/avatars/' + pcSlug(name) + '.jpg" alt="">';
      }
      return '<span class="yk-pc-ico dim">' + (kind === "agents" ? "👷" : "🖥") + "</span>";
    }
    function wireProbe(row, kind) {
      var p = row.querySelector(".yk-pc-probe");
      if (p) p.onerror = function () {
        this.outerHTML = '<span class="yk-pc-ico dim" title="foto rota o inaccesible — usa SIN FOTO para limpiarla">' +
          (kind === "agents" ? "👷" : "🖥") + "</span>";
      };
    }
    // Subida COMÚN de foto (selector, arrastre o pegado) → /fleet/media → URL.
    function subeFoto(f, kind, s, row, name) {
      if (!f || !/^image\//.test(f.type || "")) { msg.textContent = "Eso no es una imagen."; return; }
      msg.textContent = "Subiendo foto de " + name + "…";
      f.arrayBuffer().then(function (buf) {
        return window.fetch(WORKER + "/fleet/media", { method: "POST", headers: { "content-type": f.type || "image/jpeg" }, body: buf });
      }).then(function (r) { return r.json(); }).then(function (d2) {
        if (d2 && d2.url) { set(kind, s, "img", d2.url); refresh(row, kind, name); msg.textContent = "Foto de " + name + " lista — GUARDAR para fijarla."; }
        else msg.textContent = "No se pudo subir la foto.";
      }).catch(function () { msg.textContent = "No se pudo subir la foto."; });
    }
    var selRow = null;   // fila activa: destino del PEGADO (clic para elegirla)
    function fila(kind, name) {
      var s = pcSlug(name);
      var d = (DATA[kind] || {})[s] || {};
      var row = el("div", "yk-pc-row");
      row.innerHTML = '<span class="yk-pc-vis">' + visual(kind, name) + "</span>" +
        '<b class="yk-pc-nm">' + name + "</b>";
      wireProbe(row, kind);
      row.title = "clic: elegir fila (pegar con ⌘V) · también puedes ARRASTRAR una imagen aquí";
      var ico = document.createElement("input");
      ico.className = "yk-pc-icoin"; ico.maxLength = 4; ico.placeholder = "emoji";
      ico.value = d.icon || "";
      ico.addEventListener("input", function () { set(kind, s, "icon", ico.value.trim()); });
      var file = document.createElement("input");
      file.type = "file"; file.accept = "image/*"; file.style.display = "none";
      var fbtn = el("button", "yk-pc-foto", "FOTO…"); fbtn.type = "button";
      fbtn.title = "elegir fichero… o arrastra/pega una imagen sobre la fila";
      fbtn.addEventListener("click", function () { file.click(); });
      file.addEventListener("change", function () {
        subeFoto(file.files && file.files[0], kind, s, row, name);
      });
      var quitar = el("button", "yk-pc-quitar", "SIN FOTO"); quitar.type = "button";
      quitar.title = "quitar la foto personalizada";
      quitar.addEventListener("click", function () { set(kind, s, "img", ""); refresh(row, kind, name); });
      row.appendChild(ico); row.appendChild(fbtn); row.appendChild(file); row.appendChild(quitar);
      // FILA ACTIVA (destino del pegado): clic en cualquier hueco de la fila.
      row.addEventListener("click", function (e) {
        if (e.target.closest("button,input")) return;
        if (selRow) selRow.el.classList.remove("sel");
        selRow = { el: row, kind: kind, slug: s, name: name };
        row.classList.add("sel");
        msg.textContent = "Fila activa: " + name + " — pega una imagen (⌘V) o arrástrala encima.";
      });
      // ARRASTRAR Y SOLTAR: ficheros del Finder o imágenes arrastradas de una web.
      row.addEventListener("dragover", function (e) { e.preventDefault(); row.classList.add("drag"); });
      row.addEventListener("dragleave", function () { row.classList.remove("drag"); });
      row.addEventListener("drop", function (e) {
        e.preventDefault(); row.classList.remove("drag");
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) return subeFoto(f, kind, s, row, name);
        // imagen arrastrada desde otra web → llega como URL: se guarda directa
        var uri = e.dataTransfer && (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"));
        if (uri && /^https?:\/\//.test(uri.trim())) {
          set(kind, s, "img", uri.trim().split("\n")[0]);
          refresh(row, kind, name);
          msg.textContent = "Imagen de " + name + " enlazada — GUARDAR para fijarla.";
        }
      });
      return row;
    }
    function set(kind, slug, campo, valor) {
      DATA[kind] = DATA[kind] || {};
      DATA[kind][slug] = DATA[kind][slug] || {};
      if (valor) DATA[kind][slug][campo] = valor; else delete DATA[kind][slug][campo];
      if (!Object.keys(DATA[kind][slug]).length) delete DATA[kind][slug];
    }
    function refresh(row, kind, name) {
      var v = row.querySelector(".yk-pc-vis"); if (v) { v.innerHTML = visual(kind, name); wireProbe(row, kind); }
    }
    // PEGAR (⌘V) una imagen del portapapeles sobre la FILA ACTIVA (clic previo).
    function onPaste(e) {
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (!items.length) return;
      if (!selRow) { msg.textContent = "Haz clic en una fila primero y vuelve a pegar."; return; }
      e.preventDefault();
      subeFoto(items[0], selRow.kind, selRow.slug, selRow.el, selRow.name);
    }
    document.addEventListener("paste", onPaste);
    // TABLERO DE MISIONES (Carlos, 2026-07-20): columnas visibles + densidad,
    // guardado en el mismo doc compartido (DATA.board) — se aplica en /misiones.
    var PC_COLS = [["proyecto", "Proyecto (miniatura)"], ["fecha", "Fecha y duración"],
      ["ordenador", "Ordenador"], ["agente", "Agente / plataforma"], ["estado", "Estado + abrir"]];
    function seccionTablero() {
      var frag = document.createDocumentFragment();
      frag.appendChild(el("div", "yk-set-sec", "Tablero de misiones"));
      DATA.board = DATA.board || {};
      DATA.board.cols = DATA.board.cols || {};
      PC_COLS.forEach(function (c) {
        var lbl = el("label", "yk-set-chk");
        var chk = document.createElement("input"); chk.type = "checkbox";
        chk.checked = DATA.board.cols[c[0]] !== 0;   // por defecto, visible
        chk.addEventListener("change", function () {
          if (chk.checked) delete DATA.board.cols[c[0]]; else DATA.board.cols[c[0]] = 0;
        });
        lbl.appendChild(chk);
        lbl.appendChild(el("span", null, "Columna " + c[1]));
        frag.appendChild(lbl);
      });
      var dens = el("div", "yk-pc-dens");
      dens.appendChild(el("span", "yk-set-k", "Densidad"));
      [["comoda", "CÓMODA"], ["compacta", "COMPACTA"]].forEach(function (d) {
        var b = el("button", "yk-pc-densb" + ((DATA.board.density || "comoda") === d[0] ? " on" : ""), d[1]);
        b.type = "button";
        b.addEventListener("click", function () {
          DATA.board.density = d[0];
          dens.querySelectorAll(".yk-pc-densb").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
        });
        dens.appendChild(b);
      });
      frag.appendChild(dens);
      return frag;
    }
    function pintar() {
      bodyEl.innerHTML = "";
      bodyEl.appendChild(el("div", "yk-set-sec", "Agentes"));
      PC_AGENTES.forEach(function (n) { bodyEl.appendChild(fila("agents", n)); });
      bodyEl.appendChild(el("div", "yk-set-sec", "Ordenadores"));
      PC_MAQUINAS.forEach(function (n) { bodyEl.appendChild(fila("machines", n)); });
      bodyEl.appendChild(seccionTablero());
      // refleja el emoji tecleado en el visual al vuelo
      bodyEl.addEventListener("input", function (e) {
        if (!e.target.classList.contains("yk-pc-icoin")) return;
        var r = e.target.closest(".yk-pc-row"); if (!r) return;
        var nm = r.querySelector(".yk-pc-nm").textContent;
        var kind = PC_AGENTES.indexOf(nm) >= 0 ? "agents" : "machines";
        refresh(r, kind, nm);
      });
    }
    window.fetch(WORKER + "/prefs/customize", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { DATA = (d && d.customize) || {}; DATA.agents = DATA.agents || {}; DATA.machines = DATA.machines || {}; pintar(); })
      .catch(function () { pintar(); });
    save.addEventListener("click", function () {
      save.disabled = true; msg.textContent = "Guardando…";
      window.fetch(WORKER + "/prefs/customize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customize: DATA }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) { msg.textContent = "Guardado — recargando…"; setTimeout(function () { location.reload(); }, 600); }
          else { msg.textContent = (d && d.error) || "No se pudo guardar."; save.disabled = false; }
        })
        .catch(function () { msg.textContent = "No se pudo guardar."; save.disabled = false; });
    });
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
