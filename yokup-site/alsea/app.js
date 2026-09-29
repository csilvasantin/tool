/* Consola Alsea · yokup.com — datos EJEMPLO, circuito alsea_mexico.
   Estados: idle → abierta → asignada → cerrada. ?paso= fuerza el fotograma. */
(function () {
  var LANG = document.documentElement.lang === "en" ? "en" : "es";
  var SLA_RESP = 15;
  var SLA_RES = 240;
  var POINT = "alsea-mx-sbux-06";
  var TECHS = [
    { id: "ana", es: "Ana Ruiz · campo CDMX", en: "Ana Ruiz · Mexico City field" },
    { id: "luis", es: "Luis Herrera · campo centro", en: "Luis Herrera · central field" },
    { id: "mesa", es: "Mesa Yokup · remoto", en: "Yokup desk · remote" }
  ];

  var T = {
    es: {
      console: "Consola",
      home: "Inicio",
      enlink: "English",
      banner: "EJEMPLO · circuito alsea_mexico · no es producción. La demo de mañana enseña este panel a la izquierda y la Cafebrería a la derecha.",
      style: "Metaestilo Alsea",
      stylep: "Paleta, tipografía y wordmark aplicados a esta consola.",
      sample: "Personas que cuidan cada Xpacio.",
      kComp: "Cumplimiento del circuito",
      kResp: "Respuesta media",
      kRes: "Resolución media",
      kOpen: "Incidencias abiertas",
      slaTitle: "SLAs de los Xpacios",
      slaSub: "Objetivo EJEMPLO: respuesta ≤ 15 min · resolución ≤ 4 h",
      thPoint: "Punto",
      thComp: "Cumplimiento",
      thResp: "Respuesta",
      thRes: "Resolución",
      thSla: "SLA",
      incTitle: "Incidencia",
      idleLead: "Ninguna incidencia de demostración abierta. El punto listo es la pantalla de carta de Starbucks CDMX · Madero.",
      openBtn: "Abrir incidencia",
      assignBtn: "Asignar",
      closeBtn: "Cerrar con evidencia",
      sampleBtn: "Usar foto de ejemplo",
      subject: "Pantalla caída · menú de barra",
      where: "Starbucks CDMX · Madero · Menu board digital",
      circuit: "Circuito alsea_mexico",
      impactIdle: "El SLA del circuito está dentro de objetivo. Abrir la incidencia de ejemplo mueve el reloj de respuesta.",
      impactOpen: "Impacto en el SLA: la respuesta supera 15 min. El cumplimiento de alsea-mx-sbux-06 baja y arrastra la media del circuito.",
      impactAsg: "Asignada. El reloj de resolución sigue. La respuesta ya quedó fuera del objetivo de 15 min.",
      impactDone: "Cerrada con evidencia. Resolución dentro de 4 h. La respuesta quedó fuera de SLA: el cumplimiento del punto no vuelve al 97%.",
      tlOpen: "Incidencia abierta desde el punto. Pantalla de carta sin señal.",
      tlAsg: "Asignada a técnico de campo.",
      tlClose: "Cerrada con evidencia fotográfica. Carta otra vez en emisión.",
      evCap: "Evidencia de cierre · EJEMPLO · carta restaurada",
      mins: "min",
      within: "en SLA",
      respBreach: "respuesta fuera",
      watch: "en reloj",
      ok: "en SLA"
    },
    en: {
      console: "Console",
      home: "Home",
      enlink: "Español",
      banner: "EXAMPLE · circuit alsea_mexico · not production. Tomorrow’s demo keeps this console on the left and the Cafebrería on the right.",
      style: "Alsea metastyle",
      stylep: "Palette, type and wordmark applied to this console.",
      sample: "People who look after every Xpacio.",
      kComp: "Circuit compliance",
      kResp: "Mean response",
      kRes: "Mean resolution",
      kOpen: "Open incidents",
      slaTitle: "Xpacio SLA board",
      slaSub: "EXAMPLE target: response ≤ 15 min · resolution ≤ 4 h",
      thPoint: "Site",
      thComp: "Compliance",
      thResp: "Response",
      thRes: "Resolution",
      thSla: "SLA",
      incTitle: "Incident",
      idleLead: "No demo incident is open. The ready site is the menu board at Starbucks Mexico City · Madero.",
      openBtn: "Open incident",
      assignBtn: "Assign",
      closeBtn: "Close with evidence",
      sampleBtn: "Use example photo",
      subject: "Screen down · bar menu board",
      where: "Starbucks Mexico City · Madero · digital menu board",
      circuit: "Circuit alsea_mexico",
      impactIdle: "Circuit SLA is inside target. Opening the example incident starts the response clock.",
      impactOpen: "SLA impact: response is past 15 min. Compliance at alsea-mx-sbux-06 drops and pulls the circuit average down.",
      impactAsg: "Assigned. The resolution clock keeps running. Response already missed the 15 min target.",
      impactDone: "Closed with evidence. Resolution inside 4 h. Response missed SLA, so the site does not return to 97%.",
      tlOpen: "Incident opened from the site. Menu board has no signal.",
      tlAsg: "Assigned to a field technician.",
      tlClose: "Closed with photo evidence. The menu board is back on air.",
      evCap: "Closure evidence · EXAMPLE · menu board restored",
      mins: "min",
      within: "in SLA",
      respBreach: "response missed",
      watch: "on the clock",
      ok: "in SLA"
    }
  }[LANG];

  var POINTS = [
    { id: "alsea-mx-sbux-01", full: "alsea-mx-sbux-01-tijuana", city: "Tijuana · Plaza Río", comp: 98, resp: 6, res: 42 },
    { id: "alsea-mx-sbux-02", full: "alsea-mx-sbux-02-monterrey", city: "Monterrey · Pabellón M", comp: 96, resp: 8, res: 55 },
    { id: "alsea-mx-sbux-03", full: "alsea-mx-sbux-03-leon", city: "León · Poliforum", comp: 94, resp: 11, res: 70 },
    { id: "alsea-mx-sbux-04", full: "alsea-mx-sbux-04-guadalajara", city: "Guadalajara · Centro", comp: 99, resp: 5, res: 38 },
    { id: "alsea-mx-sbux-05", full: "alsea-mx-sbux-05-queretaro", city: "Querétaro · Constituyentes", comp: 93, resp: 12, res: 88 },
    { id: "alsea-mx-sbux-06", full: "alsea-mx-sbux-06-cdmx", city: "CDMX · Madero", comp: 97, resp: 7, res: 49 },
    { id: "alsea-mx-sbux-07", full: "alsea-mx-sbux-07-puebla", city: "Puebla · Centro", comp: 88, resp: 14, res: 120 },
    { id: "alsea-mx-sbux-08", full: "alsea-mx-sbux-08-oaxaca", city: "Oaxaca · Plaza del Parque", comp: 100, resp: 4, res: 31 },
    { id: "alsea-mx-sbux-09", full: "alsea-mx-sbux-09-merida", city: "Mérida · Paseo de Montejo", comp: 95, resp: 9, res: 64 },
    { id: "alsea-mx-sbux-10", full: "alsea-mx-sbux-10-cancun", city: "Cancún · Puerto Cancún", comp: 96, resp: 8, res: 58 }
  ];

  function loadStep() {
    var q = new URLSearchParams(location.search).get("paso");
    if (q === "abierta" || q === "asignada" || q === "cerrada" || q === "idle") return q;
    try {
      var s = localStorage.getItem("yokup-alsea-demo-paso");
      if (s) return s;
    } catch (e) {}
    return "idle";
  }
  function saveStep(step) {
    if (new URLSearchParams(location.search).get("paso")) return;
    try { localStorage.setItem("yokup-alsea-demo-paso", step); } catch (e) {}
  }

  var state = {
    step: loadStep(),
    tech: "ana",
    photo: ""
  };

  function viewPoints() {
    return POINTS.map(function (p) {
      var row = Object.assign({}, p);
      if (p.id !== POINT) return row;
      if (state.step === "abierta" || state.step === "asignada") {
        row.comp = 89;
        row.resp = 22;
        row.res = null;
        row.flag = "bad";
      } else if (state.step === "cerrada") {
        row.comp = 93;
        row.resp = 18;
        row.res = 86;
        row.flag = "warn";
      }
      return row;
    });
  }

  function avg(rows, key) {
    var vals = rows.map(function (r) { return r[key]; }).filter(function (n) { return typeof n === "number"; });
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }

  function meterClass(comp) {
    if (comp < 90) return "bad";
    if (comp < 95) return "warn";
    return "";
  }

  function slaPill(row) {
    if (row.flag === "bad") return '<span class="pill bad">' + T.respBreach + "</span>";
    if (row.flag === "warn") return '<span class="pill warn">' + T.respBreach + "</span>";
    if (row.resp > SLA_RESP || (row.res && row.res > SLA_RES)) return '<span class="pill warn">' + T.respBreach + "</span>";
    if (row.res == null && row.flag) return '<span class="pill bad">' + T.watch + "</span>";
    return '<span class="pill ok">' + T.ok + "</span>";
  }

  function logo() {
    return '<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="8" fill="#d6ef7a"/><path d="M8 24 L14 10 H18 L24 24 H20.5 L19.2 20.4 H12.8 L11.5 24 Z M13.7 18 H18.3 L16 12.6 Z" fill="#0c3d30"/></svg>';
  }

  function examplePhoto() {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">' +
      '<rect width="640" height="360" fill="#1a2e26"/>' +
      '<rect x="70" y="40" width="500" height="250" rx="8" fill="#0c3d30" stroke="#d6ef7a" stroke-width="4"/>' +
      '<text x="320" y="130" text-anchor="middle" fill="#d6ef7a" font-family="Georgia" font-size="28">MENU BOARD · ON AIR</text>' +
      '<text x="320" y="170" text-anchor="middle" fill="#f4f0e6" font-family="sans-serif" font-size="16">Starbucks CDMX · Madero · EJEMPLO</text>' +
      '<text x="320" y="210" text-anchor="middle" fill="#f4f0e6" font-family="sans-serif" font-size="14">alsea-mx-sbux-06 · carta restaurada</text>' +
      '<rect x="250" y="300" width="140" height="28" rx="14" fill="#d6ef7a"/>' +
      '<text x="320" y="319" text-anchor="middle" fill="#0c3d30" font-family="sans-serif" font-size="12" font-weight="700">EJEMPLO</text>' +
      "</svg>"
    );
  }

  function impactText() {
    if (state.step === "abierta") return T.impactOpen;
    if (state.step === "asignada") return T.impactAsg;
    if (state.step === "cerrada") return T.impactDone;
    return T.impactIdle;
  }

  function timeline() {
    if (state.step === "idle") return "";
    var tech = TECHS.filter(function (t) { return t.id === state.tech; })[0];
    var items = [
      "<li><time>T+0 " + T.mins + "</time>" + T.tlOpen + "</li>"
    ];
    if (state.step === "asignada" || state.step === "cerrada") {
      items.push("<li><time>T+22 " + T.mins + "</time>" + T.tlAsg + " " + tech[LANG] + ".</li>");
    }
    if (state.step === "cerrada") {
      var src = state.photo || examplePhoto();
      items.push("<li><time>T+86 " + T.mins + "</time>" + T.tlClose +
        '<figure class="evidence"><img alt="' + T.evCap + '" src="' + src + '"><figcaption>' + T.evCap + "</figcaption></figure></li>");
    }
    return '<ol class="timeline">' + items.join("") + "</ol>";
  }

  function render() {
    var rows = viewPoints();
    var comp = avg(rows, "comp");
    var resp = avg(rows, "resp");
    var res = avg(rows, "res");
    var openN = (state.step === "abierta" || state.step === "asignada") ? 1 : 0;
    var compClass = comp < 95 ? "risk" : "ok";
    var other = LANG === "es" ? "/en/alsea/" : "/alsea/";
    var home = LANG === "es" ? "/" : "/en/";

    var body =
      '<a class="skip" href="#sla">' + T.slaTitle + "</a>" +
      '<header class="top"><a class="mark" href="' + home + '">' + logo() +
      '<span><strong>ALSEA</strong><span class="yk"> · yokup</span></span></a>' +
      '<span class="badge">EJEMPLO</span>' +
      '<nav><a href="' + home + '">' + T.home + '</a>' +
      '<a class="lang" href="' + other + '">' + (LANG === "es" ? "EN" : "ES") + "</a></nav></header>" +
      '<main class="wrap"><p class="banner">' + T.banner + "</p>" +
      '<section class="style-strip" aria-label="' + T.style + '">' +
      '<div>' + logo() + '<h2>' + T.style + "</h2><p>" + T.stylep + "</p></div>" +
      '<div class="swatches" aria-hidden="true">' +
      '<i class="sw" style="background:#0c3d30" title="#0c3d30"></i>' +
      '<i class="sw" style="background:#1b7a52" title="#1b7a52"></i>' +
      '<i class="sw" style="background:#d6ef7a" title="#d6ef7a"></i>' +
      '<i class="sw" style="background:#f4f0e6" title="#f4f0e6"></i>' +
      '<i class="sw" style="background:#12261f" title="#12261f"></i></div>' +
      '<p class="type-sample">Fraunces + Manrope<em>' + T.sample + "</em></p></section>" +
      '<section class="kpis" aria-label="' + T.kComp + '">' +
      '<article class="kpi ' + compClass + '"><span>' + T.kComp + "</span><strong>" + comp + "%</strong></article>" +
      '<article class="kpi"><span>' + T.kResp + "</span><strong>" + resp + "<small> " + T.mins + "</small></strong></article>" +
      '<article class="kpi"><span>' + T.kRes + "</span><strong>" + res + "<small> " + T.mins + "</small></strong></article>" +
      '<article class="kpi ' + (openN ? "risk" : "ok") + '"><span>' + T.kOpen + "</span><strong>" + openN + "</strong></article></section>" +
      '<div class="layout"><section class="panel" id="sla"><header><h2>' + T.slaTitle + "</h2><small>" + T.slaSub + "</small></header>" +
      "<table><thead><tr><th>" + T.thPoint + "</th><th>" + T.thComp + "</th><th>" + T.thResp + "</th><th>" + T.thRes + "</th><th>" + T.thSla + "</th></tr></thead><tbody>" +
      rows.map(function (r) {
        var resTxt = r.res == null ? "—" : r.res + " " + T.mins;
        return '<tr class="' + (r.id === POINT ? "focus" : "") + '" title="' + r.full + '"><td><span class="id">' + r.id +
          '</span><span class="city">' + r.city + "</span></td><td>" + r.comp + '%<div class="meter ' + meterClass(r.comp) +
          '"><i style="width:' + r.comp + '%"></i></div></td><td>' + r.resp + " " + T.mins + "</td><td>" + resTxt + "</td><td>" + slaPill(r) + "</td></tr>";
      }).join("") +
      "</tbody></table></section>" +
      '<section class="panel incident" id="incidencia"><header><h2>' + T.incTitle + '</h2><small class="badge">EJEMPLO</small></header><div style="padding:14px 16px 16px">' +
      "<h3>" + T.subject + "</h3><p class=\"meta\">" + POINT + " · " + T.where + "<br>" + T.circuit + " · INC-ALSEA-1042</p>" +
      '<p class="impact" id="impacto" role="status">' + impactText() + "</p>" +
      (state.step === "idle" ? '<p class="meta">' + T.idleLead + "</p>" : "") +
      '<div class="actions">' +
      '<button type="button" id="btn-open"' + (state.step === "idle" ? "" : " disabled") + ">" + T.openBtn + "</button>" +
      '<label class="filebtn">' + (LANG === "es" ? "Técnico" : "Technician") +
      ' <select id="tech"' + (state.step === "abierta" ? "" : " disabled") + ">" +
      TECHS.map(function (t) {
        return '<option value="' + t.id + '"' + (t.id === state.tech ? " selected" : "") + ">" + t[LANG] + "</option>";
      }).join("") +
      "</select></label>" +
      '<button type="button" id="btn-assign"' + (state.step === "abierta" ? "" : " disabled") + ">" + T.assignBtn + "</button>" +
      '<button type="button" id="btn-sample"' + (state.step === "asignada" ? "" : " disabled") + ">" + T.sampleBtn + "</button>" +
      '<button type="button" id="btn-close"' + (state.step === "asignada" ? "" : " disabled") + ">" + T.closeBtn + "</button>" +
      "</div>" + timeline() + "</div></section></div></main>";

    document.getElementById("app").innerHTML = body;
    bind();
  }

  function setStep(step) {
    state.step = step;
    saveStep(step);
    if (!new URLSearchParams(location.search).get("paso")) {
      history.replaceState(null, "", location.pathname + "?paso=" + step);
    }
    render();
  }

  function bind() {
    var open = document.getElementById("btn-open");
    var assign = document.getElementById("btn-assign");
    var close = document.getElementById("btn-close");
    var sample = document.getElementById("btn-sample");
    var tech = document.getElementById("tech");
    if (open) open.onclick = function () { setStep("abierta"); };
    if (tech) tech.onchange = function () { state.tech = tech.value; };
    if (assign) assign.onclick = function () {
      if (tech) state.tech = tech.value;
      setStep("asignada");
    };
    if (sample) sample.onclick = function () { state.photo = examplePhoto(); render(); };
    if (close) close.onclick = function () {
      if (!state.photo) state.photo = examplePhoto();
      setStep("cerrada");
    };
  }

  render();
})();
