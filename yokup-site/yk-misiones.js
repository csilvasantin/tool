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

  // ------- fila de MISIÓN (idéntica en /incidencias y /misiones) -------
  // ESTADOS canónicos (Carlos, 2026-07-15): Sin asignar · Asignada · En curso ·
  // Finalizada. «Abierta» era ruido: mezclaba pendiente-de-asignar con asignada.
  function estadoDe(t) {
    if (t.status === "resolved") return { c: "b-res", l: "Finalizada" };
    if (t.status === "in_progress") return { c: "b-prog", l: "En curso" };
    return t.assignee ? { c: "b-open", l: "Asignada" } : { c: "b-sina", l: "Sin asignar" };
  }

  function rowHtml(t) {
    var est = estadoDe(t);
    var sb = est.c, stt = est.l;
    var maq = machineOf(t);
    // COLUMNAS con separador vertical sutil y REDIMENSIONABLES (Carlos, 2026-07-15):
    // cada .rz es la línea divisoria — se arrastra y ajusta la variable CSS de SU
    // columna (--c-*) para TODAS las tarjetas a la vez; se persiste en localStorage.
    var rz = function (col, side) { return '<span class="rz" data-col="' + col + '"' + (side ? ' data-side="' + side + '"' : "") + ' title="⇔ arrastra para redimensionar"></span>'; };
    return '<div class="tk ' + (t.status === "open" ? "open" : "") + " " + (t.id === SELECTED ? "sel" : "") + '" data-id="' + esc(t.id) + '">' +
      '<div class="hd">' +
        '<div class="pri ' + esc(t.priority) + '"></div>' +
        '<div class="tkid">' + esc(t.id) + '<span class="st">' + (t.source === "agent-iot" ? "🤖 Agente IoT" : "👤 Manual") + "</span>" +
          (maq ? '<span class="mach">🖥 ' + esc(maq) + "</span>" : '<span class="mach dim">🖥 sin máquina</span>') + "</div>" +
        '<div class="subj">' + rz("id", "r") + '<div class="t">' + esc(t.subject) + '</div><div class="m"><span class="scr">' + esc(t.screen) + "</span>" +
          (t.loc ? "<span>" + esc(t.loc) + "</span>" : "") + "<span>" + ago(t.created_at) + "</span></div></div>" +
        '<div class="cel rtiempo">' + rz("fch") + '<span class="fch2" title="fecha de creación de la misión">📅 ' + fechaCorta(t.created_at) + "</span>" +
          (t.status === "open" ? '<span class="sla">' + slaLeft(t.created_at) + "</span>" : "") + "</div>" +
        '<div class="cel">' + rz("who") + '<span class="who">👷 ' + esc(t.assignee) + "</span></div>" +
        '<div class="cel">' + rz("est") + '<span class="badge ' + sb + '"><i></i>' + stt + "</span></div>" +
        '<div class="cel">' + rz("abrir") + '<a class="tkopen" href="/ticket?id=' + encodeURIComponent(t.id) + '">abrir →</a></div>' +
      "</div></div>";
  }

  // ---- Redimensionado de columnas de la lista -------------------------------
  var COLVARS = { id: "--c-id", fch: "--c-fch", who: "--c-who", est: "--c-est", abrir: "--c-abrir" };
  function initColResize() {
    if (initColResize._done) return; initColResize._done = true;
    var saved = {}; try { saved = JSON.parse(localStorage.getItem("yk_cols") || "{}"); } catch (e) {}
    for (var k in saved) if (COLVARS[k] && saved[k] > 0) document.documentElement.style.setProperty(COLVARS[k], saved[k] + "px");
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
      document.documentElement.style.setProperty(COLVARS[drag.col], Math.max(56, Math.min(520, w)) + "px");
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
        if (e.target.closest(".tkopen") || e.target.closest(".rz")) return;
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
    fetchTasks: fetchTasks, esc: esc, ago: ago, slaLeft: slaLeft
  };
})();
