import { casaDe, esEspejo, marcaDeCasa, enlaceDeCasa } from './_shared/casas.mjs';
import { mudanzaANegocio } from './_shared/mudanza.mjs';
import { atajoDePagina } from './_shared/espejo-puertas.mjs';

// La casa con marca Admira (admira.biz hoy, admira.app tras el intercambio de dominios
// del 4-oct-2026): la cabecera sale ya con la marca de la casa (título, descripción,
// canónica) y se carga yk-casa.js lo primero, que reescribe el cuerpo según se va pintando.
// En cualquier otro host (yokup.pages.dev, vistas previas) esto no hace nada.
let sello = '';
async function selloDe(context, url) {
  if (sello) return sello;
  try {
    const r = await context.env.ASSETS.fetch(new URL('/version.json', url));
    sello = encodeURIComponent(String((await r.json()).version || ''));
  } catch (_) {}
  return sello;
}

export async function onRequest(context) {
  // Flota → admira.live, /ayuda → /help, y 404 de /llms.txt /robots.txt /.well-known.
  // Va antes del asset: una Function gana a _redirects, y sin esto el catch-all
  // servía la portada con un 200. No incluye /auth ni los portales.
  const atajo = atajoDePagina(context.request);
  if (atajo) return atajo;
  // Enlaces viejos de negocio que lleguen a admira.app tras el corte → www.admira.biz.
  // Solo con host (www.)admira.app; en cualquier otro host es null y no cambia nada.
  const mudanza = mudanzaANegocio(context.request);
  if (mudanza) return mudanza;
  const response = await context.next();
  const url = new URL(context.request.url);
  if (!esEspejo(url.hostname)) return response;
  const casa = casaDe(url.hostname);
  if (!String(response.headers.get('content-type') || '').includes('text/html')) return response;
  const v = await selloDe(context, url);
  const texto = { text(chunk) { const next = marcaDeCasa(chunk.text, casa.name); if (next !== chunk.text) chunk.replace(next); } };
  return new HTMLRewriter()
    .on('html', { element(el) { el.setAttribute('data-casa', casa.id); } })
    .on('head', { element(el) { el.append('<script defer src="https://www.admiranext.com/assets/live-presence.js?v=2"></script>', {html:true}); el.prepend(`<script src="/yk-casa.js${v ? '?v=' + v : ''}"></script>`, { html:true }); } })
    .on('title', texto)
    .on('meta[content]', { element(el) {
      const content = el.getAttribute('content'), next = marcaDeCasa(enlaceDeCasa(content, casa.origin), casa.name);
      if (next !== content) el.setAttribute('content', next);
    } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', casa.origin + url.pathname); } })
    .transform(response);
}
