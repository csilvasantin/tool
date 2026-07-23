/* ============================================================================
 * yk-misiones.js — Lógica compartida del modelo MISIONES · TAREAS.
 *
 * Doctrina — REGLA DE LOS TERCIOS: una MISIÓN (ticket) se descompone en 3 tareas
 * a·b·c con 3 subtareas cada una (a1..c3, máx 9). Los planes ANTIGUOS con pasos
 * d…h (modelo de 8) no se tocan: se cuentan aparte como «+n». La fila de cierre
 * z1 la genera el worker y no cuenta. Subagentes ejecutan, infraagentes
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
 *   YkMisiones.stepsHtml(tasks)           // árbol a·b·c/1·2·3 (vistas globales)
 *   YkMisiones.tercios(tasks)             // {done,total:3,sdone,stotal:9,extra}
 *   YkMisiones.progHtml(p)                // chip «n/3 · n/9 (+n)»
 *   YkMisiones.subCount(tasks)            // subtareas definidas del plan
 *   YkMisiones.nextStatus(cur) / postStatus(id, code, status)
 * ==========================================================================*/
(function () {
  "use strict";

  var CFG = { worker: "", treeId: "taskTree", lsKey: "yk_mission" };
  var SELECTED = "";
  // CAJÓN DE DETALLE (Carlos, 2026-07-21): al seleccionar una misión, el raíl
  // derecho deja de ser solo el árbol abc y pasa a ser la ficha completa —
  // asunto, equipo/agente, estado, captura e informe — para no tener que saltar
  // a /ticket y perder el tablero. La ficha se cachea al pintar la fila (sin
  // fetch extra); el informe se pide a /ticket sólo al abrir el cajón.
  var MIS_CACHE = {};

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
  var CUSTOM = { agents: {}, machines: {}, board: {} };
  var customizeReady = (function () {
    try {
      return window.fetch("https://yokup-rtc.csilvasantin.workers.dev/prefs/customize", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var c = (d && d.customize) || {};
          CUSTOM.agents = c.agents || {};
          CUSTOM.machines = c.machines || {};
          CUSTOM.board = c.board || {};
        }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  })();
  // Preferencias del TABLERO (Panel de control → Tablero de misiones):
  // {cols:{proyecto|fecha|ordenador|agente|estado:0|1}, density:"comoda"|"compacta"}.
  function boardPrefs() { return CUSTOM.board || {}; }

  // Imagen de un agente (foto del Panel de control > avatar builtin) o "".
  function agImg(name) {
    var s = avSlug(name), cu = CUSTOM.agents[s] || {};
    return cu.img || (AVATARES[s] ? "/avatars/" + s + ".jpg" : "");
  }
  // Máquinas VIVAS (canon) según /api/browsers + presence; lo inyecta la página con
  // setLiveMachines. null = aún sin datos → NO se alarma. (Carlos, 21-jul-2026)
  var LIVE_MACHINES = null;
  // Runtime DEDUCIDO por doctrina de la persona (mismo mapa que yk-cabezal). Cuando el
  // nudge no confirmó la plataforma (agent_runtime null) pero sabemos qué LLM anima a
  // esa persona, se pinta ese runtime marcado como deducido en vez de «Pendiente»
  // mudo: una misión puede estar EN CURSO con la plataforma vacía. (Carlos, 21-jul-2026)
  var RT_FIJO = { neo: "Claude", morfeo: "Claude", whiterabbit: "Claude", oraculo: "Codex", trinity: "Codex", smith: "Grok" };
  // Estado "máquina apagada" para una misión PENDIENTE (sin surface): si su máquina
  // destino NO está entre las vivas, el empujón no llegó y nadie la recogerá.
  function machOffOf(t, surface) {
    // Sin datos de vivas (null) o set VACÍO (fetch falló / aún no cargó) → no se
    // puede saber, así que NO se alarma: mejor «Pendiente» que un falso «apagada».
    if (surface || !LIVE_MACHINES || !LIVE_MACHINES.size) return null;
    var mc = canonMachine(t.machine || t.loc || "");
    if (!mc || LIVE_MACHINES.has(mc)) return null;
    return { since: t.created_at, machine: t.machine || t.loc || "" };
  }

  function whoHtml(name, surface, agents, machOff) {
    var s = avSlug(name);
    var cu = CUSTOM.agents[s] || {};
    // Plataforma: surface (runtime·host) si la máquina respondió al empujón; si no,
    // "Pendiente" (máquina viva, aún sin recoger) o aviso si la máquina está apagada.
    var plat, platCls, platTitle = "";
    if (surface) { plat = esc(surface); platCls = "agent-surface"; }
    else if (machOff) {
      plat = "⚠️ apagada"; platCls = "agent-surface off";
      platTitle = "La máquina destino" + (machOff.machine ? " (" + machOff.machine + ")" : "") + " está sin señal / apagada" + (machOff.since ? " · pendiente desde " + fechaCorta(machOff.since) : "") + ": el empujón no llegó y nadie la recogerá hasta que vuelva online.";
    } else if (RT_FIJO[s]) {
      // Plataforma DEDUCIDA por la doctrina de la persona (aún sin confirmar por la
      // máquina): mejor decir el runtime probable que un «Pendiente» mudo. Cursiva.
      plat = esc(RT_FIJO[s]); platCls = "agent-surface deduc";
      platTitle = "Runtime deducido por la doctrina de " + name + " (aún sin confirmar por la máquina).";
    } else { plat = "Pendiente"; platCls = "agent-surface pend"; }
    var smallHtml = '<small class="' + platCls + '"' + (platTitle ? ' title="' + esc(platTitle) + '"' : "") + ">" + plat + "</small>";
    // Misión DIFUNDIDA (2-3 agentes agrupados): PILA de retratos, una imagen
    // encima de la otra (Carlos, 2026-07-19), con el rótulo del grupo debajo.
    if (avatarOn() && agents && agents.length > 1) {
      var pics = agents.slice(0, 3).map(function (a) {
        var im = agImg(a);
        return im ? '<img class="agava" loading="lazy" onerror="this.remove()" src="' + esc(im) + '" alt="" title="' + esc(a) + '">' : "";
      }).filter(Boolean);
      if (pics.length) {
        return '<span class="who who-av"><span class="agstack">' + pics.join("") + "</span>" +
          "<span>" + esc(name) + "</span>" + smallHtml + "</span>";
      }
    }
    // FOTO del Panel de control > avatar builtin; ICONO personalizado > 👷.
    var img = agImg(name);
    if (avatarOn() && img) {
      return '<span class="who who-av"><img class="agava" loading="lazy" onerror="this.remove()" src="' + esc(img) + '" alt="">' +
        "<span>" + esc(name) + "</span>" + smallHtml + "</span>";
    }
    return '<span class="who"><span>' + (cu.icon ? esc(cu.icon) : "👷") + " " + esc(name) +
      "</span>" + smallHtml + "</span>";
  }
  // Visual de la columna ORDENADOR: foto pequeña > icono personalizado > 🖥.
  function machVisual(maq) {
    var cu = CUSTOM.machines[avSlug(maq)] || {};
    if (cu.img) return '<img class="machava" loading="lazy" onerror="this.outerHTML=\'🖥\'" src="' + esc(cu.img) + '" alt="">';
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
  // El proyecto ASIGNADO manda sobre el adivinado. Desde FLT-984 la misión lleva
  // su proyecto del censo (`project` = id, `project_name` = nombre, y la web en
  // /projects), así que la miniatura sale del dato y no de buscar palabras en el
  // asunto. La búsqueda por palabras se queda SOLO como respaldo para las
  // misiones viejas, que nadie ha asignado todavía.
  var PROY_WEB = {};   // id del censo → web, lo rellena YkMisiones.setProyectos
  function proyectoDe(t) {
    var pid = t && (t.project || "");
    if (pid && PROY_WEB[String(pid).toLowerCase()]) return PROY_WEB[String(pid).toLowerCase()];
    var s = ((t && (t.subject || "")) + " " + (t && (t.screen || "")) + " " + (t && (t.loc || ""))).toLowerCase();
    for (var i = 0; i < PROY.length; i++) if (s.indexOf(PROY[i][0]) >= 0) return PROY[i][1];
    return "";
  }
  // Censo de proyectos (GET /projects) para resolver web y nombre sin adivinar.
  function setProyectos(list) {
    PROY_WEB = {};
    (list || []).forEach(function (p) {
      if (!p || !p.id || !p.web) return;
      var w = String(p.web).trim();
      PROY_WEB[String(p.id).toLowerCase()] = /^https?:\/\//i.test(w) ? w : "https://" + w;
    });
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
    // Encapsulado: el botón de una letra despliega/pliega SUS subtareas (nivel de
    // dentro; delegado para que valga en /tareas y /misiones sin cablear cada vista).
    var tog = e.target.closest && e.target.closest(".substog");
    if (tog) { var step = tog.closest(".step"); if (step) { step.classList.toggle("collapsed"); var op = !step.classList.contains("collapsed"); tog.textContent = (op ? "▾ " : "▸ ") + tog.textContent.replace(/^[▸▾]\s*/, ""); } return; }
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
    if (t.status === "cancelled") return { c: "b-cancel", l: "Cancelada" };
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
  // REGLA DE LOS TERCIOS (FLT-979): el avance de una misión se lee SIEMPRE en
  // tercios — TAREAS a·b·c sobre 3 y SUBTAREAS a1…c3 sobre 9. Antes el contador
  // usaba `COUNT(*)` de mission_tasks (lo que sirve el worker en `progress`), que
  // mezcla pasos + subtareas + filas de cierre (z1) y daba 1/13, 0/12, 1/29 o
  // 33/33: denominadores que no se pueden comparar de un vistazo.
  // Las misiones VIEJAS con pasos d…h (modelo de 8) no se tocan ni se borran: sus
  // filas fuera del tercio se cuentan aparte y se avisan en el title.
  function tercios(rows) {
    var top = [], sub = [], extra = 0, extraDone = 0;
    (rows || []).forEach(function (r) {
      var c = String((r && r.code) || "").trim().toLowerCase();
      if (/^[a-c]$/.test(c)) top.push(r);
      else if (/^[a-c][1-3]$/.test(c)) sub.push(r);
      // z1/z2 = fila de CIERRE (informe) que genera el propio worker, no es un
      // paso del plan: ni suma ni resta en el contador de tercios.
      else if (c && !/^z\d*$/.test(c)) { extra++; if (r.status === "done") extraDone++; }
    });
    if (!top.length && !sub.length && !extra) return null;
    var hecho = function (a) { return a.filter(function (r) { return r.status === "done"; }).length; };
    // DENOMINADORES FIJOS 3 y 9 (decisión de Carlos vía coordinación, 22-jul-2026).
    // Antes el denominador era el tamaño REAL del plan (Math.min(top,3)||3 y
    // Math.min(sub,9)), así que un plan a medio definir leía 0/2 · 0/6 y volvía a
    // no poderse comparar con uno de 0/3 · 0/9 — justo el problema que la regla
    // venía a matar. Un plan con 2 tareas NO es un plan de 2: es un plan de 3
    // INCOMPLETO, y eso se dice (incompleto/topN/subN → borde discontinuo y ◌),
    // no se disimula bajando el denominador. Nunca se inventan filas.
    return {
      done: hecho(top), total: 3,
      sdone: hecho(sub), stotal: 9,
      topN: top.length, subN: sub.length,
      incompleto: top.length < 3 || sub.length < 9,
      extra: extra, extraDone: extraDone
    };
  }
  // Chip de progreso de una fila: «n/3» de tareas + «n/9» de subtareas, SIEMPRE
  // sobre 3 y 9 para que dos misiones se comparen de un vistazo. Estados:
  //   .full     → 3/3 · 9/9, el tercio entero hecho (verde sólido).
  //   .hechoinc → todo lo DEFINIDO está hecho, pero el plan no llega a 3×3:
  //               cifras en verde con borde discontinuo, no se vende por pleno.
  //   .inc      → plan incompleto (borde discontinuo + ◌); el tooltip dice
  //               cuántas filas hay definidas de las 3 y las 9 que tocan.
  function progHtml(p) {
    if (!p || !p.total) return "";
    var pct = Math.round(100 * (p.done * 3 + p.sdone) / (p.total * 3 + p.stotal));
    var pleno = p.done >= p.total && p.sdone >= p.stotal;
    var hechoInc = !pleno && p.topN > 0 && p.done >= p.topN && p.sdone >= p.subN;
    var tip = p.done + " de " + p.total + " tareas hechas · " + p.sdone + " de " + p.stotal + " subtareas"
      + (p.incompleto ? " · PLAN INCOMPLETO: sólo hay " + p.topN + " de 3 tareas y " + p.subN + " de 9 subtareas definidas" : "")
      + (p.extra ? " · +" + p.extraDone + "/" + p.extra + " pasos de un plan antiguo (d…h), fuera de los tercios" : "");
    return '<span class="prog' + (pleno ? " full" : "") + (hechoInc ? " hechoinc" : "") + (p.incompleto ? " inc" : "") + '" title="' + esc(tip) + '">' +
      '<span class="prog-fill" style="width:' + pct + '%"></span>' +
      "<b>" + p.done + "/" + p.total + "</b>" +
      '<i class="prog-sub">' + p.sdone + "/" + p.stotal + "</i>" +
      (p.extra ? '<i class="prog-mas">+' + p.extra + "</i>" : "") +
      (p.incompleto ? '<i class="prog-inc" aria-hidden="true">◌</i>' : "") + "</span>";
  }
  function rowHtml(t) {
    MIS_CACHE[t.id] = t;   // cajón de detalle: la ficha ya viene con la lista, sin fetch extra
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
        // FECHA: creación (📅) arriba, finalización (🏁) debajo, y la duración (⏱).
        // Si la misión sigue viva, en el hueco del fin va «en curso» — nunca una hora
        // inventada. created_at/resolved_at ya vienen; los tooltips dan la fecha. (947)
        '<div class="cel rtiempo">' + rz("fch") +
          '<span class="fch2" title="creada: ' + esc(fechaCorta(t.created_at)) + '">📅 ' + fechaCorta(t.created_at) + "</span>" +
          (dv && dv.end ? '<span class="fch2 fin" title="finalizada: ' + esc(fechaCorta(dv.end)) + '">🏁 ' + fechaCorta(dv.end) + "</span>"
            : (dv && dv.run ? '<span class="fch2 run" title="' + esc(dv.tip) + '">⏳ en curso</span>' : "")) +
          (dv && dv.txt ? '<span class="dur' + (dv.run ? " run" : "") + '" title="' + esc(dv.tip) + '">⏱ ' + esc(dv.txt) + "</span>" : "") + "</div>" +
        // ORDENADOR (entre Fecha y Agente).
        '<div class="cel ord">' + rz("ord") + (maq ? '<span class="mach2">' + machVisual(maq) + " " + (window.ykMaquina ? ykMaquina.html(maq) : esc(maq)) + "</span>" : '<span class="mach2 dim">🖥 sin máquina</span>') + "</div>" +
        // Celda de AGENTE con clase `agc` (target del picker de reasignación en
        // /misiones; inocua en /incidencias, que no la cablea). Carlos, 2026-07-15.
        '<div class="cel agc">' + rz("who") + whoHtml(t.assignee, surface, t._agents, machOffOf(t, surface)) + "</div>" +
        // Estado + ABRIR apilado (abrir debajo de la insignia).
        '<div class="cel est">' + rz("est") + '<span class="badge ' + sb + '"' + (t.status === "cancelled" && t.note ? ' title="' + esc(t.note) + '"' : "") + "><i></i>" + stt + "</span>" + (t.status === "cancelled" && t.note ? '<small class="cancel-note" title="' + esc(t.note) + '">' + esc(t.note) + "</small>" : "") +
          // PROGRESO en la fila, en TERCIOS: tareas n/3 y subtareas n/9 (979).
          // Solo si la misión tiene plan. (959, 963)
          progHtml(t._prog) +
          '<a class="tkopen" href="/tareas?mission=' + encodeURIComponent(t.id) + '" title="ver el plan de esta misión en /tareas">detalle ↳</a>' +
          '<a class="tkopen" href="/ticket?id=' + encodeURIComponent(t.id) + '">abrir →</a>' +
          (maq ? '<a class="tkopen" target="_blank" rel="noopener" href="https://www.admira.live/control?rc=admira-' + encodeURIComponent(maq) + '&name=' + encodeURIComponent(maq) + '" title="Operar esta máquina en admira.live/control (ver + ratón + teclado)">🖥 operar ↗</a>' : '') +
          '</div>' +
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
      return { txt: durFmt(end - start), run: false, end: end, tip: "de asignada a finalizada" };
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

  // ------- árbol de TAREAS a·b·c/1·2·3 (jornada completa: 3×3) -------
  // Convierte URLs del texto en enlaces pulsables (target=_blank, rel=noopener).
  // Escapa TODO primero (anti-XSS) y solo entonces envuelve las URLs; el clic en el
  // enlace no debe propagar al nodo (que avanza el estado). Carlos, 21-jul-2026.
  function linkify(s) {
    s = String(s == null ? "" : s);
    var re = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]}"']/g, out = "", last = 0, m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      out += '<a href="' + esc(m[0]) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(m[0]) + "</a>";
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  function taskNode(t, isSub) {
    var own = OWN_ICON[t.owner] || "⚙️";
    // Texto compacto: el título se recorta a 2 líneas por CSS (.ttl line-clamp) y el
    // texto COMPLETO —título + informe si lo hay— va en el tooltip; no se pierde nada.
    var full = String(t.title || "") + (t.report ? " — " + t.report : "");
    // Miniatura si la tarea tiene captura de prueba: reutiliza .shot-img → lightbox.
    var shot = t.image ? '<img class="node-shot shot-img" loading="lazy" src="' + esc(t.image) + '" data-proof="' + esc(t.image) + '" alt="prueba" title="pantallazo de esta tarea · clic para ampliar">' : "";
    return '<div class="node ' + (isSub ? "sub " : "") + esc(t.status) + '" data-code="' + esc(t.code) + '">' +
      '<button class="chip ' + esc(t.status) + '" data-code="' + esc(t.code) + '" title="' + esc(t.status) + ' · clic para avanzar">' + (CHIP[t.status] || "○") + "</button>" +
      // El CÓDIGO del paso enlaza a su detalle en /tareas (foco + scroll al paso); el
      // chip de al lado sigue AVANZANDO el estado — no le robamos el clic. (964)
      (t.mission_id ? '<a class="scode" href="/tareas?mission=' + encodeURIComponent(t.mission_id) + "#" + esc(t.code) + '" title="ver este paso en /tareas">' + esc(t.code) + "</a>" : '<span class="scode">' + esc(t.code) + "</span>") +
      '<span class="ttl" title="' + esc(full) + '">' + linkify(t.title) + "</span>" +
      shot +
      '<span class="own" title="' + esc(t.owner || "") + '">' + own + "</span>" +
      // CONSTANCIA del paso: qué se hizo (report), con enlaces pulsables. Va en su
      // propia línea (flex-wrap) para que se lea sin apretar la fila. (954)
      (t.report && String(t.report).trim() && t.report !== t.title ? '<small class="node-rep" title="' + esc(t.report) + '">↳ ' + linkify(t.report) + "</small>" : "") +
      "</div>";
  }

  // html de los pasos del plan con sus subtareas (sin cabecera): reutilizable en
  // el raíl de una misión y en la vista global /tareas. OJO: aquí vivía el
  // ÚLTIMO tope del modelo de 3 pasos — el worker ya servía a…h y esta lista
  // pintaba sólo abc, así que d…h desaparecían en silencio (Carlos, 21-07-2026).
  function stepsHtml(tasks) {
    var byCode = {};
    tasks.forEach(function (t) { byCode[t.code] = t; });
    var html = "";
    ["a", "b", "c", "d", "e", "f", "g", "h"].forEach(function (c) {
      var subs = ["1", "2", "3"].map(function (n) { return byCode[c + n]; }).filter(Boolean);
      if (!byCode[c] && !subs.length) return;
      // Jerarquía ENCAPSULADA: las subtareas a1/a2/a3 van DENTRO de su letra y
      // PLEGADAS por defecto — se ve a/b/c y se despliega la letra que interese.
      // Es el nivel de DENTRO; la ficha entera se pliega aparte. (Carlos, 954/958)
      html += '<div class="step' + (subs.length ? " has-subs collapsed" : "") + '" data-step="' + esc(c) + '">';
      if (byCode[c]) html += taskNode(byCode[c], false);
      if (subs.length) {
        html += '<button class="substog" type="button" title="ver/ocultar las ' + subs.length + ' subtareas">▸ ' + subs.length + " sub" + (subs.length > 1 ? "s" : "") + "</button>";
        html += '<div class="substeps">';
        subs.forEach(function (s) { html += taskNode(s, true); });
        html += "</div>";
      }
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

  // Ficha del cajón: cabecera con asunto, equipo/agente, estado, captura y hueco
  // para el informe (que llega asíncrono de /ticket). Todo con lo ya cargado.
  function detalleHtml(id) {
    var t = MIS_CACHE[id];
    if (!t) return "";
    var est = estadoDe(t), maq = machineOf(t);
    var img = t.proof_image || t.live_shot || "";
    var agentes = (t._agents && t._agents.length) ? t._agents.join(" · ") : (t.assignee || "sin agente");
    return '<div class="mdet">' +
      '<div class="mdet-t">' + esc(prioMarca(t.subject).limpio) + "</div>" +
      '<div class="mdet-m"><span class="badge ' + est.c + '"><i></i>' + est.l + "</span>" +
        (maq ? '<span class="mdet-k">🖥 ' + esc(maq) + "</span>" : "") +
        '<span class="mdet-k">👷 ' + esc(agentes) + "</span></div>" +
      (img ? '<img class="mdet-img" loading="lazy" onerror="this.remove()" src="' + esc(img) + '" alt="prueba del trabajo">' : "") +
      '<div class="mdet-inf" data-inf>· cargando informe…</div>' +
      '<a class="mdet-open" href="/ticket?id=' + encodeURIComponent(id) + '">ficha completa e historial →</a>' +
      "</div>";
  }
  // Informe: último evento con texto de /ticket (endpoint con sesión). Falla en
  // silencio — el cajón sigue siendo útil sin él.
  function fillInforme(id) {
    var box = document.getElementById(CFG.treeId); if (!box) return;
    var slot = box.querySelector("[data-inf]"); if (!slot) return;
    window.fetch(CFG.worker + "/ticket?id=" + encodeURIComponent(id), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (SELECTED !== id) return;                       // cambió la selección mientras cargaba
        var ev = (d && d.events) || [];
        var inf = ev.filter(function (e) { return e && e.text && /informe|hecha|done|resuelt/i.test((e.kind || "") + " " + e.text); }).pop()
               || ev.filter(function (e) { return e && e.text; }).pop();
        slot.innerHTML = inf ? ('<b>' + esc(inf.author || "informe") + "</b> · " + esc(String(inf.text).slice(0, 400)))
                             : '<span class="dim">sin informe todavía</span>';
      })
      .catch(function () { if (slot) slot.innerHTML = '<span class="dim">informe no disponible (¿sesión caducada?)</span>'; });
  }
  function renderTaskTree(id) {
    var box = document.getElementById(CFG.treeId);
    if (!box) return;
    if (!id) {
      box.innerHTML = '<div class="empty2">Selecciona una <b>misión</b> en la lista para ver su <b>ficha</b> y sus <b>tareas</b>.</div>';
      return;
    }
    // 1) LA FICHA VA PRIMERO y SIN esperar a nada: sus datos ya vienen con la
    //    lista. Antes todo el cajón colgaba del fetch de tareas — si ese fetch
    //    tardaba (o esperaba sesión), no se veía NADA. Ahora el detalle es
    //    instantáneo y el árbol se rellena cuando llega.
    box.innerHTML = detalleHtml(id) + '<div id="ykTreePart"><div class="empty2">· cargando tareas…</div></div>';
    fillInforme(id);
    var part = function () { return document.getElementById("ykTreePart"); };
    fetchTasks(id).then(function (tasks) {
      if (SELECTED !== id) return;                      // cambió la selección mientras cargaba
      var p = part(); if (!p) return;
      // REGLA DE LOS TERCIOS (FLT-979, tarea c): la cabecera del cajón seguía
      // contando «subtareas definidas / máx 24» — el denominador del modelo VIEJO
      // de 8 pasos, justo lo que la misión venía a eliminar. Ahora lee en tercios
      // igual que el chip de la fila: tareas n/3 · subtareas n/9 (+n si el plan
      // es antiguo y arrastra pasos d…h).
      var _tc = tercios(tasks);
      var header = '<div class="thd"><span class="tmid" title="Misión activa">🎯 ' + esc(id) + "</span>" +
        (_tc ? progHtml(_tc) : '<span class="tcount" title="esta misión aún no tiene plan de tareas">0/3</span>') + "</div>";
      if (!tasks.length) {
        p.innerHTML = header + '<div class="empty2">Esta misión aún no tiene plan de tareas.</div><button class="propose" id="ykProposeBtn">🧠 Proponer plan (IA)</button>';
        var pb = document.getElementById("ykProposeBtn");
        if (pb) pb.onclick = function () {
          pb.disabled = true; pb.textContent = "🧠 Proponiendo plan…";
          postPlan(id).then(function () { renderTaskTree(id); });
        };
        return;
      }
      p.innerHTML = header + stepsHtml(tasks);
      p.querySelectorAll(".chip").forEach(function (ch) {
        ch.onclick = function () {
          var cur = STS.find(function (s) { return ch.classList.contains(s); }) || "pending";
          postStatus(id, ch.dataset.code, nextStatus(cur)).then(function () { renderTaskTree(id); });
        };
      });
    }).catch(function () {
      var p = part(); if (p) p.innerHTML = '<div class="empty2">No se pudieron cargar las tareas de esta misión.</div>';
    });
  }
  function refreshTree() {
    if (SELECTED && document.querySelector('.tk[data-id="' + cssq(SELECTED) + '"]')) renderTaskTree(SELECTED);
  }

  window.YkMisiones = {
    init: init, selected: selected, selectMission: selectMission,
    rowHtml: rowHtml, bindRows: bindRows, machineOf: machineOf, canonMachine: canonMachine, estadoDe: estadoDe,
    setLiveMachines: function (set) { LIVE_MACHINES = set || null; },
    setProyectos: setProyectos, proyectoDe: proyectoDe,
    renderTaskTree: renderTaskTree, refreshTree: refreshTree,
    stepsHtml: stepsHtml, subCount: subCount, taskNode: taskNode,
    tercios: tercios, progHtml: progHtml,
    nextStatus: nextStatus, postStatus: postStatus, postPlan: postPlan,
    fetchTasks: fetchTasks, fetchAllTasks: fetchAllTasks, groupByMission: groupByMission,
    markWorking: markWorking, fillActivity: fillActivity, esc: esc, ago: ago, slaLeft: slaLeft,
    customizeReady: customizeReady, boardPrefs: boardPrefs, machVisual: machVisual
  };
})();
