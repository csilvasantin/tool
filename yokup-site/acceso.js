/* Yokup · acceso.js — DMZ del helpdesk. Solo entra gente logueada (Google) y autorizada.
 * - Oculta la página hasta validar (gate estética Yokup, cian-teal).
 * - Login con Google (Google Identity Services), mismo Client ID que la flota Admira.
 * - Canjea la credencial de Google por una SESIÓN Yokup (12h) en el worker (/auth/login),
 *   que valida la whitelist (worker admira-whitelist). La sesión firmada es la que abre la API.
 * - Parchea window.fetch: añade el Bearer a TODA llamada al worker (incluye el avatar /copilot);
 *   si el worker responde 401, caduca la sesión y re-pide login.
 * Instalar lo más arriba del <head>:  <script src="/acceso.js"></script>
 */
(function () {
  var CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
  var WORKER = "https://api.yokup.com";
  var SKEY = "yk_session";
  var rawFetch = window.fetch.bind(window);

  function sessionValid() {
    try { var t = localStorage.getItem(SKEY); if (!t) return false; var p = JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))); return p.exp && Date.now() < p.exp - 30000; } catch (e) { return false; }
  }

  // Ocultar el contenido de inmediato.
  document.documentElement.classList.add("yk-locked");
  var st = document.createElement("style");
  st.textContent =
    "html.yk-locked body{visibility:hidden!important}" +
    "#yk-gate{position:fixed;inset:0;z-index:2147483647;visibility:visible;display:flex;align-items:center;justify-content:center;padding:24px;" +
      "background:radial-gradient(120% 90% at 50% 12%,#0a1f2e,#02080d);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}" +
    "#yk-gate .card{width:min(92vw,380px);background:#02080d;border:1px solid rgba(120,243,255,.28);border-radius:18px;padding:30px 26px;box-shadow:0 30px 80px rgba(0,0,0,.6);text-align:center}" +
    "#yk-gate .logo{font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:16px;color:#dff8ff;margin-bottom:6px}" +
    "#yk-gate .logo b{color:#78f3ff}" +
    "#yk-gate .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#78f3ff;box-shadow:0 0 16px #78f3ff;margin-right:9px;animation:ykb 2s infinite}" +
    "@keyframes ykb{0%,100%{opacity:1}50%{opacity:.3}}" +
    "#yk-gate h2{font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#eef7ff;margin:16px 0 6px}" +
    "#yk-gate p{font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;color:#75aab9;margin-bottom:20px}" +
    "#yk-gate .btnwrap{display:flex;justify-content:center;min-height:44px}" +
    "#yk-gate .err{font-family:system-ui,sans-serif;font-size:12.5px;color:#ff8866;margin-top:16px;min-height:18px}" +
    "#yk-gate .foot{margin-top:22px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#3a5f6b}";
  (document.head || document.documentElement).appendChild(st);

  // Fontanería del token: el fetch al worker espera a que haya sesión y añade el Bearer.
  var resolveReady; var sessionReady = new Promise(function (r) { resolveReady = r; });
  if (sessionValid()) resolveReady();
  window.fetch = function (input, init) {
    var u = typeof input === "string" ? input : (input && input.url) || "";
    if (u.indexOf(WORKER) !== 0) return rawFetch(input, init);
    return sessionReady.then(function () {
      init = init || {};
      var h = new Headers(init.headers || {});
      var t = localStorage.getItem(SKEY); if (t) h.set("Authorization", "Bearer " + t);
      init.headers = h;
      return rawFetch(u, init).then(function (res) {
        if (res.status === 401) { try { localStorage.removeItem(SKEY); } catch (e) {} location.reload(); }
        return res;
      });
    });
  };

  function reveal() { document.documentElement.classList.remove("yk-locked"); var g = document.getElementById("yk-gate"); if (g) g.remove(); }

  function onCred(resp) {
    var err = document.querySelector("#yk-gate .err"); if (err) err.textContent = "Verificando acceso…";
    rawFetch(WORKER + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential: resp.credential }) })
      .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (o) {
        if (o.s === 200 && o.d.token) {
          try { localStorage.setItem(SKEY, o.d.token); if (o.d.email) localStorage.setItem("yk_email", o.d.email); } catch (e) {}
          reveal(); resolveReady();
        } else if (err) { err.textContent = o.s === 403 ? "Tu cuenta no está autorizada para Yokup." : "No se pudo validar el acceso."; }
      })
      .catch(function () { if (err) err.textContent = "Error de conexión."; });
  }

  function showGate() {
    var mk = function () {
      if (document.getElementById("yk-gate")) return;
      var g = document.createElement("div"); g.id = "yk-gate";
      g.innerHTML =
        '<div class="card">' +
          '<div class="logo"><span class="dot"></span>Yo<b>kup</b></div>' +
          '<h2>Acceso restringido</h2>' +
          '<p>Zona de soporte de la flota Admira. Identifícate para continuar.</p>' +
          '<div class="btnwrap"><div id="yk-gbtn"></div></div>' +
          '<div class="err"></div>' +
          '<div class="foot">Perímetro de seguridad · Yokup</div>' +
        '</div>';
      document.body.appendChild(g);
      loadGIS();
    };
    if (document.body) mk(); else document.addEventListener("DOMContentLoaded", mk);
  }

  function loadGIS() {
    var go = function () {
      try {
        google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCred, auto_select: false, cancel_on_tap_outside: false });
        google.accounts.id.renderButton(document.getElementById("yk-gbtn"), { theme: "filled_black", size: "large", text: "signin_with", shape: "pill", width: 240 });
        google.accounts.id.prompt();
      } catch (e) { var er = document.querySelector("#yk-gate .err"); if (er) er.textContent = "No se pudo cargar el login de Google."; }
    };
    if (window.google && google.accounts && google.accounts.id) return go();
    var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true; s.onload = go;
    s.onerror = function () { var er = document.querySelector("#yk-gate .err"); if (er) er.textContent = "No se pudo cargar el login de Google."; };
    document.head.appendChild(s);
  }

  if (sessionValid()) { reveal(); } else { showGate(); }
})();
