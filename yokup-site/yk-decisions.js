/* Relojes de decisión: se montan exclusivamente en /misiones. */
(function () {
  "use strict";
  var CSS = ".decs{margin:0 0 18px;border:1px solid var(--warn,#ffb545);border-radius:12px;background:rgba(255,181,69,.05);padding:13px 15px}.decs-hd{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--warn,#ffb545);font-weight:700;display:flex;gap:9px;margin-bottom:11px}.decs-n{color:var(--mut)}.decs-list,.dec-opts{display:flex;flex-direction:column;gap:8px}.dec{border:1px solid var(--line2);border-radius:10px;background:var(--card);padding:12px 13px;min-width:0}.dec.urge{border-color:#ff6b6b}.dec-project{display:grid;gap:5px;margin:-1px 0 12px;padding:0 0 11px;border-bottom:1px solid var(--line2)}.dec-project-label{font-family:var(--mono);font-size:9px;line-height:1.3;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:var(--good,#3df08a)}.dec-project-name{margin:0;color:var(--ink);font-size:clamp(16px,2.1vw,20px);line-height:1.2;font-weight:800;overflow-wrap:anywhere}.dec-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}.dec-k,.dec-clock,.dec-done{font-family:var(--mono);font-size:10px}.dec-k{color:var(--mut);border:1px solid var(--line);border-radius:6px;padding:3px 7px}.dec-clock{margin-left:auto;color:var(--warn,#ffb545);font-size:15px;font-weight:700}.dec-q{font-size:13px;line-height:1.4;color:var(--ink);margin-bottom:10px}.dec-opt{display:flex;gap:8px;text-align:left;width:100%;font:inherit;font-size:12px;color:var(--ink);cursor:pointer;background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px 10px}.dec-opt:focus-visible{outline:3px solid var(--ink);outline-offset:2px}.dec-opt.rec{border-color:var(--warn,#ffb545);position:relative;overflow:hidden;--fill:0%}.dec-opt.rec:before{content:'';position:absolute;inset:0 auto 0 0;width:var(--fill);background:rgba(255,181,69,.18);transition:width 1s linear}.dec-opt span{position:relative}.dec-opt .n{font-family:var(--mono);color:var(--mut)}.dec-opt:disabled{cursor:default;opacity:.72}.dec-opt.effective{opacity:1;border-color:var(--good,#3df08a);background:rgba(61,240,138,.09);box-shadow:inset 3px 0 0 var(--good,#3df08a)}.dec-opt.effective.expired{border-color:var(--warn,#ffb545);background:rgba(255,181,69,.08);box-shadow:inset 3px 0 0 var(--warn,#ffb545)}.dec-done{padding-top:8px}.dec-done.ok{color:var(--good,#3df08a)}.dec-done.exp{color:var(--mut)}.dec-batch{margin-top:9px;padding-top:8px;border-top:1px solid var(--line);font-size:11px;color:var(--mut)}.dec-batch b{color:var(--ink)}.dec-batch.paused{color:var(--warn,#ffb545)}@media(max-width:520px){.decs{padding:11px}.dec{padding:11px}.dec-project-name{font-size:16px}.dec-clock{width:100%;margin-left:0}.dec-opt{font-size:13px;padding:10px}}";
  function esc(x) { return String(x == null ? "" : x).replace(/[<>&"]/g, function (c) { return {"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]; }); }
  function cleanProjectName(x) { return String(x || "").replace(/^misi[oó]n\s*:?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 120); }
  function brandFromUrl(raw) {
    var host = String(raw || "").trim().replace(/^https?:\/\//i, "").split(/[\/?#]/)[0].replace(/^www\./i, "").toLowerCase();
    var path = String(raw || "").trim().replace(/^https?:\/\/[^/]+/i, "").toLowerCase();
    if (!host) return "";
    if (host === "admiranext.com" && /\/presentaciones(?:\/|$)/.test(path)) return "Generador de Presentaciones · AdmiraNeXT";
    var known = {"admiranext.com":"AdmiraNeXT","yokup.com":"Yokup","admira.live":"Admira Live","admira.tv":"Admira TV","xpaceos.com":"XpaceOS","pixeria.pro":"Pixeria"};
    if (known[host]) return known[host];
    var label = host.split(".")[0].replace(/[-_]+/g, " ").trim();
    return label ? label.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : "";
  }
  function projectName(d) {
    var explicit = cleanProjectName(d && d.project);
    if (explicit) return explicit;
    var mission = cleanProjectName(d && d.mission);
    if (/generador de presentaciones/i.test(mission)) return "Generador de Presentaciones · AdmiraNeXT";
    if (mission) return mission;
    return brandFromUrl(d && d.url) || "Proyecto sin identificar";
  }
  function domId(x) { return "dec-project-" + String(x || "item").replace(/[^a-z0-9_-]/gi, "-"); }
  function mmss(s) { s = Math.max(0, s | 0); return ((s / 60) | 0) + ":" + String(s % 60).padStart(2, "0"); }
  function pct(d) { var total = Math.max(1, Math.round(((d.deadline || 0) - (d.created_at || 0)) / 1000)); return Math.max(0, Math.min(100, Math.round((1 - d.secondsLeft / total) * 100))); }
  function card(d) {
    var pending = d.status === "pending", rec = +d.recommended || 0, closed = !pending;
    var project = projectName(d), projectId = domId(d.id);
    var effective = d.status === "decided" || d.status === "cancelled" ? +d.chosen : (d.status === "expired" ? rec : -1);
    var opts = (d.options || []).map(function (o, i) {
      var current = closed && i === effective;
      var cls = "dec-opt" + (!closed && i === rec ? " rec" : "") + (current ? " effective" + (d.status === "expired" ? " expired" : "") : "");
      var attrs = closed ? " disabled aria-disabled=\"true\"" + (current ? " aria-current=\"true\"" : "") : " data-dec=\"" + esc(d.id) + "\" data-i=\"" + i + "\"" + (i === rec ? " data-fill=\"" + esc(d.id) + "\" style=\"--fill:" + pct(d) + "%\"" : "");
      var mark = current ? (d.status === "expired" ? "⏱" : "✓") : (!closed && i === rec ? "★" : i + 1);
      return "<button class=\"" + cls + "\"" + attrs + "><span class=\"n\">" + mark + "</span><span>" + esc(o) + "</span></button>";
    }).join("");
    var result = d.status === "decided" ? "<div class=\"dec-done ok\">✓ decisión aplicada: <b>" + esc(d.options[effective] || "") + "</b></div>" : d.status === "expired" ? "<div class=\"dec-done exp\">⏱ sin respuesta — se aplicó la recomendada: <b>" + esc(d.options[effective] || "") + "</b></div>" : d.status === "cancelled" ? "<div class=\"dec-done exp\">↩ lote descartado: no se iniciará ninguna misión.</div>" : "";
    var batch = d.batch, batchHtml = "";
    if (batch) { var active = (batch.items || []).filter(function (x) { return x.status === "active"; })[0]; var queued = (batch.items || []).filter(function (x) { return x.status === "queued"; }); batchHtml = "<div class=\"dec-batch" + (batch.status === "paused" ? " paused" : "") + "\">" + (batch.status === "paused" ? "⏸ <b>cola pausada</b>: " + esc(batch.pause_reason || "requiere decisión") : batch.status === "completed" ? "✓ <b>tanda completada</b>" : "▶ <b>activa</b>: " + esc(active ? active.title : "preparando") + " · cola: " + queued.map(function (x) { return esc(x.title); }).join(" → ")) + "</div>"; }
    return "<article class=\"dec" + (pending && d.secondsLeft <= 60 ? " urge" : "") + "\" aria-labelledby=\"" + projectId + "\"><header class=\"dec-project\"><span class=\"dec-project-label\">PROYECTO PRINCIPAL</span><h3 class=\"dec-project-name\" id=\"" + projectId + "\">" + esc(project) + "</h3></header><div class=\"dec-top\"><span class=\"dec-k\">🖥 " + esc(d.machine || "—") + "</span><span class=\"dec-k\">👷 " + esc(d.agent || "—") + "</span><span class=\"dec-k\">" + (String(d.surface || "").toUpperCase() === "CLI" ? "⌨ CLI" : "🖥 Desktop App") + "</span>" + (pending ? "<span class=\"dec-clock\" data-clock=\"" + esc(d.id) + "\" role=\"timer\" aria-label=\"Tiempo restante\">" + mmss(d.secondsLeft) + "</span>" : "") + "</div><div class=\"dec-q\">" + esc(d.question) + "</div><div class=\"dec-opts\">" + opts + "</div>" + result + batchHtml + "</article>";
  }
  function mount(config) {
    var section = document.getElementById("decs"), list = document.getElementById("decsList"); if (!section || !list) return;
    if (!document.getElementById("yk-decisions-css")) { var style = document.createElement("style"); style.id = "yk-decisions-css"; style.textContent = CSS; document.head.appendChild(style); }
    var api = config.worker.replace(/\/$/, "") + "/decisions", decisions = [], sig = "";
    function render() { var pending = decisions.filter(function (d) { return d.status === "pending"; }).length, next = decisions.map(function (d) { return d.id + ":" + d.status + ":" + projectName(d) + ":" + JSON.stringify(d.batch || {}); }).join("|"); section.hidden = !decisions.length; if (!decisions.length || next === sig) return; sig = next; document.getElementById("decsN").textContent = pending ? "· " + pending + " esperando tu decisión" : "· sin decisiones abiertas"; list.innerHTML = decisions.map(card).join(""); }
    async function load() { try { var r = await fetch(api + "?_t=" + Date.now(), {cache:"no-store"}), d = await r.json(); decisions = d.items || []; render(); } catch (e) {} }
    setInterval(function () { var refresh = false; decisions.forEach(function (d) { if (d.status !== "pending") return; d.secondsLeft = Math.max(0, d.secondsLeft - 1); var clock = document.querySelector("[data-clock='" + d.id + "']"); if (clock) { clock.textContent = mmss(d.secondsLeft); var fill = document.querySelector("[data-fill='" + d.id + "']"); if (fill) fill.style.setProperty("--fill", pct(d) + "%"); } if (!d.secondsLeft) refresh = true; }); if (refresh) load(); }, 1000);
    document.addEventListener("click", async function (e) { var b = e.target.closest(".dec-opt[data-dec]"); if (!b) return; b.closest(".dec-opts").querySelectorAll("button").forEach(function (x) { x.disabled = true; }); try { await fetch(api + "/" + encodeURIComponent(b.dataset.dec) + "/choose", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({choice:+b.dataset.i,by:"Carlos"})}); } finally { load(); } });
    load(); setInterval(load, 15000);
  }
  window.YkDecisions = {mount:mount,_test:{card:card,projectName:projectName}};
})();
