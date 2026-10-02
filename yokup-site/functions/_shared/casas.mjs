// Casas de Yokup: yokup.com y su espejo admira.biz (Carlos, 2-oct-2026). Debe
// coincidir con HOUSES en yokup-rtc/src/auth-flow.js.
const ESPEJO = /(^|\.)admira\.biz$/i;

export function publicOriginFor(request) {
  let host = '';
  try { host = new URL(request.url).hostname; } catch (_) {}
  return ESPEJO.test(host) ? 'https://www.admira.biz' : 'https://www.yokup.com';
}
