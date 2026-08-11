/* Yokup · acceso.js — DMZ del helpdesk. Solo entra gente logueada (Google) y autorizada.
 * - Oculta la página hasta validar (gate estética Yokup, cian-teal).
 * - Login con Google (Google Identity Services), mismo Client ID que la flota Admira.
 * - El worker valida Google + whitelist y fija una sesión HttpOnly; ningún token
 *   queda en URL, JSON, logs ni almacenamiento accesible a JavaScript.
 * - Parchea window.fetch para enviar esa cookie sólo a los dos orígenes Yokup.
 * Instalar lo más arriba del <head>:  <script src="/acceso.js"></script>
 */
(function () {
  var CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
  var WORKER = "https://api.yokup.com";
  // Red de seguridad: rtc.yokup.com es el FALLBACK que usa yk-frame.js/ykFetch
  // cuando api.yokup.com falla por red. (28-jul-2026: antes apuntaba al host
  // workers.dev, que devolvía 404 y encima está bloqueado por ISPs españoles.)
  // Debe ser FIRMABLE también: si el fallback no llevara el mismo Bearer, daría
  // 401 y dejaría el tablero a oscuras. Solo se AÑADE este host — api.yokup.com y
  // los terceros se comportan EXACTAMENTE igual que antes.
  var WORKER_FALLBACK = "https://rtc.yokup.com";
  var SKEY = "yk_session";
  var rawFetch = window.fetch.bind(window);
  var activeChallenge = null;

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

  // Fontanería de sesión: espera al login y sólo envía la cookie HttpOnly al API.
  var resolveReady; var sessionReady = new Promise(function (r) { resolveReady = r; });
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

  function onCred(resp) {
    var err = document.querySelector("#yk-gate .err"); if (err) err.textContent = "Verificando acceso…";
    if (!resp || !resp.credential || !activeChallenge) { if (err) err.textContent = "Google no devolvió una credencial válida."; return; }
    rawFetch(WORKER + "/auth/login", { method: "POST", credentials:"include", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential: resp.credential, state:activeChallenge.state }) })
      .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (o) {
        activeChallenge = null;
        if (o.s === 200 && o.d.ok) {
          try { localStorage.removeItem(SKEY); if (o.d.email) localStorage.setItem("yk_email", o.d.email); } catch (e) {}
          reveal(); resolveReady();
        } else if (err) { err.textContent = o.s === 403 ? "Tu cuenta no está autorizada para Yokup." : "La solicitud caducó. Vuelve a intentarlo."; loadGIS(); }
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
      rawFetch(WORKER + "/auth/challenge", { method:"POST", credentials:"include", headers:{"content-type":"application/json"}, body:"{}" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("challenge")); })
      .then(function (challenge) {
      try {
        activeChallenge = challenge;
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: onCred,
          nonce: challenge.nonce,
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: false,
          // Codex rechaza FedCM antes del callback. Se fuerza el popup clásico;
          // no se inventa un redirect URI que Google Console no haya autorizado.
          use_fedcm_for_button: false
        });
        google.accounts.id.renderButton(document.getElementById("yk-gbtn"), { theme: "filled_black", size: "large", text: "signin_with", shape: "pill", width: 240 });
      } catch (e) { var er = document.querySelector("#yk-gate .err"); if (er) er.textContent = "No se pudo cargar el login de Google."; }
      }).catch(function () { var er = document.querySelector("#yk-gate .err"); if (er) er.textContent = "No se pudo iniciar el acceso seguro. Usa la página completa."; });
    };
    if (window.google && google.accounts && google.accounts.id) return go();
    var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true; s.onload = go;
    s.onerror = function () { var er = document.querySelector("#yk-gate .err"); if (er) er.textContent = "No se pudo cargar el login de Google."; };
    document.head.appendChild(s);
  }

  // Migra una sesión bearer antigua una sola vez y elimina el token del storage.
  var legacy = "";
  try { legacy = localStorage.getItem(SKEY) || ""; localStorage.removeItem(SKEY); } catch (e) {}
  var probeInit = { credentials:"include", cache:"no-store", headers:{} };
  if (legacy) probeInit.headers.Authorization = "Bearer " + legacy;
  rawFetch(WORKER + "/auth/session", probeInit)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.ok) { if (d.email) try { localStorage.setItem("yk_email", d.email); } catch (e) {} reveal(); resolveReady(); } else showGate(); })
    .catch(showGate);

  // Gancho de pruebas (mismo patrón que YkDecisions._test): expone SÓLO el
  // predicado firmable para el harness. No altera el comportamiento en runtime.
  try { window.__ykAccesoTest = { signable: signable, WORKER: WORKER, WORKER_FALLBACK: WORKER_FALLBACK }; } catch (e) {}
})();
