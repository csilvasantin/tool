/* Relojes de decisión — módulo compartido.
 *   · /misiones  → mount({worker}) o mode:"live": el panel de siempre (vivas +
 *     las recién cerradas que devuelve el worker). Comportamiento intacto.
 *   · /decisiones → mount({worker, mode:"full"}): la sección propia de Carlos.
 *     Arriba las VIVAS (con reloj y opciones pulsables) y debajo el HISTÓRICO
 *     (decididas, vencidas y canceladas) con su desenlace y su fecha.
 * MISMO render de tarjeta en las dos vistas: card() es la única fuente.
 *
 * HISTÓRICO REAL desde el worker (FLT-982): GET /decisions?all=1&since=0 devuelve
 * TODAS las decisiones, no solo las vivas y las cerradas de la última hora, y trae
 * `chosen_by` (quién eligió) y `next_until` (cursor hacia atrás). Se acabó el
 * archivo en localStorage que suplía el hueco: era del navegador, no la verdad. */
(function () {
  "use strict";
  var CSS = ".decs{margin:0 0 18px;border:1px solid var(--warn,#ffb545);border-radius:12px;background:rgba(255,181,69,.05);padding:13px 15px}.decs-hd{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--warn,#ffb545);font-weight:700;display:flex;gap:9px;margin-bottom:11px}.decs-n{color:var(--mut)}.decs-list,.dec-opts{display:flex;flex-direction:column;gap:8px}.dec{border:1px solid var(--line2);border-radius:10px;background:var(--card);padding:12px 13px;min-width:0}.dec.urge{border-color:#ff6b6b}.dec-project{display:grid;gap:5px;margin:-1px 0 12px;padding:0 0 11px;border-bottom:1px solid var(--line2)}.dec-project-label{font-family:var(--mono);font-size:9px;line-height:1.3;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:var(--good,#3df08a)}.dec-project-name{margin:0;color:var(--ink);font-size:clamp(16px,2.1vw,20px);line-height:1.2;font-weight:800;overflow-wrap:anywhere}.dec-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}.dec-k,.dec-clock,.dec-done{font-family:var(--mono);font-size:10px}.dec-k{color:var(--mut);border:1px solid var(--line);border-radius:6px;padding:3px 7px}.dec-clock{margin-left:auto;color:var(--warn,#ffb545);font-size:15px;font-weight:700}.dec-q{font-size:13px;line-height:1.4;color:var(--ink);margin-bottom:10px}.dec-opt{display:flex;gap:8px;text-align:left;width:100%;font:inherit;font-size:12px;color:var(--ink);cursor:pointer;background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px 10px}.dec-opt:focus-visible{outline:3px solid var(--ink);outline-offset:2px}.dec-opt.rec{border-color:var(--warn,#ffb545);position:relative;overflow:hidden;--fill:0%}.dec-opt.rec:before{content:'';position:absolute;inset:0 auto 0 0;width:var(--fill);background:rgba(255,181,69,.18);transition:width 1s linear}.dec-opt span{position:relative}.dec-opt .n{font-family:var(--mono);color:var(--mut)}.dec-opt:disabled{cursor:default;opacity:.72}.dec-opt.effective{opacity:1;border-color:var(--good,#3df08a);background:rgba(61,240,138,.09);box-shadow:inset 3px 0 0 var(--good,#3df08a)}.dec-opt.effective.expired{border-color:var(--warn,#ffb545);background:rgba(255,181,69,.08);box-shadow:inset 3px 0 0 var(--warn,#ffb545)}.dec-done{padding-top:8px}.dec-done.ok{color:var(--good,#3df08a)}.dec-done.exp{color:var(--mut)}.dec-batch{margin-top:9px;padding-top:8px;border-top:1px solid var(--line);font-size:11px;color:var(--mut)}.dec-batch b{color:var(--ink)}.dec-batch.paused{color:var(--warn,#ffb545)}@media(max-width:520px){.decs{padding:11px}.dec{padding:11px}.dec-project-name{font-size:16px}.dec-clock{width:100%;margin-left:0}.dec-opt{font-size:13px;padding:10px}}";
  CSS += ".dec-project-rest{font-family:var(--mono);font-size:10px;color:var(--mut)}";
  /* Sección propia (/decisiones): histórico + sello de fecha/autoría + vacíos. */
  CSS += ".decs.hist{border-color:var(--line2);background:transparent}.decs.hist .decs-hd{color:var(--mut)}"
       + ".dec-stamp{font-family:var(--mono);font-size:10px;line-height:1.5;color:var(--dim,#4d7a88);margin-top:8px;padding-top:8px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px 12px}"
       + ".dec-stamp b{color:var(--mut);font-weight:700}"
       + ".decs-empty{font-family:var(--mono);font-size:11px;color:var(--dim,#4d7a88);padding:4px 0}"
       + ".decs-note{font-family:var(--mono);font-size:10px;line-height:1.5;color:var(--dim,#4d7a88);margin-top:11px;padding-top:9px;border-top:1px solid var(--line)}";
  function esc(x) { return String(x == null ? "" : x).replace(/[<>&"]/g, function (c) { return {"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]; }); }
  function cleanProjectName(x) { return String(x || "").replace(/^misi[oó]n\s*:?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 120); }
  // El proyecto lo resuelve el WORKER contra el censo (/projects) y llega ya con
  // su nombre humano. Si no hay, la ficha dice «Sin proyecto» y se calla: NO se
  // adivina de ningún otro campo.
  // Historia de los dos apaños, los dos fuera (FLT-984 a·b y c):
  //  · se colaba el TÍTULO DE LA MISIÓN como si fuera el proyecto, y de postre un
  //    «Proyecto sin identificar» — la queja literal de Carlos;
  //  · y quedaba un adivinador por DOMINIO de la url (yokup.com → «Yokup»,
  //    admiranext.com/presentaciones → «Generador de Presentaciones · AdmiraNeXT»)
  //    que seguía poniendo en la ficha un proyecto que nadie había dado de alta.
  // Un hueco visible es lo que empuja a asignar el proyecto de verdad en /equipo;
  // una etiqueta inventada lo esconde.
  function projectName(d) {
    var explicit = cleanProjectName(d && d.project);
    return explicit || "Sin proyecto";
  }
  function domId(x) { return "dec-project-" + String(x || "item").replace(/[^a-z0-9_-]/gi, "-"); }
  function mmss(s) { s = Math.max(0, s | 0); return ((s / 60) | 0) + ":" + String(s % 60).padStart(2, "0"); }
  function pct(d) { var total = Math.max(1, Math.round(((d.deadline || 0) - (d.created_at || 0)) / 1000)); return Math.max(0, Math.min(100, Math.round((1 - d.secondsLeft / total) * 100))); }
  // Fecha legible del sello del histórico.
  function when(ts) {
    var n = +ts || 0; if (!n) return "";
    try { return new Date(n).toLocaleString("es-ES", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
    catch (e) { return new Date(n).toISOString().slice(0, 16).replace("T", " "); }
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
    return "<article class=\"dec" + (pending && d.secondsLeft <= 60 ? " urge" : "") + "\" aria-labelledby=\"" + projectId + "\"><header class=\"dec-project\"><span class=\"dec-project-label\">PROYECTO</span><h3 class=\"dec-project-name\" id=\"" + projectId + "\">" + esc(project) + "</h3><span class=\"dec-project-rest\">" + remainingText + "</span></header><div class=\"dec-top\"><span class=\"dec-k\">🖥 " + esc(d.machine || "—") + "</span><span class=\"dec-k\">👷 " + esc(d.agent || "—") + "</span><span class=\"dec-k\">" + (String(d.surface || "").toUpperCase() === "CLI" ? "⌨ CLI" : "🖥 Desktop App") + "</span>" + (pending ? "<span class=\"dec-clock\" data-clock=\"" + esc(d.id) + "\" role=\"timer\" aria-label=\"Tiempo restante\">" + mmss(d.secondsLeft) + "</span>" : "") + "</div><div class=\"dec-q\">" + esc(d.question) + "</div><div class=\"dec-opts\">" + optsHtml + "</div>" + result + batchHtml + (opts && opts.stamp ? stamp(d) : "") + "</article>";
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
    var full = config.mode === "full";
    var section = document.getElementById("decs"), list = document.getElementById("decsList"); if (!section || !list) return;
    if (!document.getElementById("yk-decisions-css")) { var style = document.createElement("style"); style.id = "yk-decisions-css"; style.textContent = CSS; document.head.appendChild(style); }
    var histSec = full ? document.getElementById("decsHist") : null;
    var histList = full ? document.getElementById("decsHistList") : null;
    // sig/histSig arrancan en null (no ""): con cero elementos la firma también es
// "" y el primer render se saltaba, dejando la sección vacía sin su mensaje.
    var api = config.worker.replace(/\/$/, "") + "/decisions", decisions = [], sig = null, histSig = null, truncated = false;

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
      section.hidden = false;
      var liveSig = live.map(function (d) { return d.id + ":" + projectName(d) + ":" + JSON.stringify(d.batch || {}); }).join("|");
      if (liveSig !== sig) {
        sig = liveSig;
        document.getElementById("decsN").textContent = live.length ? "· " + live.length + " esperando tu decisión" : "· sin decisiones abiertas";
        list.innerHTML = live.length ? live.map(function (d) { return card(d, null); }).join("")
          : "<p class=\"decs-empty\">Ningún reloj corriendo ahora mismo. Cuando un agente abra una decisión, aparecerá aquí con su cuenta atrás.</p>";
      }
      if (!histSec || !histList) return;
      var hSig = closed.map(function (d) { return d.id + ":" + d.status + ":" + (d.chosen_by || ""); }).join("|") + "|t" + truncated;
      if (hSig === histSig) return;
      histSig = hSig;
      document.getElementById("decsHistN").textContent = "· " + closed.length + (closed.length === 1 ? " decisión cerrada" : " decisiones cerradas");
      histList.innerHTML = (closed.length ? closed.map(function (d) { return card(d, {stamp: true}); }).join("")
        : "<p class=\"decs-empty\">Todavía no hay decisiones cerradas.</p>")
        + "<p class=\"decs-note\">Histórico completo del worker: <code>GET /decisions?all=1&amp;since=0</code> devuelve todas las decisiones de la flota, no solo las de la última hora, y con ellas quién eligió. Se ve lo mismo desde cualquier equipo."
        + (truncated ? " Ahora mismo hay más de " + (PAGE * PAGE_MAX) + " y esta lista llega solo hasta ahí: las más antiguas quedan fuera." : "")
        + "</p>";
    }

    // Vista LIVE (/misiones): exactamente el panel de siempre.
    function renderLive() {
      var pending = decisions.filter(function (d) { return d.status === "pending"; }).length;
      var next = decisions.map(function (d) { return d.id + ":" + d.status + ":" + projectName(d) + ":" + JSON.stringify(d.batch || {}); }).join("|");
      section.hidden = !decisions.length;
      if (!decisions.length || next === sig) return;
      sig = next;
      document.getElementById("decsN").textContent = pending ? "· " + pending + " esperando tu decisión" : "· sin decisiones abiertas";
      list.innerHTML = decisions.map(function (d) { return card(d, null); }).join("");
    }
    function render() { return full ? renderFull() : renderLive(); }
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
        else { var r = await fetch(api + "?_t=" + Date.now(), {cache:"no-store"}), d = await r.json(); decisions = d.items || []; }
        render();
      } catch (e) {}
    }
    setInterval(function () { var refresh = false; decisions.forEach(function (d) { if (d.status !== "pending") return; d.secondsLeft = Math.max(0, d.secondsLeft - 1); var clock = document.querySelector("[data-clock='" + d.id + "']"); if (clock) { clock.textContent = mmss(d.secondsLeft); var fill = document.querySelector("[data-fill='" + d.id + "']"); if (fill) fill.style.setProperty("--fill", pct(d) + "%"); } if (!d.secondsLeft) refresh = true; }); if (refresh) load(); }, 1000);
    document.addEventListener("click", async function (e) { var b = e.target.closest(".dec-opt[data-dec]"); if (!b) return; b.closest(".dec-opts").querySelectorAll("button").forEach(function (x) { x.disabled = true; }); try { await fetch(api + "/" + encodeURIComponent(b.dataset.dec) + "/choose", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({choice:+b.dataset.i,by:"Carlos"})}); } finally { load(); } });
    load(); setInterval(load, 15000);
  }
  window.YkDecisions = {mount:mount,_test:{card:card,projectName:projectName,stamp:stamp}};
})();
