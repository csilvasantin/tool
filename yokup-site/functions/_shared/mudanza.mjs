// INTERCAMBIO DE DOMINIOS (Carlos, 4-oct-2026): admira.biz pasa a servir la parte de
// negocio (Pages clearchannel-tv) y admira.app la de coordinación (este proyecto, Yokup).
// Hasta el corte admira.app NO llega aquí y todo esto es inerte. Tras el corte, quien
// llegue a admira.app con un enlace viejo de negocio (demo, backoffice, circuitos,
// presentaciones…) se va a la misma ruta en www.admira.biz, y las APIs de negocio
// responden 410 con el nuevo hogar. Solo actúa con host admira.app / www.admira.app:
// en admira.biz, yokup.com, yokup.pages.dev y vistas previas devuelve null.
//
// Ninguna de estas rutas existe en yokup-site (comprobado el 4-oct-2026). Si algún día
// Yokup sirve una con el mismo nombre, hay que sacarla de aquí.
export const NEGOCIO_ORIGIN = 'https://www.admira.biz';

const HOSTS = new Set(['admira.app', 'www.admira.app']);

// Páginas sueltas (con o sin .html y barra final) y árboles enteros (/x y /x/...).
const PAGINAS = /^\/(?:about|detail|marketplace|store-3d|walk|backoffice)(?:\.html|\/)?$/i;
const ARBOLES = /^\/(?:backoffice|parrilla|players|presentacion|presentation|target|tutorial|documentacion|wututu|cafebreria|distribucion)(?:\/.*)?$/i;
// La portada de negocio se reconoce por su query (?locationId=, ?circuit=, ?tour=…).
const QUERY_NEGOCIO = ['locationId', 'circuit', 'tour', 'campaign', 'campaignId', 'assetUrl', 'screenId', 'draft', 'target'];
// APIs de negocio: no se redirigen (un POST no debe seguir un salto a otro sitio).
const API_NEGOCIO = /^\/api\/(?:orders(?:\/.*)?|demo-signage\/.*)$/i;

export function esHostNegocioAntiguo(hostname) { return HOSTS.has(String(hostname || '').toLowerCase()); }

export function esRutaNegocio(url) {
  const { pathname, searchParams } = url;
  if (PAGINAS.test(pathname) || ARBOLES.test(pathname)) return true;
  return pathname === '/' && QUERY_NEGOCIO.some((k) => searchParams.has(k));
}

export function esApiNegocio(method, pathname) {
  if (API_NEGOCIO.test(pathname)) return true;
  return String(method || '').toUpperCase() === 'POST' && /^\/api\/demo-session\/?$/i.test(pathname);
}

// Respuesta de mudanza para esta petición, o null si no toca (la petición sigue su curso).
export function mudanzaANegocio(request) {
  let url;
  try { url = new URL(request.url); } catch (_) { return null; }
  if (!esHostNegocioAntiguo(url.hostname)) return null;
  if (esApiNegocio(request.method, url.pathname)) {
    return new Response(JSON.stringify({ moved_to:NEGOCIO_ORIGIN }), {
      status:410,
      headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
    });
  }
  if (esRutaNegocio(url)) {
    return new Response(null, { status:308, headers:{ location:NEGOCIO_ORIGIN + url.pathname + url.search } });
  }
  return null;
}
