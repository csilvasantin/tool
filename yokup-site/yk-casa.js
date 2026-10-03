/* Yokup · yk-casa.js — la casa admira.biz (Carlos, 2-oct-2026).
 * admira.biz es el espejo de yokup.com con la marca global Admira, como admira.app lo es
 * de clearchannel.tv: mismo sitio, y donde ponía «Yokup» se lee «admira.biz».
 * Lo carga functions/_middleware.js SOLO en admira.biz, lo primero del <head>, y
 * reescribe el texto según se pinta y cuando el marco o una página añaden contenido.
 * No toca correos, subdominios técnicos (api.yokup.com) ni identificadores.
 * La marca blanca (/marca starbucks) va encima y no cambia: yk-marca.js.
 */
(function (root) {
  "use strict";
  var ORIGIN = "https://www.admira.biz";

  // Idéntica a marcaDeCasa de functions/_shared/casas.mjs (casa-espejo.test.mjs las compara).
  function marcaDeCasa(value) {
    if (value == null || value === "") return value;
    return String(value)
      .replace(/(^|[^@\w.-])www\.yokup\.com(?![\w-])/gi, "$1www.admira.biz")
      .replace(/(^|[^@\w.-])yokup\.com(?![\w-])/gi, "$1admira.biz")
      .replace(/(^|[^@\w.-])(yokup)(?![\w-]|\.[a-z])/gi, function (_, pre, word) { return pre + (word === "YOKUP" ? "ADMIRA.BIZ" : "admira.biz"); });
  }
  function enlaceDeCasa(href) {
    var m = /^https?:\/\/(?:www\.)?yokup\.com(?=$|[/?#])/i.exec(String(href || ""));
    return m ? ORIGIN + String(href).slice(m[0].length) : href;
  }
  // El API de datos de los portales (comercio, instalador, superusuario) también vive en
  // la casa: data.admira.biz es el MISMO worker yokup-api que data.yokup.com, pero «mismo
  // sitio» que admira.biz, así que sus cookies __Host- (SameSite=Strict) viajan. Desde
  // admira.biz, data.yokup.com es otro sitio: el navegador no guarda esas cookies y, sin
  // CORS para esta casa, «Continuar con Google» acababa en «Failed to fetch».
  // Prefijo ANCLADO al origen: data.yokup.com.evil no cuela.
  var DATA_YOKUP = "https://data.yokup.com", DATA_CASA = "https://data.admira.biz";
  function datosDeCasa(url) {
    var u = String(url == null ? "" : url);
    if (u.slice(0, DATA_YOKUP.length).toLowerCase() !== DATA_YOKUP) return url;
    var c = u.charAt(DATA_YOKUP.length);
    return c === "" || c === "/" || c === "?" || c === "#" ? DATA_CASA + u.slice(DATA_YOKUP.length) : url;
  }
  var api = { marcaDeCasa: marcaDeCasa, enlaceDeCasa: enlaceDeCasa, datosDeCasa: datosDeCasa };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;
  if (!/(^|\.)admira\.biz$/i.test(location.hostname || "") || root.YkCasa) return;
  root.YkCasa = Object.freeze({ id: "admira-biz", name: "admira.biz", origin: ORIGIN, marcaDeCasa: marcaDeCasa });
  document.documentElement.setAttribute("data-casa", "admira-biz");

  // Lo que las páginas piden a data.yokup.com se sirve desde data.admira.biz. yk-casa.js
  // es el primer script del <head> (functions/_middleware.js), antes que cualquier portal.
  if (typeof root.fetch === "function") {
    var rawFetch = root.fetch;
    root.fetch = function (input, init) {
      if (typeof input === "string" || (typeof URL !== "undefined" && input instanceof URL)) input = datosDeCasa(String(input));
      else if (input && typeof input.url === "string") { var next = datosDeCasa(input.url); if (next !== input.url) input = new Request(next, input); }
      return rawFetch.call(root, input, init);
    };
  }

  var ATTRS = ["title", "aria-label", "placeholder", "alt"];
  var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/;
  function text(node) {
    var parent = node.parentElement;
    if (parent && SKIP.test(parent.tagName)) return;
    var next = marcaDeCasa(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  function element(el) {
    for (var i = 0; i < ATTRS.length; i += 1) {
      var current = el.getAttribute(ATTRS[i]);
      if (current) { var next = marcaDeCasa(current); if (next !== current) el.setAttribute(ATTRS[i], next); }
    }
    if (el.tagName === "A" && el.hasAttribute("href")) {
      var href = el.getAttribute("href"), house = enlaceDeCasa(href);
      if (house !== href) el.setAttribute("href", house);
    }
  }
  function tree(node) {
    if (node.nodeType === 3) return text(node);
    if (node.nodeType !== 1 || SKIP.test(node.tagName)) return;
    element(node);
    var all = node.querySelectorAll("[title],[aria-label],[placeholder],[alt],a[href]");
    for (var i = 0; i < all.length; i += 1) element(all[i]);
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), pending = [];
    while (walker.nextNode()) pending.push(walker.currentNode);
    for (var j = 0; j < pending.length; j += 1) text(pending[j]);
  }
  tree(document.documentElement);
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i += 1) {
      var record = records[i];
      if (record.type === "characterData") text(record.target);
      else if (record.type === "attributes") element(record.target);
      else for (var j = 0; j < record.addedNodes.length; j += 1) tree(record.addedNodes[j]);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat("href") });
})(typeof window === "undefined" ? globalThis : window);
