import { CASA_ESPEJO, esEspejo, marcaDeCasa, enlaceDeCasa } from './_shared/casas.mjs';

// admira.biz: la cabecera sale ya con la marca de la casa (título, descripción, canónica)
// y se carga yk-casa.js lo primero, que reescribe el cuerpo según se va pintando.
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
  const response = await context.next();
  const url = new URL(context.request.url);
  if (!esEspejo(url.hostname)) return response;
  if (!String(response.headers.get('content-type') || '').includes('text/html')) return response;
  const v = await selloDe(context, url);
  const texto = { text(chunk) { const next = marcaDeCasa(chunk.text); if (next !== chunk.text) chunk.replace(next); } };
  return new HTMLRewriter()
    .on('html', { element(el) { el.setAttribute('data-casa', CASA_ESPEJO.id); } })
    .on('head', { element(el) { el.append('<script defer src="https://www.admiranext.com/assets/live-presence.js?v=2"></script>', {html:true}); el.prepend(`<script src="/yk-casa.js${v ? '?v=' + v : ''}"></script>`, { html:true }); } })
    .on('title', texto)
    .on('meta[content]', { element(el) {
      const content = el.getAttribute('content'), next = marcaDeCasa(enlaceDeCasa(content));
      if (next !== content) el.setAttribute('content', next);
    } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', CASA_ESPEJO.origin + url.pathname); } })
    .transform(response);
}
