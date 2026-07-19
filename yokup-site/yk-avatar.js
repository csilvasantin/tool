/* yk-avatar.js — retrato de agente, compartido entre páginas.
 *
 * La lógica nació dentro de yk-misiones.js (Carlos, 19-jul-2026) y solo servía a
 * /misiones. Al pedir el mismo retrato en /informes había dos caminos: copiar 25 líneas
 * —que acaban divergiendo— o sacarlas a un módulo. Esto es el módulo.
 *
 * NO toca yk-misiones.js a propósito: ese fichero está en desarrollo activo y tocarlo
 * era pisarle el trabajo a otro. Cuando amaine, /misiones puede pasar a usar esto y
 * borrar su copia; el contrato es el mismo (mismos avatares, mismo endpoint, misma
 * preferencia y mismas clases CSS).
 *
 *   await ykAvatar.ready          espera a la personalización compartida
 *   ykAvatar.img("Neo")           → URL del retrato, o ""
 *   ykAvatar.html("subMorfeo")    → <span class="who who-av">…  (o el icono si no hay)
 */
(function () {
  "use strict";

  var WORKER = "https://yokup-rtc.csilvasantin.workers.dev";
  var AVATARES = { neo: 1, morfeo: 1, smith: 1, trinity: 1, oraculo: 1 };
  var CUSTOM = { agents: {}, machines: {} };

  var esc = function (x) {
    return String(x == null ? "" : x).replace(/[<>&"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    });
  };
  function slug(n) {
    return String(n || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  // Preferencia de AJUSTES → Personalización (la escribe yk-frame). Por defecto: ON.
  function on() { try { return localStorage.getItem("yk_pref_avatars") !== "0"; } catch (e) { return true; } }

  // Personalización compartida: la FOTO del Panel de control pisa al retrato de serie.
  var ready = (function () {
    try {
      return window.fetch(WORKER + "/prefs/customize", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var c = (d && d.customize) || {};
          CUSTOM.agents = c.agents || {};
          CUSTOM.machines = c.machines || {};
        }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  })();

  function img(name) {
    var s = slug(name), cu = CUSTOM.agents[s] || {};
    if (cu.img) return cu.img;
    if (AVATARES[s]) return "/avatars/" + s + ".jpg";
    // subMorfeo / infraTrinity-guion heredan el retrato de su persona: son la misma cara
    // trabajando en otra capa, y sin esto la columna se llena de engranajes sueltos.
    // Se quita el prefijo de capa y se busca la persona AL PRINCIPIO de lo que queda,
    // porque muchos llevan además un sufijo de cometido (infratrinityguion → trinity).
    var base = s.replace(/^(sub|infra)/, "");
    for (var p in AVATARES) {
      if (base.indexOf(p) === 0) {
        var cb = CUSTOM.agents[p] || {};
        return cb.img || "/avatars/" + p + ".jpg";
      }
    }
    return "";
  }

  // pie: texto pequeño bajo el nombre (en /misiones es la plataforma). Opcional.
  function html(name, pie, cls) {
    var s = slug(name), cu = CUSTOM.agents[s] || {};
    var sub = pie ? '<small class="' + esc(cls || "agent-surface") + '">' + esc(pie) + "</small>" : "";
    var u = img(name);
    if (on() && u) {
      return '<span class="who who-av" title="' + esc(name) + '">' +
        '<img class="agava" loading="lazy" onerror="this.remove()" src="' + esc(u) + '" alt="">' +
        "<span>" + esc(name) + "</span>" + sub + "</span>";
    }
    return '<span class="who" title="' + esc(name) + '"><span>' +
      (cu.icon ? esc(cu.icon) : "👷") + " " + esc(name) + "</span>" + sub + "</span>";
  }

  window.ykAvatar = { ready: ready, img: img, html: html, slug: slug, on: on };
})();
