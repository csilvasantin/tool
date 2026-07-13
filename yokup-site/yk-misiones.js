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

  function init(opts) {
    opts = opts || {};
    if (opts.worker) CFG.worker = opts.worker;
    if (opts.treeId) CFG.treeId = opts.treeId;
    try { SELECTED = localStorage.getItem(CFG.lsKey) || ""; } catch (e) {}
  }
  function selected() { return SELECTED; }

  // ------- fila de MISIÓN (idéntica en /incidencias y /misiones) -------
  function rowHtml(t) {
    var sb = t.status === "open" ? "b-open" : (t.status === "resolved" ? "b-res" : "b-prog");
    var stt = t.status === "open" ? "Abierta" : (t.status === "resolved" ? "Resuelta" : "En curso");
    return '<div class="tk ' + (t.status === "open" ? "open" : "") + " " + (t.id === SELECTED ? "sel" : "") + '" data-id="' + esc(t.id) + '">' +
      '<div class="hd">' +
        '<div class="pri ' + esc(t.priority) + '"></div>' +
        '<div class="tkid">' + esc(t.id) + '<span class="st">' + (t.source === "agent-iot" ? "🤖 Agente IoT" : "👤 Manual") + "</span></div>" +
        '<div class="subj"><div class="t">' + esc(t.subject) + '</div><div class="m"><span class="scr">' + esc(t.screen) + "</span>" +
          (t.loc ? "<span>" + esc(t.loc) + "</span>" : "") + "<span>" + ago(t.created_at) + "</span></div></div>" +
        '<div class="right">' + (t.status === "open" ? '<span class="sla">' + slaLeft(t.created_at) + "</span>" : "") +
          '<span class="who">👷 ' + esc(t.assignee) + '</span><span class="badge ' + sb + '"><i></i>' + stt + "</span>" +
          '<a class="tkopen" href="/ticket?id=' + encodeURIComponent(t.id) + '">abrir →</a></div>' +
      "</div></div>";
  }

  // click en la fila = seleccionar misión (el enlace «abrir →» sigue navegando)
  function bindRows(container) {
    (container || document).querySelectorAll(".tk").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest(".tkopen")) return;
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
    rowHtml: rowHtml, bindRows: bindRows,
    renderTaskTree: renderTaskTree, refreshTree: refreshTree,
    stepsHtml: stepsHtml, subCount: subCount, taskNode: taskNode,
    nextStatus: nextStatus, postStatus: postStatus, postPlan: postPlan,
    fetchTasks: fetchTasks, esc: esc, ago: ago, slaLeft: slaLeft
  };
})();
