/* Yokup · acceso.js — DMZ del helpdesk. Solo entra gente logueada (Google) y autorizada.
 * - Oculta la página hasta validar (verja con el look del Portal del comercio).
 * - Login con Google (Google Identity Services), mismo Client ID que la flota Admira.
 * - El worker valida Google + whitelist y fija una sesión HttpOnly; ningún token
 *   queda en URL, JSON, logs ni almacenamiento accesible a JavaScript.
 * - Parchea window.fetch para enviar esa cookie sólo a los dos orígenes Yokup.
 * Instalar lo más arriba del <head>:  <script src="/acceso.js"></script>
 */
(function () {
  var CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
  var WORKER = "https://api.yokup.com";
  var LOGIN_URI = "https://www.yokup.com/auth/callback";
  // Red de seguridad: rtc.yokup.com es el FALLBACK que usa yk-frame.js/ykFetch
  // cuando api.yokup.com falla por red. (28-jul-2026: antes apuntaba al host
  // workers.dev, que devolvía 404 y encima está bloqueado por ISPs españoles.)
  // Debe ser FIRMABLE también: si el fallback no llevara el mismo Bearer, daría
  // 401 y dejaría el tablero a oscuras. Solo se AÑADE este host — api.yokup.com y
  // los terceros se comportan EXACTAMENTE igual que antes.
  var WORKER_FALLBACK = "https://rtc.yokup.com";
  var SKEY = "yk_session";
  var rawFetch = window.fetch.bind(window);

  // ¿La URL apunta al worker Yokup (dominio propio o fallback)? Solo estos hosts
  // reciben el Bearer de sesión y el manejo de 401. Prefijo ANCLADO al ORIGEN: tras
  // el host debe venir un límite real (/, ?, # o fin) para que api.yokup.com.evil
  // NO cuele como firmable y filtre el token a un dominio ajeno.
  function isWorkerOrigin(u, host) {
    if (u.indexOf(host) !== 0) return false;
    var c = u.charAt(host.length);
    return c === "" || c === "/" || c === "?" || c === "#";
  }
  function signable(u) {
    return isWorkerOrigin(u, WORKER) || isWorkerOrigin(u, WORKER_FALLBACK);
  }

  // Ocultar el contenido de inmediato.
  document.documentElement.classList.add("yk-locked");
  // Verja con el look & feel del Portal del comercio (FLT-101292): fondo papel,
  // marca «yokup●», eyebrow con punto verde, título con segunda línea verde y
  // tarjeta blanca. TODO cuelga de #yk-gate (clase raíz única): no toca nada de la
  // página que protege, y un reset propio evita que sus estilos se cuelen dentro (salvo en el botón
  // de Google, que GIS pinta con sus propias clases).
  var st = document.createElement("style");
  st.textContent =
    "html.yk-locked body{visibility:hidden!important}" +
    "#yk-gate{--g-ink:#173632;--g-muted:#667a75;--g-paper:#f6f8f3;--g-line:#dbe3d9;--g-soft:#eaf0df;--g-soft-line:#d7e2c8;--g-dark:#133d32;--g-red:#ac3838;--g-accent:#67935c;--g-live:#7aab49;" +
      "position:fixed;inset:0;z-index:2147483647;visibility:visible;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;" +
      "background:var(--g-paper);color:var(--g-ink);font:15px/1.5 'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color-scheme:light;text-align:left}" +
    "#yk-gate :where(*:not(#yk-gbtn,#yk-gbtn *)){box-sizing:border-box;margin:0;padding:0;border:0;background:none;box-shadow:none;text-shadow:none;text-transform:none;letter-spacing:normal;font:inherit;color:inherit;text-align:inherit}" +
    "#yk-gate .ykg-top{flex:0 0 auto;height:88px;display:flex;align-items:center;padding:0 5%;border-bottom:1px solid var(--g-line)}" +
    "#yk-gate .ykg-brand{font:800 35px/1 Manrope,'DM Sans',sans-serif;letter-spacing:-2px;color:var(--g-ink)}" +
    "#yk-gate .ykg-brand span{color:#84ae44;font-size:16px;padding-left:3px;letter-spacing:0}" +
    "#yk-gate .ykg-main{flex:1 0 auto;width:100%;max-width:1400px;margin:0 auto;padding:66px 5% 56px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,440px);gap:7%;align-items:center}" +
    "#yk-gate .ykg-eyebrow{display:flex;align-items:center;gap:9px;font-size:10px;letter-spacing:1.8px;font-weight:700;color:var(--g-ink)}" +
    "#yk-gate .ykg-dot{display:inline-block;flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--g-live)}" +
    "#yk-gate .ykg-title{display:block;font:600 clamp(40px,5vw,72px)/1.06 Manrope,'DM Sans',sans-serif;letter-spacing:-3px;margin:25px 0 24px;color:var(--g-ink)}" +
    "#yk-gate .ykg-title em{display:block;font-style:normal;color:var(--g-accent)}" +
    "#yk-gate .ykg-lede{max-width:460px;font-size:16px;line-height:1.75;color:var(--g-muted)}" +
    "#yk-gate .ykg-card{background:#fff;border:1px solid var(--g-line);border-radius:16px;padding:26px;box-shadow:0 12px 40px #153b3010;min-width:0}" +
    "#yk-gate .ykg-card-eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:700;color:#4f6e4c;margin-bottom:10px}" +
    "#yk-gate .ykg-card-title{display:block;font:700 25px/1.2 Manrope,'DM Sans',sans-serif;letter-spacing:-.7px;color:var(--g-ink)}" +
    "#yk-gate .ykg-card-text{margin-top:8px;font-size:14px;line-height:1.6;color:var(--g-muted)}" +
    "#yk-gate .btnwrap{display:flex;justify-content:center;align-items:center;min-height:44px;margin-top:22px;padding:20px 0;border-top:1px solid var(--g-line);border-bottom:1px solid var(--g-line)}" +
    "#yk-gate .ykg-wait{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px;font-size:13px;color:var(--g-muted)}" +
    "#yk-gate .ykg-wait[hidden]{display:none}" +
    "#yk-gate .ykg-spin{flex:0 0 auto;width:14px;height:14px;border-radius:50%;border:2px solid var(--g-line);border-top-color:var(--g-accent);animation:ykg-spin .9s linear infinite}" +
    "@keyframes ykg-spin{to{transform:rotate(360deg)}}" +
    "@media (prefers-reduced-motion:reduce){#yk-gate .ykg-spin{animation:none}}" +
    "#yk-gate .err{font-size:13px;line-height:1.5;color:var(--g-red);margin-top:14px;min-height:0;text-align:center}" +
    "#yk-gate .err:empty{display:none}" +
    "#yk-gate .ykg-note{margin-top:16px;padding:12px 14px;border-radius:10px;background:var(--g-soft);border:1px solid var(--g-soft-line);font-size:12.5px;line-height:1.55;color:#4f6e4c}" +
    "#yk-gate .foot{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center;justify-content:space-between;padding:22px 5%;border-top:1px solid var(--g-line);font-size:12px;color:var(--g-muted)}" +
    "#yk-gate .foot b{font:800 18px/1 Manrope,'DM Sans',sans-serif;letter-spacing:-1px;color:var(--g-ink)}" +
    "#yk-gate .foot b span{color:#84ae44;font-size:10px;padding-left:2px}" +
    "@media (max-width:860px){#yk-gate .ykg-main{grid-template-columns:1fr;gap:30px;padding:40px 5% 44px;align-items:start}#yk-gate .ykg-lede{max-width:none}}" +
    "@media (max-width:520px){#yk-gate .ykg-top{height:64px;padding:0 16px}#yk-gate .ykg-brand{font-size:28px}" +
      "#yk-gate .ykg-main{padding:28px 16px 32px;gap:24px}#yk-gate .ykg-title{font-size:38px;letter-spacing:-1.6px;margin:16px 0 14px}" +
      "#yk-gate .ykg-lede{font-size:15px;line-height:1.65}#yk-gate .ykg-card{padding:20px 18px}#yk-gate .ykg-card-title{font-size:22px}#yk-gate .foot{padding:18px 16px}}";
  (document.head || document.documentElement).appendChild(st);

  // Fontanería de sesión: espera al login y sólo envía la cookie HttpOnly al API.
  var accessSession = null;
  var resolveReady; var sessionReady = new Promise(function (r) { resolveReady = r; });
  // Capacidades firmadas por el backend, sólo en memoria. El email guardado para
  // mostrar la sesión nunca decide permisos ni proyectos.
  window.YkAccess = {
    ready:sessionReady,
    get:function () { return accessSession; }
  };
  window.fetch = function (input, init) {
    var u = typeof input === "string" ? input : (input && input.url) || "";
    if (!signable(u)) return rawFetch(input, init);
    return sessionReady.then(function () {
      init = init || {};
      init.credentials = "include";
      return rawFetch(u, init).then(function (res) {
        if (res.status === 401) location.reload();
        return res;
      });
    });
  };

  function reveal() { document.documentElement.classList.remove("yk-locked"); var g = document.getElementById("yk-gate"); if (g) g.remove(); }

  // Nodo con texto plano (textContent): la verja no interpreta HTML.
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function brandNode(tag, cls) {
    var b = el(tag, cls, "yokup"), dot = el("span", "", "\u25cf");
    dot.setAttribute("aria-hidden", "true");
    b.appendChild(dot);
    return b;
  }
  // Mensaje de error/carga de la verja: el error sustituye al «Preparando…».
  function gateMsg(text) {
    var w = document.querySelector("#yk-gate .ykg-wait"); if (w) w.hidden = true;
    var er = document.querySelector("#yk-gate .err"); if (er) er.textContent = text;
  }

  function showGate() {
    var mk = function () {
      if (document.getElementById("yk-gate")) return;
      // Tipografía del portal sólo cuando hace falta pintar la verja.
      var fonts = document.createElement("link");
      fonts.rel = "stylesheet";
      fonts.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap";
      (document.head || document.documentElement).appendChild(fonts);

      var g = el("div"); g.id = "yk-gate";
      g.setAttribute("role", "dialog"); g.setAttribute("aria-modal", "true"); g.setAttribute("aria-labelledby", "ykg-title");

      var top = el("header", "ykg-top"); top.appendChild(brandNode("div", "ykg-brand")); g.appendChild(top);

      var main = el("main", "ykg-main");
      var intro = el("section", "ykg-intro");
      var eb = el("p", "ykg-eyebrow"); eb.appendChild(el("span", "ykg-dot")); eb.appendChild(el("span", "", "ACCESO RESTRINGIDO \u00b7 FLOTA ADMIRA"));
      intro.appendChild(eb);
      var h = el("h1", "ykg-title", "Entra en Yokup."); h.id = "ykg-title"; h.appendChild(el("em", "", "Tu equipo, conectado."));
      intro.appendChild(h);
      intro.appendChild(el("p", "ykg-lede", "Misiones, tareas e incidencias de la flota Admira en un mismo lugar. Identif\u00edcate con tu cuenta autorizada para continuar."));
      main.appendChild(intro);

      var card = el("section", "ykg-card"); card.setAttribute("aria-label", "Identificaci\u00f3n");
      card.appendChild(el("p", "ykg-card-eyebrow", "ZONA DE SOPORTE"));
      card.appendChild(el("h2", "ykg-card-title", "Identif\u00edcate"));
      card.appendChild(el("p", "ykg-card-text", "Entra con tu cuenta de Google. Solo pasan las cuentas autorizadas del equipo."));
      var wrap = el("div", "btnwrap"); var gbtn = el("div"); gbtn.id = "yk-gbtn"; wrap.appendChild(gbtn); card.appendChild(wrap);
      var wait = el("p", "ykg-wait"); wait.setAttribute("role", "status"); wait.appendChild(el("span", "ykg-spin")); wait.appendChild(el("span", "", "Preparando el acceso seguro\u2026"));
      card.appendChild(wait);
      var err = el("p", "err"); err.setAttribute("role", "alert"); card.appendChild(err);
      card.appendChild(el("p", "ykg-note", "La sesi\u00f3n se guarda de forma segura en este navegador. Si no puedes entrar, pide acceso al responsable de tu proyecto."));
      main.appendChild(card);
      g.appendChild(main);

      var foot = el("footer", "foot"); foot.appendChild(brandNode("b", "")); foot.appendChild(el("span", "", "Per\u00edmetro de seguridad \u00b7 Tu equipo, conectado."));
      g.appendChild(foot);

      document.body.appendChild(g);
      loadGIS();
    };
    if (document.body) mk(); else document.addEventListener("DOMContentLoaded", mk);
  }

  function loadGIS() {
    var go = function () {
      var returnTo = location.pathname + location.search + location.hash;
      rawFetch("/auth/challenge", { method:"POST", credentials:"include", headers:{"content-type":"application/json"}, body:JSON.stringify({flow:"redirect",return_to:returnTo}) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("challenge")); })
      .then(function (challenge) {
      try {
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          nonce: challenge.nonce,
          state_cookie_domain: "yokup.com",
          ux_mode: "redirect",
          login_uri: LOGIN_URI,
          auto_select: false,
          cancel_on_tap_outside: false,
          // Navegación top-level: el IAB no permite popup ni FedCM.
          use_fedcm_for_button: false
        });
        google.accounts.id.renderButton(document.getElementById("yk-gbtn"), { theme: "outline", size: "large", text: "signin_with", shape: "rectangular", logo_alignment: "left", width: 280, state:challenge.state });
        var w = document.querySelector("#yk-gate .ykg-wait"); if (w) w.hidden = true;
      } catch (e) { gateMsg("No se pudo cargar el login de Google."); }
      }).catch(function () { gateMsg("No se pudo iniciar el acceso seguro. Usa la página completa."); });
    };
    if (window.google && google.accounts && google.accounts.id) return go();
    var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true; s.onload = go;
    s.onerror = function () { gateMsg("No se pudo cargar el login de Google."); };
    document.head.appendChild(s);
  }

  // Migra una sesión bearer antigua una sola vez y elimina el token del storage.
  var legacy = "";
  try { legacy = localStorage.getItem(SKEY) || ""; localStorage.removeItem(SKEY); } catch (e) {}
  var probeInit = { credentials:"include", cache:"no-store", headers:{} };
  if (legacy) probeInit.headers.Authorization = "Bearer " + legacy;
  rawFetch(WORKER + "/auth/session", probeInit)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.ok) {
      if (d.email) try { localStorage.setItem("yk_email", d.email); } catch (e) {}
      accessSession = Object.freeze({
        email:String(d.email || ""), name:String(d.name || ""),
        capabilities:Object.freeze({supervisor_project_switch:Boolean(d.capabilities && d.capabilities.supervisor_project_switch)}),
        defaults:Object.freeze({
          supervisor_project_id:String(d.defaults && d.defaults.supervisor_project_id || ""),
          supervisor_project_label:String(d.defaults && d.defaults.supervisor_project_label || "")
        })
      });
      try { window.dispatchEvent(new CustomEvent("yk:access-ready", {detail:accessSession})); } catch (e) {}
      reveal(); resolveReady(accessSession);
    } else showGate(); })
    .catch(showGate);

  // Gancho de pruebas (mismo patrón que YkDecisions._test): expone SÓLO el
  // predicado firmable para el harness. No altera el comportamiento en runtime.
  try { window.__ykAccesoTest = { signable: signable, WORKER: WORKER, WORKER_FALLBACK: WORKER_FALLBACK }; } catch (e) {}
})();
