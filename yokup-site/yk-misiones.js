/* ============================================================================
 * yk-misiones.js — Lógica compartida del modelo MISIONES · TAREAS.
 *
 * Doctrina: una MISIÓN (ticket) se descompone en 3 pasos a/b/c con hasta 3
 * subtareas cada uno (a1..c3, máx 9). Subagentes ejecutan, infraagentes
 * reportan. Este módulo es la fuente ÚNICA de la fila de misión, la selección
 * con glow y el árbol de tareas — lo usan /incidencias, /misiones y /tareas
 * para no divergir. Script clásico (sin módulos): expone window.YkMisiones.
 *
 * Uso:
 *   YkMisiones.init({ worker, treeId })   // una vez, antes de pintar
 *   YkMisiones.rowHtml(t)                 // fila .tk de una misión (ticket)
 *   YkMisiones.bindRows(container)        // click=seleccionar (salvo «abrir →»)
 *   YkMisiones.refreshTree()              // repinta el árbol de la selección
 *   YkMisiones.selected()                 // id de la misión activa
 *   YkMisiones.stepsHtml(tasks)           // árbol abc/123 (para vistas globales)
 *   YkMisiones.subCount(tasks)            // subtareas definidas (contador n/9)
 *   YkMisiones.nextStatus(cur) / postStatus(id, code, status)
 * ==========================================================================*/
(function () {
  "use strict";

  var CFG = { worker: "", treeId: "taskTree", lsKey: "yk_mission" };
  var SELECTED = "";

  var OWN_ICON = { principal: "🧠", subagente: "⚙️", infraagente: "📝" };

  // AVATARES de agente (Ajustes → PERSONALIZACIÓN, Carlos 2026-07-19): si la
  // persona tiene imagen en /avatars/<slug>.jpg se pinta el retrato con el
  // nombre DEBAJO; sin imagen (o con el ajuste apagado) degrada al 👷 clásico.
  // Pref. en localStorage yk_pref_avatars (la escribe yk-frame · AJUSTES; def. ON).
  var AVATARES = { neo: 1, morfeo: 1, smith: 1, trinity: 1 };
  function avatarOn() { try { return localStorage.getItem("yk_pref_avatars") !== "0"; } catch (e) { return true; } }
  function avSlug(n) {
    return String(n || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  // PERSONALIZACIÓN compartida (AJUSTES → Panel de control): {agents:{slug:
  // {icon,img}}, machines:{…}} desde /prefs/customize. La FOTO personalizada
  // pisa al avatar builtin; el ICONO pisa al emoji por defecto (👷 / 🖥).
  // customizeReady: las páginas pueden esperar antes del primer pintado.
  var CUSTOM = { agents: {}, machines: {} };
  var customizeReady = (function () {
    try {
      return window.fetch("https://yokup-rtc.csilvasantin.workers.dev/prefs/customize", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var c = (d && d.customize) || {};
          CUSTOM.agents = c.agents || {};
          CUSTOM.machines = c.machines || {};
        }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  })();

  function whoHtml(name, surface) {
    var s = avSlug(name);
    var cu = CUSTOM.agents[s] || {};
    // Sin plataforma (agente sin runtime·host ahora mismo) → "Pendiente".
    var plat = surface ? esc(surface) : "Pendiente";
    var platCls = surface ? "agent-surface" : "agent-surface pend";
    // FOTO del Panel de control > avatar builtin; ICONO personalizado > 👷.
    var img = cu.img || (AVATARES[s] ? "/avatars/" + s + ".jpg" : "");
    if (avatarOn() && img) {
      return '<span class="who who-av"><img class="agava" loading="lazy" src="' + esc(img) + '" alt="">' +
        "<span>" + esc(name) + '</span><small class="' + platCls + '">' + plat + "</small></span>";
    }
    return '<span class="who"><span>' + (cu.icon ? esc(cu.icon) : "👷") + " " + esc(name) +
      '</span><small class="' + platCls + '">' + plat + "</small></span>";
  }
  // Visual de la columna ORDENADOR: foto pequeña > icono personalizado > 🖥.
  function machVisual(maq) {
    var cu = CUSTOM.machines[avSlug(maq)] || {};
    if (cu.img) return '<img class="machava" loading="lazy" src="' + esc(cu.img) + '" alt="">';
    return esc(cu.icon || "🖥");
  }
  var CHIP = { pending: "○", in_progress: "◐", done: "●" };
  var NEXT_ST = { pending: "in_progress", in_progress: "done", done: "pending" };
  var STS = ["pending", "in_progress", "done"];

  function esc(x) {
    return String(x == null ? "" : x).replace(/[<>&"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    });
  }
  function cssq(s) { return String(s).replace(/["\\]/g, "\\$&"); }
  function ago(ms) {
    if (!ms) return "—";
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return "hace " + s + "s";
    if (s < 3600) return "hace " + Math.round(s / 60) + "m";
    if (s < 86400) return "hace " + Math.round(s / 3600) + "h";
    return "hace " + Math.round(s / 86400) + "d";
  }
  function slaLeft(created) {
    var left = created + 7200000 - Date.now();
    if (left <= 0) return "SLA vencido";
    var m = Math.round(left / 60000);
    return "SLA " + (m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m");
  }
  // Fecha ABSOLUTA de la misión (dd/mm hh:mm) — el «hace X» relativo se queda,
  // pero la tarjeta pinta también la fecha real (pedido Carlos, 2026-07-15).
  function fechaCorta(ms) {
    if (!ms) return "";
    var d = new Date(ms > 4102444800 ? ms : ms * 1000);
    if (isNaN(d)) return "";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function init(opts) {
    opts = opts || {};
    if (opts.worker) CFG.worker = opts.worker;
    if (opts.treeId) CFG.treeId = opts.treeId;
    try { SELECTED = localStorage.getItem(CFG.lsKey) || ""; } catch (e) {}
  }
  function selected() { return SELECTED; }

  // ---- Nombre CANÓNICO de máquina -------------------------------------------
  // Los encargos llegan con el nombre en formatos dispares (minúsculas, con
  // espacios, alias) y el selector sacaba duplicados del mismo equipo.
  // Canónico = el ComputerName real de cada Mac. DECISIÓN Carlos (2026-07-15):
  // «MacBookAirPlata» es el Air de 14; el de 16 es «MacBookAir16plata»
  // (y «macbookair16» es un alias suyo, NO otra máquina).
  // SIMPLIFICACIÓN (Carlos, 2026-07-15): los MacBookPro sin color, por tamaño —
  // solo hay dos: MacBookPro14 (antes «MacBookProNegro14») y MacBookPro16.
  // OJO: es nombre de PANTALLA; el target_machine de los encargos viaja con el
  // ComputerName real de cada Mac (si no, el claim daría wrong-machine).
  var MAQ_ALIAS = { macbookair16: "macbookair16plata", macbookpronegro14: "macbookpro14" };
  var MAQ_NOMBRE = {
    macbookpro14: "MacBookPro14",
    macbookpro16: "MacBookPro16",
    macbookair16plata: "MacBookAir16plata",
    macbookairplata: "MacBookAirPlata",
    macbookairazul: "MacBookAirAzul",
    macbookaircrema: "MacBookAirCrema",
    macbookairrosa: "MacBookAirRosa",
    // OJO: MacBookAirLuna/Luna1 NO existen (Carlos, 2026-07-15) — eran máquinas
    // fantasma de unos encargos mal dirigidos; no las legitimes aquí.
    macmini: "MacMini",
    asuszenbook: "ASUS Zenbook",
    dgxspark: "DGX Spark",
    thinkstationpgx: "ThinkStation PGX"
  };
  function canonMachine(raw) {
    var n = String(raw || "").toLowerCase().replace(/[\s·._-]+/g, "");
    n = MAQ_ALIAS[n] || n;
    return MAQ_NOMBRE[n] || raw;
  }

  // Máquina donde corre/se solventa la misión: loc (target_machine del encargo)
  // o, en tickets de flota antiguos, incrustada en screen «Persona·Máquina #id».
  // Exportada: la usan los selectores de /misiones para filtrar por equipo.
  // Devuelve SIEMPRE el nombre canónico (dedupe de formatos y alias).
  function machineOf(t) {
    var maq = t.machine || t.loc || "";
    if (!maq) { var mm = /^[^·]+·(.+?)\s+#\d+$/.exec(t.screen || ""); if (mm) maq = mm[1]; }
    return maq === "?" ? "" : canonMachine(maq);
  }

  // Proyecto PRINCIPAL de una misión, deducido de su texto → web para la miniatura.
  // (Carlos, 2026-07-16: referencia visual de en qué está el agente/máquina.)
  var PROY = [
    ["pixeria", "https://www.pixeria.com"], ["xpaceos", "https://www.xpaceos.com"], ["xpace os", "https://www.xpaceos.com"],
    ["yokup", "https://www.yokup.com"], ["clearchannel", "https://www.clearchannel.tv"],
    ["admira.live", "https://www.admira.live"], ["admira.tv", "https://www.admira.tv"],
    ["admiranext", "https://admiranext.com"], ["ainimation", "https://ainimation.studio"], ["digitalavatar", "https://digitalavatar.ai"]
  ];
  function proyectoDe(t) {
    var s = ((t && (t.subject || "")) + " " + (t && (t.screen || "")) + " " + (t && (t.loc || ""))).toLowerCase();
    for (var i = 0; i < PROY.length; i++) if (s.indexOf(PROY[i][0]) >= 0) return PROY[i][1];
    return "";
  }
  // miniatura de una web (thum.io; cargada directa desde el navegador — las IPs de
  // datacenter la bloquean, pero el navegador del usuario es residencial).
  // Miniatura de la web del proyecto vía el endpoint PROPIO /shot de yokup-rtc
  // (captura cacheada en R2, servida desde el propio dominio; antes se pegaba a
  // image.thum.io directo desde cada navegador). w se ignora: /shot da 480×300.
  function shotUrl(web, w) { return CFG.worker + "/shot?url=" + encodeURIComponent(web); }
  // LIGHTBOX: clic en la miniatura → captura EN GRANDE (no navega a la web).
  function openLightbox(web, direct) {
    var ov = document.getElementById("yk-lightbox");
    if (!ov) {
      ov = document.createElement("div"); ov.id = "yk-lightbox";
      ov.innerHTML = '<div class="ykl-box"><img class="ykl-img" alt=""><a class="ykl-open" target="_blank" rel="noopener"></a></div>';
      document.body.appendChild(ov);
      ov.addEventListener("click", function (e) { if (e.target === ov || e.target.classList.contains("ykl-img")) ov.classList.remove("show"); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") ov.classList.remove("show"); });
    }
    ov.querySelector(".ykl-img").src = direct ? web : "https://image.thum.io/get/width/1100/" + web;
    var op = ov.querySelector(".ykl-open"); op.href = web; op.textContent = direct ? "abrir pantallazo ↗" : "abrir " + web.replace(/^https?:\/\/(www\.)?/, "") + " ↗";
    ov.classList.add("show");
  }
  document.addEventListener("click", function (e) {
    var img = e.target.closest && e.target.closest(".shot-img");
    if (img && (img.dataset.proof || img.dataset.shot)) {
      e.preventDefault(); openLightbox(img.dataset.proof || img.dataset.shot, !!img.dataset.proof);
    }
  });

  // ------- fila de MISIÓN (idéntica en /incidencias y /misiones) -------
  // ESTADOS canónicos (Carlos, 2026-07-19): Sin asignar · Pendiente · En curso ·
  // Finalizada. PENDIENTE = tiene AGENTE/EQUIPO pero aún NO reclamada (registrada,
  // sin arrancar). Al reclamarla (bot-inbox-claim) pasa a in_progress = En curso.
  // Antes esto se llamaba «Asignada», lo que confundía backlog con trabajo en marcha.
  function estadoDe(t) {
    if (t.status === "resolved") return { c: "b-res", l: "Finalizada" };
    if (t.status === "in_progress") return { c: "b-prog", l: "En curso" };
    return (t.assignee || t.loc || t.machine) ? { c: "b-pend", l: "Pendiente" } : { c: "b-sina", l: "Sin asignar" };
  }

  // El marcador «[PRIORIDAD ABSOLUTA]» (o [PRIORIDAD …], [TEST …]) viajaba en el
  // TEXTO del encargo y ensuciaba el título. Se separa: el título queda limpio y
  // el marcador se pinta como ETIQUETA bajo el id (Carlos, 2026-07-18).
  function prioMarca(subject) {
    var m = /^\s*\[([^\]]+)\]\s*/.exec(String(subject || ""));
    if (!m) return { flag: "", limpio: String(subject || "") };
    return { flag: m[1].trim(), limpio: String(subject).slice(m[0].length) };
  }
  function rowHtml(t) {
    var est = estadoDe(t);
    var sb = est.c, stt = est.l;
    var maq = machineOf(t);
    var pm = prioMarca(t.subject);
    var esPrio = /prioridad/i.test(pm.flag);
    // COLUMNAS con separador vertical sutil y REDIMENSIONABLES (Carlos, 2026-07-15):
    // cada .rz es la línea divisoria — se arrastra y ajusta la variable CSS de SU
    // columna (--c-*) para TODAS las tarjetas a la vez; se persiste en localStorage.
    var rz = function (col, side) { return '<span class="rz" data-col="' + col + '"' + (side ? ' data-side="' + side + '"' : "") + ' title="⇔ arrastra para redimensionar"></span>'; };
    var dv = durVal(t);
    var proof = String(t.proof_image || "");
    // CAPTURA EN VIVO del CLI: si la misión está EN CURSO y hay una captura
    // reciente del terminal (<3 min), se enseña ESA con halo pulsante — el
    // feedback de «está trabajando, no parado» (Carlos, 2026-07-18). Manda sobre
    // el previo de la web, pero no sobre el proof final de una misión cerrada.
    var live = String(t.live_shot || "");
    var liveFresca = live && t.live_at && (Date.now() - (t.live_at > 4102444800000 ? t.live_at : t.live_at) < 180000);
    var rt = String(t.agent_runtime || "");
    var host = t.agent_host === "cli" ? "CLI" : t.agent_host === "app" ? "Desktop" : "";
    var surface = [rt, host].filter(Boolean).join(" · ");
    return '<div class="tk ' + (t.status === "open" ? "open" : "") + " " + (t.id === SELECTED ? "sel" : "") + '" data-id="' + esc(t.id) + '">' +
      '<div class="hd">' +
        '<div class="pri ' + esc(t.priority) + '"></div>' +
        '<div class="tkid">' + esc(t.id) + '<span class="st">' + ({ "agent-iot": "🖥 Pantalla DOOH", monitor: "🌐 Servicio", service: "🌐 Servicio", agent: "🤖 Agente", agente: "🤖 Agente", presence: "🖥 Máquina", machine: "🖥 Máquina", fleet: "🎯 Misión" }[t.source] || "👤 Manual") + "</span>" +
          (pm.flag ? '<span class="prioflag' + (esPrio ? " abs" : "") + '">' + (esPrio ? "⚡ " : "") + esc(pm.flag) + "</span>" : "") + "</div>" +
        '<div class="cel shot">' + (function () { var p = proyectoDe(t);
          if (proof) return '<img class="shot-img proof" loading="lazy" src="' + esc(proof) + '" data-proof="' + esc(proof) + '" alt="Pantallazo final" title="pantallazo del trabajo realizado">';
          if (liveFresca) return '<img class="shot-img working" loading="lazy" src="' + esc(live) + '" data-proof="' + esc(live) + '" alt="En curso" title="🔴 en vivo · el CLI está trabajando ahora">';
          return p ? '<img class="shot-img" loading="lazy" src="' + esc(shotUrl(p, 240)) + '" data-shot="' + esc(p) + '" alt="" title="ampliar · ' + esc(p) + '">' : '<img class="shot-img shot-logo" loading="lazy" src="/img/admiranext-logo.svg" alt="AdmiraNeXT" title="AdmiraNeXT · sin proyecto asignado">'; })() + "</div>" +
        '<div class="subj">' + rz("id", "r") + '<div class="t">' + esc(pm.limpio) + '</div><div class="m"><span class="scr">' + esc(String(t.screen || "").replace(/^(svc|maq|agt|service|machine|agent):/, "").replace(/^https?:\/\/(www\.)?/, "")) + "</span>" +
          (t.loc ? "<span>" + esc(t.loc) + "</span>" : "") + "<span>" + ago(t.created_at) + "</span>" +
          // 📎 la misión lleva fotos adjuntas (viven en el texto de sus eventos;
          // el worker las cuenta en img_count). Avisa sin tener que abrir el ticket.
          (+t.img_count > 0 ? '<span class="adjn" title="' + (+t.img_count) + ' imagen(es) adjunta(s) — ábrela para verlas">📎 ' + (+t.img_count) + "</span>" : "") +
          "</div></div>" +
        // Fecha + DURACIÓN: de asignada a finalizada (o transcurrido si sigue viva).
        '<div class="cel rtiempo">' + rz("fch") + '<span class="fch2" title="fecha de creación de la misión">📅 ' + fechaCorta(t.created_at) + "</span>" +
          (dv ? '<span class="dur' + (dv.run ? " run" : "") + '" title="' + esc(dv.tip) + '">⏱ ' + esc(dv.txt) + "</span>" : "") + "</div>" +
        // ORDENADOR (entre Fecha y Agente).
        '<div class="cel ord">' + rz("ord") + (maq ? '<span class="mach2">' + machVisual(maq) + " " + esc(maq) + "</span>" : '<span class="mach2 dim">🖥 sin máquina</span>') + "</div>" +
        // Celda de AGENTE con clase `agc` (target del picker de reasignación en
        // /misiones; inocua en /incidencias, que no la cablea). Carlos, 2026-07-15.
        '<div class="cel agc">' + rz("who") + whoHtml(t.assignee, surface) + "</div>" +
        // Estado + ABRIR apilado (abrir debajo de la insignia).
        '<div class="cel est">' + rz("est") + '<span class="badge ' + sb + '"><i></i>' + stt + "</span>" +
          '<a class="tkopen" href="/ticket?id=' + encodeURIComponent(t.id) + '">abrir →</a></div>' +
      "</div></div>";
  }
  // Duración de la misión: de ASIGNADA (created_at, el encargo nace ya asignado) a
  // FINALIZADA (resolved_at). Si sigue viva, el tiempo TRANSCURRIDO hasta ahora (run).
  // Epoch tolerante a s/ms (fleet guarda ms; el guardia normaliza por si acaso).
  function _ms(v) { v = +v || 0; return v > 4102444800 ? v : v * 1000; }
  function durFmt(ms) {
    if (ms == null || ms < 0) return "";
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return d + "d " + (h % 24) + "h";
    if (h > 0) return h + "h " + (m % 60) + "m";
    if (m > 0) return m + "m";
    return s + "s";
  }
  function durVal(t) {
    var start = _ms(t.created_at);
    if (!start) return null;
    if (t.status === "resolved") {
      var end = _ms(t.resolved_at || t.updated_at);
      if (!end || end < start) return null;
      return { txt: durFmt(end - start), run: false, tip: "de asignada a finalizada" };
    }
    return { txt: durFmt(Date.now() - start), run: true, tip: "transcurrido desde que se asignó" };
  }

  // ---- Redimensionado de columnas de la lista -------------------------------
  var COLVARS = { id: "--c-id", fch: "--c-fch", ord: "--c-ord", who: "--c-who", est: "--c-est" };
  function initColResize() {
    if (initColResize._done) return; initColResize._done = true;
    // Tope RELATIVO al ancho de la lista: ninguna columna puede pasar del 35%
    // (dejaría a la misión sin carril y el contenido invadía la columna vecina).
    function tope() {
      var l = document.querySelector(".list");
      return l ? Math.max(160, Math.round(l.getBoundingClientRect().width * 0.35)) : 420;
    }
    var saved = {}; try { saved = JSON.parse(localStorage.getItem("yk_cols") || "{}"); } catch (e) {}
    for (var k in saved) if (COLVARS[k] && saved[k] > 0) {
      document.documentElement.style.setProperty(COLVARS[k], Math.max(56, Math.min(tope(), saved[k])) + "px");
    }
    var drag = null;
    document.addEventListener("mousedown", function (e) {
      var h = e.target && e.target.closest && e.target.closest(".rz"); if (!h) return;
      e.preventDefault(); e.stopPropagation();
      var col = h.dataset.col;
      var cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(COLVARS[col]));
      if (!cur) { var cell = h.parentElement; cur = cell ? cell.getBoundingClientRect().width : 120; }
      drag = { col: col, side: h.dataset.side || "l", x: e.clientX, w: cur };
      document.body.style.cursor = "col-resize";
    }, true);
    document.addEventListener("mousemove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      var w = Math.round(drag.side === "r" ? drag.w + dx : drag.w - dx);
      document.documentElement.style.setProperty(COLVARS[drag.col], Math.max(56, Math.min(tope(), w)) + "px");
    });
    document.addEventListener("mouseup", function () {
      if (!drag) return;
      var out = {};
      for (var k in COLVARS) { var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(COLVARS[k])); if (v) out[k] = v; }
      try { localStorage.setItem("yk_cols", JSON.stringify(out)); } catch (e) {}
      drag = null; document.body.style.cursor = "";
    });
  }

  // click en la fila = seleccionar misión (el enlace «abrir →» sigue navegando)
  function bindRows(container) {
    initColResize();
    (container || document).querySelectorAll(".tk").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest(".tkopen") || e.target.closest(".rz") || e.target.closest(".shot-img")) return;
        selectMission(row.dataset.id);
      });
    });
    if (SELECTED && document.querySelector('.tk[data-id="' + cssq(SELECTED) + '"]')) renderTaskTree(SELECTED);
  }

  function selectMission(id) {
    SELECTED = id;
    try { localStorage.setItem(CFG.lsKey, id); } catch (e) {}
    document.querySelectorAll(".tk").forEach(function (r) { r.classList.toggle("sel", r.dataset.id === id); });
    renderTaskTree(id);
  }

  // ------- árbol de TAREAS abc/123 -------
  function taskNode(t, isSub) {
    var own = OWN_ICON[t.owner] || "⚙️";
    return '<div class="node ' + (isSub ? "sub " : "") + esc(t.status) + '" data-code="' + esc(t.code) + '">' +
      '<button class="chip ' + esc(t.status) + '" data-code="' + esc(t.code) + '" title="' + esc(t.status) + ' · clic para avanzar">' + (CHIP[t.status] || "○") + "</button>" +
      '<span class="scode">' + esc(t.code) + "</span>" +
      '<span class="ttl"' + (t.report ? ' title="' + esc(t.report) + '"' : "") + ">" + esc(t.title) + "</span>" +
      '<span class="own" title="' + esc(t.owner || "") + '">' + own + "</span></div>";
  }

  // html de los pasos a/b/c con sus subtareas (sin cabecera): reutilizable en
  // el raíl de una misión y en la vista global /tareas.
  function stepsHtml(tasks) {
    var byCode = {};
    tasks.forEach(function (t) { byCode[t.code] = t; });
    var html = "";
    ["a", "b", "c"].forEach(function (c) {
      if (!byCode[c] && !tasks.some(function (t) { return t.code[0] === c; })) return;
      html += '<div class="step">';
      if (byCode[c]) html += taskNode(byCode[c], false);
      ["1", "2", "3"].forEach(function (n) { if (byCode[c + n]) html += taskNode(byCode[c + n], true); });
      html += "</div>";
    });
    return html;
  }
  function subCount(tasks) {
    return tasks.filter(function (t) { return t.code.length === 2; }).length;
  }
  function nextStatus(cur) { return NEXT_ST[cur] || "in_progress"; }

  function fetchTasks(id) {
    return window.fetch(CFG.worker + "/mission/" + encodeURIComponent(id) + "/tasks", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.tasks || []; });
  }
  // TODAS las tareas de TODAS las misiones en UNA petición (endpoint agregado
  // /tasks/all): reemplaza el N+1 de /tareas y /informes. Cada tarea trae
  // adjuntos subject/screen/loc/created_at de su misión.
  // HALO en el previo del proyecto cuando HAY un agente trabajando la misión:
  // su máquina (canónica) o su agente asignado está VIVO en presencia y la
  // misión no está resuelta. `live` = { machines:Set(canon), personas:Set(lower) }.
  // (Carlos, FLT-761 — prioridad absoluta.)
  function markWorking(container, tickets, live) {
    live = live || {};
    var lm = live.machines, lp = live.personas;
    var byId = {};
    (tickets || []).forEach(function (t) { byId[t.id] = t; });
    (container || document).querySelectorAll(".tk").forEach(function (row) {
      var t = byId[row.dataset.id]; if (!t) return;
      var img = row.querySelector(".shot-img"); if (!img) return;
      var maq = machineOf(t);   // ya canónica
      // una misión difundida agrupa varios agentes (_agents); vale con que UNO viva
      var pers = (t._agents && t._agents.length ? t._agents : [t.assignee])
        .map(function (x) { return String(x || "").toLowerCase(); });
      var alive = (maq && lm && lm.has(maq)) ||
        (lp && pers.some(function (p) { return p && lp.has(p); }));
      var activa = t.status !== "resolved";
      img.classList.toggle("working", !!(alive && activa));
    });
  }

  // El previo deja de ser la home genérica de la web y pasa a mostrar la
  // ACTIVIDAD EN VIVO del agente de la misión: su FOCO actual (de /api/presence)
  // — «qué está haciendo ahora mismo» — y su proof-of-play si lo hay. Si el
  // agente no está vivo, se queda la miniatura que pintó rowHtml. (Carlos, la
  // crítica de que el previo «no servía».) `act` = { "persona_lower|maq_canon":
  // {focus, proj, img, _u} }.
  function fillActivity(container, tickets, act) {
    if (!act) return;
    var byId = {};
    (tickets || []).forEach(function (t) { byId[t.id] = t; });
    (container || document).querySelectorAll(".tk").forEach(function (row) {
      var t = byId[row.dataset.id]; if (!t) return;
      if (t.status === "resolved") return;         // solo misiones vivas
      var cell = row.querySelector(".cel.shot"); if (!cell) return;
      var maq = machineOf(t);
      var pers = (t._agents && t._agents.length ? t._agents : [t.assignee]);
      var a = null;
      for (var i = 0; i < pers.length && !a; i++) {
        var k = String(pers[i] || "").toLowerCase() + "|" + maq;
        if (act[k] && (act[k].focus || act[k].img)) a = act[k];
      }
      if (!a) return;                               // sin actividad → miniatura
      var foco = String(a.focus || "").replace(/^\s*el arquitecto me pide:\s*/i, "").trim();
      cell.innerHTML =
        '<div class="live-act" title="' + esc(a.focus || "") + '">' +
          '<div class="la-hd"><span class="la-dot"></span>EN VIVO</div>' +
          (a.img ? '<img class="la-shot" loading="lazy" src="' + esc(a.img) + '" alt="">' : '') +
          '<div class="la-focus">' + esc(foco || "trabajando…") + '</div>' +
        '</div>';
    });
  }

  function fetchAllTasks(scope) {
    var q = scope ? "?scope=" + encodeURIComponent(scope) : "";
    return window.fetch(CFG.worker + "/tasks/all" + q, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.tasks || []; });
  }
  // Agrupa el array plano de /tasks/all por misión → [{mission, tasks}], la forma
  // que consumen /tareas e /informes. Preserva el orden de aparición.
  function groupByMission(rows) {
    var by = {}, order = [];
    (rows || []).forEach(function (t) {
      if (!by[t.mission_id]) {
        by[t.mission_id] = { mission: {
          id: t.mission_id, subject: t.subject, screen: t.screen, loc: t.loc,
          source: t.source, assignee: t.assignee, status: t.mission_status,
          created_at: t.mission_created
        }, tasks: [] };
        order.push(t.mission_id);
      }
      by[t.mission_id].tasks.push(t);
    });
    return order.map(function (id) { return by[id]; });
  }
  function postStatus(id, code, status) {
    return window.fetch(CFG.worker + "/mission/" + encodeURIComponent(id) + "/task/" + encodeURIComponent(code) + "/status", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: status })
    }).catch(function () {});
  }
  function postPlan(id) {
    return window.fetch(CFG.worker + "/mission/" + encodeURIComponent(id) + "/plan", { method: "POST" }).catch(function () {});
  }

  function renderTaskTree(id) {
    var box = document.getElementById(CFG.treeId);
    if (!box) return;
    if (!id) {
      box.innerHTML = '<div class="empty2">Selecciona una <b>misión</b> en la lista para ver y planificar sus <b>tareas</b>.</div>';
      return;
    }
    fetchTasks(id).then(function (tasks) {
      var header = '<div class="thd"><span class="tmid" title="Misión activa">🎯 ' + esc(id) + '</span><span class="tcount" title="subtareas definidas / máx 9">' + subCount(tasks) + "/9</span></div>";
      if (!tasks.length) {
        box.innerHTML = header + '<div class="empty2">Esta misión aún no tiene plan de tareas.</div><button class="propose" id="ykProposeBtn">🧠 Proponer plan (IA)</button>';
        var pb = document.getElementById("ykProposeBtn");
        if (pb) pb.onclick = function () {
          pb.disabled = true; pb.textContent = "🧠 Proponiendo plan…";
          postPlan(id).then(function () { renderTaskTree(id); });
        };
        return;
      }
      box.innerHTML = header + stepsHtml(tasks);
      box.querySelectorAll(".chip").forEach(function (ch) {
        ch.onclick = function () {
          var cur = STS.find(function (s) { return ch.classList.contains(s); }) || "pending";
          postStatus(id, ch.dataset.code, nextStatus(cur)).then(function () { renderTaskTree(id); });
        };
      });
    }).catch(function () {
      box.innerHTML = '<div class="empty2">No se pudieron cargar las tareas de esta misión.</div>';
    });
  }
  function refreshTree() {
    if (SELECTED && document.querySelector('.tk[data-id="' + cssq(SELECTED) + '"]')) renderTaskTree(SELECTED);
  }

  window.YkMisiones = {
    init: init, selected: selected, selectMission: selectMission,
    rowHtml: rowHtml, bindRows: bindRows, machineOf: machineOf, canonMachine: canonMachine, estadoDe: estadoDe,
    renderTaskTree: renderTaskTree, refreshTree: refreshTree,
    stepsHtml: stepsHtml, subCount: subCount, taskNode: taskNode,
    nextStatus: nextStatus, postStatus: postStatus, postPlan: postPlan,
    fetchTasks: fetchTasks, fetchAllTasks: fetchAllTasks, groupByMission: groupByMission,
    markWorking: markWorking, fillActivity: fillActivity, esc: esc, ago: ago, slaLeft: slaLeft,
    customizeReady: customizeReady
  };
})();
