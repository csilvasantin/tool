/* Detalle factual del Highscore. Funciones puras compartidas con las pruebas. */
(function (root) {
  "use strict";
  var TIME_ZONE = "Europe/Madrid";
  var DAY = new Intl.DateTimeFormat("en-CA", { timeZone:TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit" });
  var HOUR = new Intl.DateTimeFormat("es-ES", { timeZone:TIME_ZONE, hour:"2-digit", hour12:false });

  function text(value) { return String(value == null ? "" : value).trim(); }
  function ms(value) { var n = Number(value) || 0; return n > 0 && n < 1e11 ? n * 1000 : n; }
  function day(value) { var n = ms(value); return n ? DAY.format(new Date(n)) : ""; }
  function today(value, now) { return day(value) === day(now || Date.now()); }
  function key(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function identityParts(value, machine, identity) {
    var parsed = identity.parse(value), sf = identity.suffix(machine) || parsed.suffix || "";
    return { base:identity.key(parsed.persona), suffix:sf, role:parsed.role || "main" };
  }
  function sameFamily(value, machine, target, identity) {
    if (!text(value)) return false;
    var candidate = identityParts(value, machine, identity), wanted = identityParts(target, "", identity);
    return candidate.base === wanted.base && candidate.suffix === wanted.suffix;
  }
  function validAgent(value, identity) {
    var parsed = identity.parse(value), canonical = parsed.suffix && parsed.role === "main"
      ? identity.display(parsed.persona, parsed.suffix) : "";
    return !!canonical && key(canonical) === key(value) && /^(?:oraculo|neo|morfeo|trinity|agentesmith|whiterabbit)/.test(key(canonical));
  }
  function taskIdentity(task, identity) {
    var owner = text(task.owner || task.agent_identity), generic = /^infra(?:agente)?$/i.test(owner) ? "infra" : /^sub(?:agente)?$/i.test(owner) ? "sub" : "";
    return generic ? identity.scoped(task.assignee, task.loc, generic) : (owner || task.assignee || "");
  }
  function mainTask(code) { return /^([a-c])(?:[1-3])?$/i.test(text(code)); }

  function snapshot(agent) {
    try { return JSON.parse(sessionStorage.getItem("yokup.highscore.detail." + key(agent)) || "null"); }
    catch (_) { return null; }
  }

  function scoreFor(agent, daily, tasks, identity, now) {
    var objectives = 0, windows = 0, missions = 0, taskFamilies = Object.create(null);
    (daily && daily.scores || []).forEach(function (row) {
      if (!sameFamily(row.agent, row.machine, agent, identity)) return;
      objectives += Number(row.objective_points) || 0;
      windows += Number(row.window_points) || 0;
      missions += Number(row.mission_points) || 0;
    });
    (tasks || []).forEach(function (task) {
      var match = text(task.code).toLowerCase().match(/^([a-c])(?:[1-3])?$/);
      if (!match || !today(task.updated_at, now) || !/^(?:doing|in_progress|done)$/.test(text(task.status))) return;
      if (!sameFamily(taskIdentity(task, identity), task.loc, agent, identity)) return;
      var family = text(task.mission_id) + "|" + match[1], previous = taskFamilies[family];
      if (!previous || ms(task.updated_at) >= ms(previous.updated_at)) taskFamilies[family] = task;
    });
    var taskCount = Object.keys(taskFamilies).length;
    var taskPoints = Object.keys(taskFamilies).reduce(function (sum, family) {
      return sum + 15 + (/^(?:doing|in_progress)$/.test(text(taskFamilies[family].status)) ? 10 : 0);
    }, 0);
    return { objectives:objectives, windows:windows, missions:missions, tasks:taskPoints, taskCount:taskCount,
      total:objectives + windows + missions + taskPoints };
  }

  function canonicalAgent(value, machine, identity) {
    var parsed = identity.parse(value), resolved = identity.suffix(machine) || parsed.suffix;
    return resolved ? identity.display(parsed.persona, resolved) : text(value);
  }
  function ranking(agent, daily, tasks, identity, now) {
    var names = Object.create(null);
    (daily && daily.scores || []).forEach(function (row) {
      var name = canonicalAgent(row.agent, row.machine, identity); if (name) names[key(name)] = name;
    });
    (tasks || []).forEach(function (task) {
      var name = canonicalAgent(taskIdentity(task, identity), task.loc, identity); if (name) names[key(name)] = name;
    });
    names[key(agent)] = agent;
    var rows = Object.keys(names).map(function (k) { var name = names[k]; return { agent:name, score:scoreFor(name, daily, tasks, identity, now).total }; });
    rows.sort(function (a, b) { return b.score - a.score || a.agent.localeCompare(b.agent); });
    var index = rows.findIndex(function (row) { return key(row.agent) === key(agent); });
    return { place:index >= 0 ? index + 1 : null, total:index >= 0 ? rows[index].score : 0, rows:rows };
  }

  function matchedTasks(agent, tasks, identity) {
    return (tasks || []).filter(function (task) { return sameFamily(taskIdentity(task, identity), task.loc, agent, identity); });
  }
  function taskCountToday(agent, tasks, identity, now) {
    var families = Object.create(null);
    matchedTasks(agent, tasks, identity).forEach(function (task) {
      var match = text(task.code).toLowerCase().match(/^([a-c])(?:[1-3])?$/);
      if (!match || !today(task.updated_at, now) || !/^(?:doing|in_progress|done)$/.test(text(task.status))) return;
      families[text(task.mission_id) + "|" + match[1]] = true;
    });
    return Object.keys(families).length;
  }
  function matchedMissions(agent, missions, identity) {
    return (missions || []).filter(function (mission) {
      return sameFamily(mission.assignee || mission.persona || mission.agent, mission.machine || mission.loc, agent, identity);
    });
  }
  function matchedIncidents(agent, incidents, identity) {
    return (incidents || []).filter(function (incident) {
      return sameFamily(incident.assignee || incident.persona || incident.agent, incident.machine || incident.loc, agent, identity);
    });
  }

  function facts(agent, tasks, missions, incidents, identity) {
    var ownTasks = matchedTasks(agent, tasks, identity), ownMissions = matchedMissions(agent, missions, identity), ownIncidents = matchedIncidents(agent, incidents, identity);
    var topTasks = ownTasks.filter(function (task) { return /^[a-c]$/i.test(text(task.code)); });
    var doneTasks = topTasks.filter(function (task) { return /^(?:done|resolved)$/.test(text(task.status)); }).length;
    var reports = ownTasks.filter(function (task) { return !!text(task.report); }).length;
    var resolvedMissions = ownMissions.filter(function (mission) { return text(mission.status) === "resolved"; }).length;
    var resolvedIncidents = ownIncidents.filter(function (incident) { return text(incident.status) === "resolved"; }).length;
    var pendingTasks = topTasks.filter(function (task) { return !/^(?:done|resolved)$/.test(text(task.status)); }).length;
    var activeMissions = ownMissions.filter(function (mission) { return /^(?:open|in_progress)$/.test(text(mission.status)); }).length;
    var openIncidents = ownIncidents.filter(function (incident) { return /^(?:open|in_progress)$/.test(text(incident.status)); }).length;
    var good = [], improve = [];
    if (resolvedMissions) good.push({ value:resolvedMissions, label:"misiones finalizadas", href:"/misiones" });
    if (doneTasks) good.push({ value:doneTasks, label:"tareas principales terminadas", href:"/tareas" });
    if (reports) good.push({ value:reports, label:"informes con contenido", href:"/informes" });
    if (resolvedIncidents) good.push({ value:resolvedIncidents, label:"incidencias resueltas", href:"/incidencias" });
    if (activeMissions) improve.push({ value:activeMissions, label:"misiones abiertas o en curso", href:"/misiones" });
    if (pendingTasks) improve.push({ value:pendingTasks, label:"tareas principales aún no terminadas", href:"/tareas" });
    if (openIncidents) improve.push({ value:openIncidents, label:"incidencias abiertas o en curso", href:"/incidencias" });
    return { good:good, improve:improve };
  }

  function timeline(agent, tasks, missions, incidents, identity, now) {
    var events = [];
    matchedTasks(agent, tasks, identity).forEach(function (task) {
      if (!today(task.updated_at, now)) return;
      events.push({ at:ms(task.updated_at), type:"Tarea", detail:text(task.code).toUpperCase() + " · " + text(task.status) });
      if (text(task.report)) events.push({ at:ms(task.updated_at), type:"Informe", detail:text(task.mission_id) + " · " + text(task.code).toUpperCase() });
    });
    matchedMissions(agent, missions, identity).forEach(function (mission) {
      var at = mission.resolved_at || mission.live_at || mission.updated_at || mission.created_at;
      if (today(at, now)) events.push({ at:ms(at), type:"Misión", detail:text(mission.id) + " · " + text(mission.status) });
    });
    matchedIncidents(agent, incidents, identity).forEach(function (incident) {
      var at = incident.resolved_at || incident.updated_at || incident.created_at;
      if (today(at, now)) events.push({ at:ms(at), type:"Incidencia", detail:(text(incident.display_ref || incident.id) || "Sin referencia") + " · " + text(incident.status) });
    });
    var grouped = Object.create(null);
    events.sort(function (a, b) { return a.at - b.at; }).forEach(function (event) {
      var hour = HOUR.format(new Date(event.at)).padStart(2, "0") + ":00";
      if (!grouped[hour]) grouped[hour] = { hour:hour, count:0, events:[] };
      grouped[hour].count++; grouped[hour].events.push(event);
    });
    return Object.keys(grouped).sort().map(function (hour) { return grouped[hour]; });
  }

  root.YkHighscoreDetail = { key:key, ms:ms, today:today, validAgent:validAgent, sameFamily:sameFamily, taskIdentity:taskIdentity,
    snapshot:snapshot, scoreFor:scoreFor, ranking:ranking, taskCountToday:taskCountToday,
    facts:facts, timeline:timeline, timeZone:TIME_ZONE };
})(typeof window !== "undefined" ? window : globalThis);
