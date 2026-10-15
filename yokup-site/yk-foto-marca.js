/* Fecha visible como capa; nunca altera ni vuelve a guardar la imagen original. */
(function (root) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zona = 'Europe/Madrid';
  function instante(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    const ms = Number.isFinite(n) ? (n < 1e11 ? n * 1000 : n) : Date.parse(v);
    return Number.isFinite(ms) && ms > 0 && !isNaN(new Date(ms)) ? ms : null;
  }
  function datos(url, registro) {
    const original = String(url);
    const match = original.match(/#captura=(\d+)$/);
    const captura = match && instante(match[1]);
    const ms = captura || instante(registro);
    if (!ms) return {url: original};
    const partes = new Intl.DateTimeFormat('es-ES', {timeZone: zona, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).formatToParts(ms);
    const p = Object.fromEntries(partes.map(x => [x.type, x.value]));
    return {url: match ? original.slice(0, match.index) : original, ms, origen: captura ? 'captura' : 'registro', fecha:`${p.day}/${p.month}/${p.year}`, hora:`${p.hour}:${p.minute}:${p.second}`};
  }
  function foto(url, registro, loading = 'lazy') {
    if (!/^https?:\/\//i.test(url)) return '';
    const d = datos(url, registro);
    const title = d.origen === 'captura' ? 'Hora de captura · Europe/Madrid' : 'Hora de registro del evento; hora de captura no disponible · Europe/Madrid';
    const marca = d.ms ? `<time class="yk-foto-fecha" datetime="${new Date(d.ms).toISOString()}" data-origen="${d.origen}" title="${title}">${d.origen === 'registro' ? '<small>Registro</small>' : ''}${d.fecha}<br>${d.hora}</time>` : '';
    return `<a class="yk-foto" href="${esc(d.url)}" target="_blank" rel="noopener" title="Abrir foto original, sin marca"><img src="${esc(d.url)}" alt="adjunto" loading="${loading === 'eager' ? 'eager' : 'lazy'}">${marca}</a>`;
  }
  function control() {
    return `<label class="yk-foto-control"><input type="checkbox" data-foto-fecha${visible ? ' checked' : ''}> Fecha y hora en fotos <small>· Madrid · Abrir foto: original sin marca</small></label>`;
  }
  let visible = true;
  const doc = root.document;
  if (doc) {
    try { visible = root.localStorage.getItem('yk-foto-fecha') !== 'oculta'; } catch (_) {}
    const style = doc.createElement('style');
    style.id = 'yk-foto-marca-estilo';
    style.textContent = '.yk-foto{position:relative}.yk-foto-fecha{position:absolute;right:3px;bottom:3px;padding:3px 4px;border-radius:3px;background:rgba(0,0,0,.72);color:#fff;font:10px/1.2 ui-monospace,monospace;text-align:right;pointer-events:none;white-space:nowrap}.yk-foto-fecha small{display:block;font:8px/1.2 system-ui,sans-serif}.yk-foto-control{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;margin:0 0 14px;cursor:pointer}.yk-foto-control small{font-size:11px;opacity:.7}.yk-foto-control input{accent-color:var(--brand,#719c41)}html[data-foto-fecha="oculta"] .yk-foto-fecha{display:none}@media print{.yk-foto-control{display:none}}';
    doc.head.appendChild(style);
    doc.documentElement.dataset.fotoFecha = visible ? 'visible' : 'oculta';
    doc.addEventListener('change', function (e) {
      if (!e.target.matches('input[data-foto-fecha]')) return;
      visible = e.target.checked;
      doc.documentElement.dataset.fotoFecha = visible ? 'visible' : 'oculta';
      doc.querySelectorAll('input[data-foto-fecha]').forEach(input => { input.checked = visible; });
      try { root.localStorage.setItem('yk-foto-fecha', visible ? 'visible' : 'oculta'); } catch (_) {}
    });
  }
  root.YkFotoMarca = {datos, foto, control};
})(globalThis);
