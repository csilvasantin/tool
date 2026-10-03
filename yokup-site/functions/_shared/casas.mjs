// Casas de Yokup: yokup.com y su espejo con la marca global Admira (Carlos, 2-oct-2026).
// Debe coincidir con HOUSES en yokup-rtc/src/auth-flow.js.
//
// INTERCAMBIO DE DOMINIOS (Carlos, 4-oct-2026): admira.biz pasará a servir la parte de
// negocio (Pages clearchannel-tv) y admira.app la de coordinación (este proyecto). Hasta
// el corte el espejo es admira.biz; después, admira.app. Por eso la casa NO es fija: se
// deriva del host que llega, y el mismo código sirve en los dos dominios. En cada uno,
// donde ponía «Yokup» se lee el nombre de esa casa (admira.biz o admira.app).
// La marca BLANCA (/marca starbucks) es otra capa y va encima: yk-marca.js.
const ESPEJO = /(^|\.)admira\.(biz|app)$/i;
const APEX = /(?:^|\.)(admira\.(?:biz|app))$/i;

export function esEspejo(hostname) { return ESPEJO.test(String(hostname || '')); }

// admira.biz | admira.app | '' (cualquier otro host: yokup.com, yokup.pages.dev, vistas previas).
export function apexDe(hostname) {
  const m = APEX.exec(String(hostname || ''));
  return m ? m[1].toLowerCase() : '';
}

// La casa del host: { id:'admira-biz', name:'admira.biz', origin:'https://www.admira.biz' }, o null.
export function casaDe(hostname) {
  const apex = apexDe(hostname);
  return apex ? { id:apex.replace('.', '-'), name:apex, origin:'https://www.' + apex } : null;
}

// Compatibilidad: la casa espejo de hoy (antes del corte).
export const CASA_ESPEJO = casaDe('admira.biz');

export function publicOriginFor(request) {
  let host = '';
  try { host = new URL(request.url).hostname; } catch (_) {}
  const casa = casaDe(host);
  return casa ? casa.origin : 'https://www.yokup.com';
}

// «Yokup» → nombre de la casa en texto visible. NO toca correos (hola@yokup.com), ni
// subdominios técnicos (api.yokup.com, rtc.yokup.com, yokup.pages.dev), ni
// identificadores (yokup-site, yokup_rtc). Idéntica a la de yk-casa.js: la prueba
// casa-espejo.test.mjs compara las dos.
export function marcaDeCasa(value, nombre = CASA_ESPEJO.name) {
  if (value == null || value === '') return value;
  const casa = String(nombre || CASA_ESPEJO.name);
  return String(value)
    .replace(/(^|[^@\w.-])www\.yokup\.com(?![\w-])/gi, (_, pre) => pre + 'www.' + casa)
    .replace(/(^|[^@\w.-])yokup\.com(?![\w-])/gi, (_, pre) => pre + casa)
    .replace(/(^|[^@\w.-])(yokup)(?![\w-]|\.[a-z])/gi, (_, pre, word) => pre + (word === 'YOKUP' ? casa.toUpperCase() : casa));
}

// Enlaces al sitio (no al API): en el espejo se quedan en el espejo.
export function enlaceDeCasa(href, origin = CASA_ESPEJO.origin) {
  const m = /^https?:\/\/(?:www\.)?yokup\.com(?=$|[/?#])/i.exec(String(href || ''));
  return m ? String(origin || CASA_ESPEJO.origin) + String(href).slice(m[0].length) : href;
}
