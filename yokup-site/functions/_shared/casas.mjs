// Casas de Yokup: yokup.com y su espejo admira.biz (Carlos, 2-oct-2026). Debe
// coincidir con HOUSES en yokup-rtc/src/auth-flow.js.
//
// admira.biz es a yokup.com lo que admira.app es a clearchannel.tv: el mismo sitio,
// presentado con la marca global Admira. Allí «Yokup» se lee «admira.biz», como en
// admira.app «Clear Channel» se lee «admira.app» (clearchannel-tv/brand.js y _worker.js).
// La marca BLANCA (/marca starbucks) es otra capa y va encima: yk-marca.js.
const ESPEJO = /(^|\.)admira\.biz$/i;

export const CASA_ESPEJO = { id:'admira-biz', name:'admira.biz', origin:'https://www.admira.biz' };

export function esEspejo(hostname) { return ESPEJO.test(String(hostname || '')); }

export function publicOriginFor(request) {
  let host = '';
  try { host = new URL(request.url).hostname; } catch (_) {}
  return esEspejo(host) ? CASA_ESPEJO.origin : 'https://www.yokup.com';
}

// «Yokup» → «admira.biz» en texto visible. NO toca correos (hola@yokup.com), ni
// subdominios técnicos (api.yokup.com, rtc.yokup.com, yokup.pages.dev), ni
// identificadores (yokup-site, yokup_rtc). Idéntica a la de yk-casa.js: la prueba
// casa-espejo.test.mjs compara las dos.
export function marcaDeCasa(value) {
  if (value == null || value === '') return value;
  return String(value)
    .replace(/(^|[^@\w.-])www\.yokup\.com(?![\w-])/gi, '$1www.admira.biz')
    .replace(/(^|[^@\w.-])yokup\.com(?![\w-])/gi, '$1admira.biz')
    .replace(/(^|[^@\w.-])(yokup)(?![\w-]|\.[a-z])/gi, (_, pre, word) => pre + (word === 'YOKUP' ? 'ADMIRA.BIZ' : 'admira.biz'));
}

// Enlaces al sitio (no al API): en el espejo se quedan en el espejo.
export function enlaceDeCasa(href) {
  const m = /^https?:\/\/(?:www\.)?yokup\.com(?=$|[/?#])/i.exec(String(href || ''));
  return m ? CASA_ESPEJO.origin + String(href).slice(m[0].length) : href;
}
