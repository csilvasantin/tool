/* Fotos reales de referencias PG103. Solo los CIs registrados del Xpacio confirmado.
 * La numeración de referencia es independiente del código ITIL y del catálogo 3D.
 * Sin credenciales ni datos del comercio en las peticiones al catálogo público.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YkPhotoReferences = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var BASE = "https://www.xpaceos.com/inventario/starbucks/";
  var MANIFEST = BASE + "references.json";
  var STORE = "alsea-sbux-021", SITE = "33c6fa18-01fa-40df-90a9-7b2939aae1a2";
  var CODES = ["PDG103-BAR-01", "PDG103-MOS-01", "PDG103-VIT-01", "PDG103-EST-01", "PDG103-MES-01", "PDG103-MES-02", "PDG103-SIL-01", "PDG103-SIL-02", "PDG103-SIL-03", "PDG103-SIL-04", "PDG103-BOT-01"];
  var SCOPES = { element: "Foto del elemento", type: "Foto de la tipología · unidad concreta sin identificar", context: "Foto de contexto · elemento parcialmente visible" };
  function siteMatches(site) {
    site = site || {};
    var id = site.site_id, store = site.admira_store_id;
    return (id === SITE || store === STORE) && (!id || id === SITE) && (!store || store === STORE);
  }
  function photoUrl(value) {
    if (typeof value !== "string") return null;
    if (!/^(?:\.\/photos\/|https:\/\/www\.xpaceos\.com\/inventario\/starbucks\/photos\/)[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g)$/.test(value)) return null;
    try {
      var url = new URL(value, BASE);
      return url.origin === "https://www.xpaceos.com" && url.pathname.startsWith("/inventario/starbucks/photos/") && !url.search && !url.hash ? url.href : null;
    } catch (_) { return null; }
  }
  function resolve(manifest, site, ci) {
    if (!siteMatches(site) || !ci || ci.managed_by !== "itil") return null;
    var number = CODES.indexOf(ci.itil_code) + 1;
    if (!number || !manifest || !Array.isArray(manifest.items)) return null;
    var matches = manifest.items.filter(function (item) { return item && item.itil_code === ci.itil_code && item.status === "registered"; });
    if (matches.length !== 1) return null;
    var item = matches[0], ref = "PG103-" + String(number).padStart(3, "0"), photo = photoUrl(item.photo);
    if (item.reference_number !== number || item.reference_id !== ref || !photo || !Object.hasOwn(SCOPES, item.photo_scope)) return null;
    return { number: number, id: ref, photo: photo, scope: item.photo_scope, scopeLabel: SCOPES[item.photo_scope],
      basis: typeof item.basis === "string" ? item.basis.slice(0, 1000) : "",
      href: BASE + "?view=references&ref=" + encodeURIComponent(ref) };
  }
  // Un solo intento por carga de página; un fallo deja el inventario disponible.
  function createLoader(fetcher) {
    var pending;
    return function () {
      if (!pending) pending = (async function () {
        var controller = typeof AbortController === "function" ? new AbortController() : null;
        var timeout = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
        try {
          var response = await fetcher(MANIFEST, { credentials: "omit", referrerPolicy: "no-referrer", signal: controller ? controller.signal : undefined });
          if (!response.ok) return { items: [] };
          var result = await response.json();
          return result && Array.isArray(result.items) ? result : { items: [] };
        } catch (_) { return { items: [] }; }
        finally { if (timeout) clearTimeout(timeout); }
      })();
      return pending;
    };
  }
  var load = createLoader(function (url, options) { return fetch(url, options); });
  return { siteMatches: siteMatches, photoUrl: photoUrl, resolve: resolve, createLoader: createLoader, load: load };
});
