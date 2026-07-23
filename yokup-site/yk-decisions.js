/* Relojes de decisión — módulo compartido.
 *   · /misiones  → mount({worker, mode:"summary"}): sólo contador + enlace.
 *   · /decisiones → mount({worker, mode:"full"}): la sección propia de Carlos.
 *     Arriba las VIVAS (con reloj y opciones pulsables) y debajo el HISTÓRICO
 *     (decididas, vencidas y canceladas) con su desenlace y su fecha.
 *   · /equipo    → mount({worker, onData}): el MISMO panel live, junto a las
 *     fichas donde se leen las misiones en curso — un reloj abierto sale donde
 *     ya se mira, no en otra página (Carlos, FLT-985 c2). `onData(decisiones)`
 *     se llama en cada render para que la página pueda marcar a su gente sin
 *     abrir una segunda consulta ni un segundo render.
 * Las tarjetas viven en /decisiones y /equipo; /misiones consume únicamente
 * summary y jamás monta opciones ni relojes.
 *
 * HISTÓRICO REAL desde el worker (FLT-982): GET /decisions?all=1&since=0 devuelve
 * TODAS las decisiones, no solo las vivas y las cerradas de la última hora, y trae
 * `chosen_by` (quién eligió) y `next_until` (cursor hacia atrás). Se acabó el
 * archivo en localStorage que suplía el hueco: era del navegador, no la verdad. */
(function () {
  "use strict";
  var CSS = ".decs{margin:0 0 18px;border:1px solid var(--warn,#ffb545);border-radius:12px;background:rgba(255,181,69,.05);padding:13px 15px}.decs-hd{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--warn,#ffb545);font-weight:700;display:flex;gap:9px;margin-bottom:11px}.decs-n{color:var(--mut)}.decs-list,.dec-opts{display:flex;flex-direction:column;gap:8px}.dec{border:1px solid var(--line2);border-radius:10px;background:var(--card);padding:12px 13px;min-width:0}.dec.urge{border-color:#ff6b6b}.dec-project{display:grid;gap:5px;margin:-1px 0 12px;padding:0 0 11px;border-bottom:1px solid var(--line2)}.dec-project-label{font-family:var(--mono);font-size:9px;line-height:1.3;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:var(--good,#3df08a)}.dec-project-name{margin:0;color:var(--ink);font-size:clamp(16px,2.1vw,20px);line-height:1.2;font-weight:800;overflow-wrap:anywhere}.dec-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}.dec-k,.dec-clock,.dec-done{font-family:var(--mono);font-size:10px}.dec-k{color:var(--mut);border:1px solid var(--line);border-radius:6px;padding:3px 7px}.dec-clock{margin-left:auto;color:var(--warn,#ffb545);font-size:15px;font-weight:700}.dec-q{font-size:13px;line-height:1.4;color:var(--ink);margin-bottom:10px}.dec-opt{display:flex;gap:8px;text-align:left;width:100%;font:inherit;font-size:12px;color:var(--ink);cursor:pointer;background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px 10px}.dec-opt:focus-visible{outline:3px solid var(--ink);outline-offset:2px}.dec-opt.rec{border-color:var(--warn,#ffb545);position:relative;overflow:hidden;--fill:0%}.dec-opt.rec:before{content:'';position:absolute;inset:0 auto 0 0;width:var(--fill);background:rgba(255,181,69,.18);transition:width 1s linear}.dec-opt span{position:relative}.dec-opt .n{font-family:var(--mono);color:var(--mut)}.dec-opt:disabled{cursor:default;opacity:.72}.dec-opt.effective{opacity:1;border-color:var(--good,#3df08a);background:rgba(61,240,138,.09);box-shadow:inset 3px 0 0 var(--good,#3df08a)}.dec-opt.effective.expired{border-color:var(--warn,#ffb545);background:rgba(255,181,69,.08);box-shadow:inset 3px 0 0 var(--warn,#ffb545)}.dec-done{padding-top:8px}.dec-done.ok{color:var(--good,#3df08a)}.dec-done.exp{color:var(--mut)}.dec-batch{margin-top:9px;padding-top:8px;border-top:1px solid var(--line);font-size:11px;color:var(--mut)}.dec-batch b{color:var(--ink)}.dec-batch.paused{color:var(--warn,#ffb545)}@media(max-width:520px){.decs{padding:11px}.dec{padding:11px}.dec-project-name{font-size:16px}.dec-clock{width:100%;margin-left:0}.dec-opt{font-size:13px;padding:10px}}";
  CSS += ".dec-project-rest{font-family:var(--mono);font-size:10px;color:var(--mut)}";
  /* RETRATO del agente en la ficha (FLT-985 a). Fuera el 👷: cada persona de
     silicio tiene cara, y es la misma que enseña /misiones — sale de yk-avatar.js.
     Quien no tenga retrato cae en sus iniciales, no en otro emoji. */
  CSS += ".dec-k.ag{display:inline-flex;align-items:center;gap:5px}"
       + ".dec-k.ag img.decava,.dec-k.ag .decini{width:16px;height:16px;border-radius:4px;flex:0 0 auto}"
       + ".dec-k.ag img.decava{object-fit:cover;object-position:center top;display:block}"
       + ".dec-k.ag .decini{display:inline-grid;place-items:center;font-size:8px;font-weight:700;border:1px solid var(--line)}";
  /* Sección propia (/decisiones): histórico + sello de fecha/autoría + vacíos. */
  CSS += ".decs.hist{border-color:var(--line2);background:transparent}.decs.hist .decs-hd{color:var(--mut)}"
       + ".dec-stamp{font-family:var(--mono);font-size:10px;line-height:1.5;color:var(--dim,#4d7a88);margin-top:8px;padding-top:8px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px 12px}"
       + ".dec-stamp b{color:var(--mut);font-weight:700}"
       + ".decs-empty{font-family:var(--mono);font-size:11px;color:var(--dim,#4d7a88);padding:4px 0}"
       + ".decs-note{font-family:var(--mono);font-size:10px;line-height:1.5;color:var(--dim,#4d7a88);margin-top:11px;padding-top:9px;border-top:1px solid var(--line)}";
  /* Jerarquía de /decisiones: máquina → agente → fichas. */
  CSS += ".dec-machine{border:1px solid var(--line2);border-radius:12px;background:rgba(120,243,255,.025);padding:12px;min-width:0}"
       + ".dec-machine+.dec-machine{margin-top:12px}.dec-machine-h,.dec-agent-h{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}"
       + ".dec-machine-h{padding-bottom:10px;border-bottom:1px solid var(--line)}.dec-machine-h h2,.dec-agent-h h3{margin:0;overflow-wrap:anywhere}"
       + ".dec-machine-h h2{font-size:17px}.dec-agent-h h3{font-size:13px}.dec-group-count{font-family:var(--mono);font-size:10px;color:var(--mut);white-space:nowrap}"
       + ".dec-agent{padding-top:11px}.dec-agent+.dec-agent{margin-top:11px;border-top:1px dashed var(--line)}"
       + ".dec-agent-title{display:inline-flex;align-items:center;gap:7px}.dec-agent-title img,.dec-agent-title .decini{width:22px;height:22px;border-radius:5px}"
       + ".dec-agent-title img{object-fit:cover;object-position:center top}.dec-agent-title .decini{display:inline-grid;place-items:center;border:1px solid var(--line);font-family:var(--mono);font-size:9px}"
       + ".dec-agent-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:9px;margin-top:9px;min-width:0}"
       + ".dec-summary{margin:0 0 16px}.dec-summary a{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line2);border-radius:10px;padding:10px 13px;background:var(--card);color:var(--ink);text-decoration:none;font-family:var(--mono);font-size:11px}"
       + ".dec-summary a:hover,.dec-summary a:focus-visible{border-color:var(--brand);outline:none}.dec-summary strong{color:var(--warn,#ffb545);font-size:15px}"
       + "@media(max-width:520px){.dec-machine{padding:10px}.dec-machine-h,.dec-agent-h{align-items:flex-start;flex-direction:column;gap:5px}.dec-group-count{white-space:normal}.dec-agent-cards{grid-template-columns:minmax(0,1fr)}}";
  /* FICHA PLEGADA (Carlos, 23-jul): lo CERRADO no ocupa pantallas — se pliega a
     una fila con lo esencial (proyecto · desenlace ✓/⏱★/↩ · pie de meta) y abre el
     detalle completo (pregunta, 6 opciones, cola) al pulsar el chevron o la fila.
     Lo VIVO (relojes con cuenta atrás) NO se pliega: manda la información viva. */
  CSS += ".dec-fold{padding:0}.dec-fold>summary{list-style:none;cursor:pointer;display:flex;gap:9px;align-items:flex-start;padding:11px 13px}"
       + ".dec-fold>summary::-webkit-details-marker{display:none}"
       + ".dec-fold>summary:hover{background:rgba(120,243,255,.03)}"
       + ".dec-fold>summary:focus-visible{outline:2px solid var(--brand);outline-offset:-2px}"
       + ".dec-chevron{font-family:var(--mono);color:var(--mut);font-size:14px;line-height:1.3;flex:0 0 auto;transition:transform .18s;margin-top:1px}"
       + ".dec-fold[open]>summary .dec-chevron{transform:rotate(90deg)}"
       + ".dec-sum-main{display:grid;gap:5px;min-width:0;flex:1 1 auto}"
       + ".dec-sum-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}"
       + ".dec-sum-project{color:var(--ink);font-size:14px;font-weight:800;line-height:1.2;overflow-wrap:anywhere}"
       + ".dec-sum-outcome{font-size:12px;line-height:1.35;color:var(--mut);overflow-wrap:anywhere}"
       + ".dec-sum-outcome b{color:var(--ink);font-weight:700}.dec-sum-outcome.ok b{color:var(--good,#3df08a)}.dec-sum-outcome.exp b{color:var(--warn,#ffb545)}"
       + ".dec-fold>summary .dec-stamp{border:0;margin:0;padding:0}"
       + ".dec-fold-body{padding:11px 13px 13px;border-top:1px solid var(--line)}";
  function esc(x) { return String(x == null ? "" : x).replace(/[<>&"]/g, function (c) { return {"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]; }); }
  function cleanProjectName(x) { return String(x || "").replace(/^misi[oó]n\s*:?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 120); }
  function projectSlug(x) { return cleanProjectName(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function legacyBrand(raw) {
    var value = String(raw || "").trim(), host = value.replace(/^https?:\/\//i, "").split(/[\/?#]/)[0].replace(/^www\./i, "").toLowerCase();
    var path = value.replace(/^https?:\/\/[^/]+/i, "").toLowerCase();
    if (host === "admiranext.com" && /\/presentaciones(?:\/|$)/.test(path)) return "Generador de Presentaciones · AdmiraNeXT";
    return "";
  }
  function projectName(d) {
    var explicit = cleanProjectName(d && d.project);
    var slug = String(d && d.project_slug || "").trim().toUpperCase();
    // Un reloj vivo sólo muestra el proyecto que el worker resolvió contra la
    // intersección projects+project_members. Sin slug exacto queda visible el
    // fallo; mission/url/question no pueden rescatarlo.
    if (!d || d.status === "pending") return explicit && slug && projectSlug(explicit) === slug ? explicit : "Sin proyecto exacto";
    if (explicit) return explicit;
    // Compatibilidad de LECTURA para filas cerradas anteriores a FLT-984/986.
    // Nunca alimenta POST ni un nuevo reloj.
    var mission = cleanProjectName(d && d.mission);
    if (/generador de presentaciones/i.test(mission)) return "Generador de Presentaciones · AdmiraNeXT";
    return legacyBrand(d && d.url) || "Sin proyecto";
  }
  function domId(x) { return "dec-project-" + String(x || "item").replace(/[^a-z0-9_-]/gi, "-"); }
  function groupId(prefix, x, i) { return "dec-" + prefix + "-" + String(x || "sin-dato").replace(/[^a-z0-9_-]/gi, "-") + "-" + i; }
  // Retrato del agente: 16px, del módulo compartido. Sin módulo cargado o sin
  // foto, iniciales — nunca un icono genérico.
  function agentePinta(n) {
    var nom = String(n || "").trim();
    if (!nom) return '<span class="dec-k ag">— sin agente</span>';
    var u = "";
    try { u = window.ykAvatar ? window.ykAvatar.img(nom) : ""; } catch (e) { u = ""; }
    var cara = u
      ? '<img class="decava" loading="lazy" alt="" src="' + esc(u) + '" onerror="this.remove()">'
      : '<span class="decini">' + esc(nom.replace(/^(sub|infra)/i, "").slice(0, 2).toUpperCase()) + "</span>";
    return '<span class="dec-k ag">' + cara + esc(nom) + "</span>";
  }
  function mmss(s) { s = Math.max(0, s | 0); return ((s / 60) | 0) + ":" + String(s % 60).padStart(2, "0"); }
  function pct(d) { var total = Math.max(1, Math.round(((d.deadline || 0) - (d.created_at || 0)) / 1000)); return Math.max(0, Math.min(100, Math.round((1 - d.secondsLeft / total) * 100))); }
  // Hora del sello, compacta y local (Carlos: menos es más). Si cayó hoy sólo
  // HH:MM; otro día, DD/MM · HH:MM — la hora importa siempre («a qué hora»).
  function when(ts) {
    var n = +ts || 0; if (!n) return "";
    try {
      var d = new Date(n), now = new Date();
      var hm = d.toLocaleTimeString("es-ES", {hour:"2-digit",minute:"2-digit"});
      var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      if (sameDay) return hm;
      return d.toLocaleDateString("es-ES", {day:"2-digit",month:"2-digit"}) + " · " + hm;
    } catch (e) { return new Date(n).toISOString().slice(0, 16).replace("T", " "); }
  }
  // Sello del histórico: cuándo se abrió, cuándo se cerró y quién eligió.
  // El autor sale de `chosen_by`, que ya devuelve el worker (FLT-982). Las
  // decisiones cerradas antes de guardarlo no lo tienen: sin dato NO se inventa,
  // se dice «autor no registrado».
  function stamp(d) {
    var bits = [];
    if (d.created_at) bits.push("<span>abierta <b>" + esc(when(d.created_at)) + "</b></span>");
    var end = d.decided_at || (d.status === "expired" ? d.deadline : 0);
    if (end) bits.push("<span>" + (d.status === "expired" ? "vencida" : "cerrada") + " <b>" + esc(when(end)) + "</b></span>");
    if (d.status === "decided" || d.status === "cancelled") bits.push("<span>eligió <b>" + esc(d.chosen_by || d.by || "autor no registrado") + "</b></span>");
    else if (d.status === "expired") bits.push("<span>eligió <b>nadie · recomendada automática</b></span>");
    // Quién EJECUTA la misión resultante: el agente en su máquina. Salvo canceladas,
    // que no arrancan nada.
    if (d.status !== "cancelled") {
      var exec = esc(d.agent || "—") + (d.machine ? " · " + esc(d.machine) : "");
      bits.push("<span>ejecuta <b>" + exec + "</b></span>");
    }
    bits.push("<span>" + esc(d.id) + "</span>");
    return bits.length ? "<div class=\"dec-stamp\">" + bits.join("") + "</div>" : "";
  }
  function card(d, opts) {
    var pending = d.status === "pending", rec = +d.recommended || 0, closed = !pending;
    var project = projectName(d), projectId = domId(d.id);
    var remaining = Math.max(0, (d.options || []).length - 1), remainingText = remaining + " " + (remaining === 1 ? "misión restante" : "misiones restantes");
    var effective = d.status === "decided" || d.status === "cancelled" ? +d.chosen : (d.status === "expired" ? rec : -1);
    var optsHtml = (d.options || []).map(function (o, i) {
      var current = closed && i === effective;
      var cls = "dec-opt" + (!closed && i === rec ? " rec" : "") + (current ? " effective" + (d.status === "expired" ? " expired" : "") : "");
      var attrs = closed ? " disabled aria-disabled=\"true\"" + (current ? " aria-current=\"true\"" : "") : " data-dec=\"" + esc(d.id) + "\" data-i=\"" + i + "\"" + (i === rec ? " data-fill=\"" + esc(d.id) + "\" style=\"--fill:" + pct(d) + "%\"" : "");
      var mark = current ? (d.status === "expired" ? "⏱" : "✓") : (!closed && i === rec ? "★" : i + 1);
      return "<button class=\"" + cls + "\"" + attrs + "><span class=\"n\">" + mark + "</span><span>" + esc(o) + "</span></button>";
    }).join("");
    var result = d.status === "decided" ? "<div class=\"dec-done ok\">✓ decisión aplicada: <b>" + esc(d.options[effective] || "") + "</b></div>" : d.status === "expired" ? "<div class=\"dec-done exp\">⏱ sin respuesta — se aplicó la recomendada: <b>" + esc(d.options[effective] || "") + "</b></div>" : d.status === "cancelled" ? "<div class=\"dec-done exp\">" + (d.parent_decision || d.batch_id ? "↩ continuación descartada: se conserva la tanda actual." : "↩ lote descartado: no se iniciará ninguna misión.") + "</div>" : "";
    var batch = d.batch, batchHtml = "";
    if (batch) { var active = (batch.items || []).filter(function (x) { return x.status === "active"; })[0]; var queued = (batch.items || []).filter(function (x) { return x.status === "queued"; }); batchHtml = "<div class=\"dec-batch" + (batch.status === "paused" ? " paused" : "") + "\">" + (batch.status === "paused" ? "⏸ <b>cola pausada</b>: " + esc(batch.pause_reason || "requiere decisión") : batch.status === "completed" ? "✓ <b>tanda completada</b>" : "▶ <b>activa</b>: " + esc(active ? active.title : "preparando") + " · cola: " + queued.map(function (x) { return esc(x.title); }).join(" → ")) + "</div>"; }
    var projectTag = opts && opts.nested ? "h4" : "h3";
    var topRow = "<div class=\"dec-top\"><span class=\"dec-k\">🖥 " + esc(d.machine || "—") + "</span>" + agentePinta(d.agent) + "<span class=\"dec-k\">" + (String(d.surface || "").toUpperCase() === "CLI" ? "⌨ CLI" : "🖥 Desktop App") + "</span>" + (pending ? "<span class=\"dec-clock\" data-clock=\"" + esc(d.id) + "\" role=\"timer\" aria-label=\"Tiempo restante\">" + mmss(d.secondsLeft) + "</span>" : "") + "</div>";
    var body = topRow + "<div class=\"dec-q\">" + esc(d.question) + "</div><div class=\"dec-opts\">" + optsHtml + "</div>" + result + batchHtml;
    var stampHtml = opts && opts.stamp ? stamp(d) : "";
    // VIVO: el reloj y las opciones pulsables NO se pliegan — manda la información viva.
    if (pending) {
      return "<article class=\"dec" + (d.secondsLeft <= 60 ? " urge" : "") + "\" aria-labelledby=\"" + projectId + "\"><header class=\"dec-project\"><span class=\"dec-project-label\">PROYECTO</span><" + projectTag + " class=\"dec-project-name\" id=\"" + projectId + "\">" + esc(project) + "</" + projectTag + "><span class=\"dec-project-rest\">" + remainingText + "</span></header>" + body + stampHtml + "</article>";
    }
    // CERRADA: ficha PLEGADA por defecto. La fila compacta lleva lo esencial
    // (proyecto · la opción que salió · pie de meta); el detalle abre al pulsar.
    var outCls = d.status === "decided" ? "ok" : d.status === "expired" ? "exp" : "cancel";
    var chosenText = esc(d.options && d.options[effective] || "");
    var outcome = d.status === "decided" ? "✓ eligió <b>" + chosenText + "</b>"
      : d.status === "expired" ? "⏱★ recomendada <b>" + chosenText + "</b>"
      : "↩ <b>descartada</b>";
    return "<details class=\"dec dec-fold\" aria-labelledby=\"" + projectId + "\">"
      + "<summary class=\"dec-sum\"><span class=\"dec-chevron\" aria-hidden=\"true\">›</span><div class=\"dec-sum-main\">"
      + "<div class=\"dec-sum-top\"><span class=\"dec-project-label\">PROYECTO</span><span class=\"dec-sum-project\" id=\"" + projectId + "\">" + esc(project) + "</span></div>"
      + "<div class=\"dec-sum-outcome " + outCls + "\">" + outcome + "</div>"
      + stampHtml
      + "</div></summary>"
      + "<div class=\"dec-fold-body\">" + body + "</div>"
      + "</details>";
  }
  function stateCounts(items) {
    var n = {pending:0,decided:0,expired:0,cancelled:0};
    (items || []).forEach(function (d) { if (n[d.status] != null) n[d.status]++; });
    return n;
  }
  function stateText(items) {
    var n = stateCounts(items), bits = [];
    if (n.pending) bits.push(n.pending + " viva" + (n.pending === 1 ? "" : "s"));
    if (n.decided) bits.push(n.decided + " decidida" + (n.decided === 1 ? "" : "s"));
    if (n.expired) bits.push(n.expired + " vencida" + (n.expired === 1 ? "" : "s"));
    if (n.cancelled) bits.push(n.cancelled + " cancelada" + (n.cancelled === 1 ? "" : "s"));
    return bits.join(" · ") || "0 decisiones";
  }
  function compareLabel(a, b) { return String(a || "").localeCompare(String(b || ""), "es", {sensitivity:"base",numeric:true}); }
  function groupDecisions(items) {
    var machines = {};
    (items || []).forEach(function (d) {
      var machine = String(d.machine || "Sin máquina").trim() || "Sin máquina";
      var agent = String(d.agent || "Sin agente").trim() || "Sin agente";
      var mk = machine.toLocaleLowerCase("es"), ak = agent.toLocaleLowerCase("es");
      var mg = machines[mk] || (machines[mk] = {name:machine,agents:{},items:[]});
      var ag = mg.agents[ak] || (mg.agents[ak] = {name:agent,items:[]});
      mg.items.push(d); ag.items.push(d);
    });
    return Object.keys(machines).map(function (key) {
      var machine = machines[key];
      machine.agents = Object.keys(machine.agents).map(function (agentKey) {
        var agent = machine.agents[agentKey];
        agent.items.sort(function (a,b) {
          var at = a.status === "pending" ? (+a.created_at||0) : closedAt(a);
          var bt = b.status === "pending" ? (+b.created_at||0) : closedAt(b);
          return bt-at || compareLabel(a.id,b.id);
        });
        return agent;
      }).sort(function (a,b) { return compareLabel(a.name,b.name); });
      return machine;
    }).sort(function (a,b) { return compareLabel(a.name,b.name); });
  }
  function agentHeading(agent, id) {
    var url = ""; try { url = window.ykAvatar ? window.ykAvatar.img(agent) : ""; } catch (e) {}
    var face = url ? '<img alt="" loading="lazy" src="' + esc(url) + '">' : '<span class="decini">' + esc(String(agent).replace(/^(sub|infra)/i, "").slice(0,2).toUpperCase()) + '</span>';
    return '<h3 class="dec-agent-title" id="' + id + '">' + face + '<span>' + esc(agent) + '</span></h3>';
  }
  function renderGroups(items, opts) {
    var cardOpts = {nested:true,stamp:!!(opts && opts.stamp)};
    return groupDecisions(items).map(function (machine, mi) {
      var mid = groupId("machine", machine.name, mi);
      var agents = machine.agents.map(function (agent, ai) {
        var aid = groupId("agent", machine.name + "-" + agent.name, ai);
        return '<section class="dec-agent" aria-labelledby="' + aid + '"><header class="dec-agent-h">' + agentHeading(agent.name, aid) + '<span class="dec-group-count">' + esc(stateText(agent.items)) + '</span></header><div class="dec-agent-cards">' + agent.items.map(function (d) { return card(d, cardOpts); }).join("") + '</div></section>';
      }).join("");
      return '<section class="dec-machine" aria-labelledby="' + mid + '"><header class="dec-machine-h"><h2 id="' + mid + '">🖥 ' + esc(machine.name) + '</h2><span class="dec-group-count">' + machine.items.length + ' · ' + esc(stateText(machine.items)) + '</span></header>' + agents + '</section>';
    }).join("");
  }
  // ── HISTÓRICO ───────────────────────────────────────────────────────────────
  // Sale entero del worker. Se pide de la más reciente hacia atrás con el cursor
  // `next_until`; PAGE_MAX páginas de 500 acotan la petición para no traerse la
  // base entera de una sentada. Si el cursor sigue vivo al agotarlas, la vista lo
  // dice — nunca se presenta una lista recortada como si fuera completa.
  var PAGE = 500, PAGE_MAX = 4;
  function closedAt(d) { return +d.decided_at || +d.deadline || +d.created_at || 0; }

  function mount(config) {
    config = config || {};
    var full = config.mode === "full", summary = config.mode === "summary";
    var section = summary ? document.getElementById("decSummary") : document.getElementById("decs");
    var list = summary ? null : document.getElementById("decsList");
    if (!section || (!summary && !list)) return;
    if (!document.getElementById("yk-decisions-css")) { var style = document.createElement("style"); style.id = "yk-decisions-css"; style.textContent = CSS; document.head.appendChild(style); }
    var histSec = full ? document.getElementById("decsHist") : null;
    var histList = full ? document.getElementById("decsHistList") : null;
    // sig/histSig arrancan en null (no ""): con cero elementos la firma también es
// "" y el primer render se saltaba, dejando la sección vacía sin su mensaje.
    var api = config.worker.replace(/\/$/, "") + "/decisions", decisions = [], sig = null, histSig = null, truncated = false;
    // FILTRO de los chips (Carlos): null = todas; si no, un estado. Pulsar el chip
    // activo otra vez vuelve a todas. VIVAS actúa sobre la sección de relojes;
    // DECIDIDAS/VENCIDAS/CANCELADAS acotan el histórico a ese estado.
    var filter = null;
    var STATUS_LABEL = {pending:"vivas", decided:"decididas", expired:"vencidas", cancelled:"canceladas"};
    var EMPTY_HIST = {
      decided: "Ninguna decisión decidida todavía.",
      expired: "Ninguna decisión vencida todavía.",
      cancelled: "Ninguna decisión cancelada todavía."
    };

    function counters(live, hist) {
      var n = {pending: live.length, decided: 0, expired: 0, cancelled: 0};
      hist.forEach(function (d) { if (n[d.status] != null) n[d.status]++; });
      Object.keys(n).forEach(function (k) { var el = document.querySelector("[data-dec-count='" + k + "']"); if (el) el.textContent = n[k]; });
    }

    // Vista COMPLETA: vivas arriba, cerradas abajo. Todo del worker.
    function renderFull() {
      var live = decisions.filter(function (d) { return d.status === "pending"; });
      var closed = decisions.filter(function (d) { return d.status !== "pending"; })
        .sort(function (a, b) { return closedAt(b) - closedAt(a); });
      counters(live, closed);
      // Los contadores enseñan SIEMPRE el total real; el filtro sólo recorta las listas.
      var showLive = !filter || filter === "pending";
      var histStatus = (filter && filter !== "pending") ? filter : null;
      var showHist = !filter || !!histStatus;

      section.hidden = !showLive;
      if (showLive) {
        var liveSig = "f:" + filter + "|" + live.map(function (d) { return d.id + ":" + projectName(d) + ":" + JSON.stringify(d.batch || {}); }).join("|");
        if (liveSig !== sig) {
          sig = liveSig;
          document.getElementById("decsN").textContent = live.length ? "· " + live.length + " esperando tu decisión" : "· sin decisiones abiertas";
          list.innerHTML = live.length ? renderGroups(live, null)
            : "<p class=\"decs-empty\">" + (filter === "pending" ? "Ninguna decisión viva ahora mismo." : "Ningún reloj corriendo ahora mismo.") + " Cuando un agente abra una decisión, aparecerá aquí con su cuenta atrás.</p>";
        }
      }
      if (!histSec || !histList) return;
      histSec.hidden = !showHist;
      if (!showHist) return;
      var closedShown = histStatus ? closed.filter(function (d) { return d.status === histStatus; }) : closed;
      var hSig = "f:" + filter + "|" + closedShown.map(function (d) { return d.id + ":" + d.status + ":" + (d.chosen_by || ""); }).join("|") + "|t" + truncated;
      if (hSig === histSig) return;
      histSig = hSig;
      document.getElementById("decsHistN").textContent = histStatus
        ? "· " + closedShown.length + " " + STATUS_LABEL[histStatus] + " (filtrado)"
        : "· " + closedShown.length + (closedShown.length === 1 ? " decisión cerrada" : " decisiones cerradas");
      histList.innerHTML = (closedShown.length ? renderGroups(closedShown, {stamp: true})
        : "<p class=\"decs-empty\">" + (histStatus ? EMPTY_HIST[histStatus] : "Todavía no hay decisiones cerradas.") + "</p>")
        + "<p class=\"decs-note\">Histórico completo del worker: <code>GET /decisions?all=1&amp;since=0</code> devuelve todas las decisiones de la flota, no solo las de la última hora, y con ellas quién eligió. Se ve lo mismo desde cualquier equipo."
        + (truncated ? " Ahora mismo hay más de " + (PAGE * PAGE_MAX) + " y esta lista llega solo hasta ahí: las más antiguas quedan fuera." : "")
        + "</p>";
    }

    // Los 4 chips de estadística son también FILTROS (sólo en /decisiones).
    function paintChips() {
      Array.prototype.forEach.call(document.querySelectorAll("[data-dec-count]"), function (b) {
        var kpi = b.closest(".kpi") || b, on = filter === b.getAttribute("data-dec-count");
        kpi.classList.toggle("active", on);
        kpi.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    function wireChips() {
      Array.prototype.forEach.call(document.querySelectorAll("[data-dec-count]"), function (b) {
        var kpi = b.closest(".kpi") || b, key = b.getAttribute("data-dec-count");
        if (kpi.dataset.decWired) return; kpi.dataset.decWired = "1";
        kpi.setAttribute("role", "button"); kpi.setAttribute("tabindex", "0"); kpi.setAttribute("aria-pressed", "false");
        var label = STATUS_LABEL[key] || key;
        kpi.setAttribute("aria-label", "Filtrar decisiones " + label);
        function toggle() { filter = (filter === key) ? null : key; sig = null; histSig = null; paintChips(); renderFull(); }
        kpi.addEventListener("click", toggle);
        kpi.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); } });
      });
    }

    // /misiones: sólo un recuento enlazado. Esta rama no invoca card() y por
    // contrato no puede introducir opciones ni relojes en esa página.
    function renderSummary() {
      var pending = decisions.filter(function (d) { return d.status === "pending"; }).length;
      if (String(pending) === sig) return;
      sig = String(pending); section.hidden = false;
      var count = document.getElementById("decSummaryCount");
      var label = document.getElementById("decSummaryLabel");
      if (count) count.textContent = pending;
      if (label) label.textContent = pending === 1 ? "decisión viva" : "decisiones vivas";
    }
    // /equipo: conserva el panel operativo compacto de FLT-985. No se usa en
    // /misiones, cuya vista summary no dispone siquiera de lista de tarjetas.
    function renderLive() {
      var pending = decisions.filter(function (d) { return d.status === "pending"; }).length;
      var next = decisions.map(function (d) { return d.id + ":" + d.status + ":" + projectName(d) + ":" + JSON.stringify(d.batch || {}); }).join("|");
      section.hidden = !decisions.length;
      if (!decisions.length || next === sig) return;
      sig = next;
      var count = document.getElementById("decsN");
      if (count) count.textContent = pending ? "· " + pending + " esperando tu decisión" : "· sin decisiones abiertas";
      list.innerHTML = decisions.map(function (d) { return card(d); }).join("");
    }
    function render() {
      var out = full ? renderFull() : (summary ? renderSummary() : renderLive());
      // Un solo módulo pinta las fichas; quien además necesite SABER que hay un
      // reloj corriendo (la ficha de agente de /equipo, FLT-985 c2) se entera por
      // aquí en vez de montar su propia consulta y su propio render.
      if (typeof config.onData === "function") {
        try { config.onData(decisions.slice()); } catch (e) {}
      }
      return out;
    }
    // Vista LIVE: la consulta de siempre (vivas + cerradas recientes).
    // Vista COMPLETA: el histórico entero, paginado con `next_until`.
    async function fetchAll() {
      var out = [], until = null, page = 0;
      while (page < PAGE_MAX) {
        var q = api + "?all=1&since=0&limit=" + PAGE + (until != null ? "&until=" + until : "") + "&_t=" + Date.now();
        var r = await fetch(q, {cache:"no-store"}), d = await r.json();
        out = out.concat(d.items || []);
        page++;
        if (d.next_until == null) { truncated = false; return out; }
        until = d.next_until - 1;
      }
      truncated = true;
      return out;
    }
    async function load() {
      try {
        if (full) { decisions = await fetchAll(); }
        else {
          var query = summary ? "?status=pending&limit=500&_t=" : "?_t=";
          var r = await fetch(api + query + Date.now(), {cache:"no-store"}), d = await r.json();
          decisions = d.items || [];
        }
        render();
      } catch (e) {}
    }
    setInterval(function () { var refresh = false; decisions.forEach(function (d) { if (d.status !== "pending") return; d.secondsLeft = Math.max(0, d.secondsLeft - 1); var clock = document.querySelector("[data-clock='" + d.id + "']"); if (clock) { clock.textContent = mmss(d.secondsLeft); var fill = document.querySelector("[data-fill='" + d.id + "']"); if (fill) fill.style.setProperty("--fill", pct(d) + "%"); } if (!d.secondsLeft) refresh = true; }); if (refresh) load(); }, 1000);
    if (!summary) document.addEventListener("click", async function (e) { var b = e.target.closest(".dec-opt[data-dec]"); if (!b) return; b.closest(".dec-opts").querySelectorAll("button").forEach(function (x) { x.disabled = true; }); try { await fetch(api + "/" + encodeURIComponent(b.dataset.dec) + "/choose", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({choice:+b.dataset.i,by:"Carlos"})}); } finally { load(); } });
    if (full) wireChips();
    load(); setInterval(load, 15000);
  }
  window.YkDecisions = {mount:mount,_test:{card:card,projectName:projectName,stamp:stamp,groupDecisions:groupDecisions,renderGroups:renderGroups,stateText:stateText}};
})();
