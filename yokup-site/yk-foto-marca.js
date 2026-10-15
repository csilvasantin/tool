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
    return `<a class="yk-foto" href="${esc(d.url)}" target="_blank" rel="noopener" title="Ampliar foto" aria-haspopup="dialog"><img src="${esc(d.url)}" alt="adjunto" loading="${loading === 'eager' ? 'eager' : 'lazy'}">${marca}</a>`;
  }
  function control() {
    return `<label class="yk-foto-control"><input type="checkbox" data-foto-fecha${visible ? ' checked' : ''}> Fecha y hora en fotos <small>· Madrid</small></label>`;
  }
  let visible = true;
  const doc = root.document;
  if (doc) {
    try { visible = root.localStorage.getItem('yk-foto-fecha') !== 'oculta'; } catch (_) {}
    const style = doc.createElement('style');
    style.id = 'yk-foto-marca-estilo';
    style.textContent = `
.yk-foto{position:relative}
.yk-foto-fecha{position:absolute;right:3px;bottom:3px;padding:3px 4px;border-radius:3px;background:rgba(0,0,0,.72);color:#fff;font:10px/1.2 ui-monospace,monospace;text-align:right;pointer-events:none;white-space:nowrap}
.yk-foto-fecha small{display:block;font:8px/1.2 system-ui,sans-serif}
.yk-foto-control{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;margin:0 0 14px;cursor:pointer}
.yk-foto-control small{font-size:11px;opacity:.7}.yk-foto-control input{accent-color:var(--brand,#719c41)}
html[data-foto-fecha="oculta"] .yk-foto-fecha{display:none}
dialog.yk-foto-detalle{box-sizing:border-box;width:max-content;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);margin:auto;padding:16px;border:1px solid #506159;border-radius:14px;background:#17251e;color:#f5f8f6;box-shadow:0 20px 80px #0009;font:14px/1.4 system-ui,sans-serif}
.yk-foto-detalle::backdrop{background:#000b}
.yk-foto-detalle header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 16px}
dialog.yk-foto-detalle header h2{margin:0;color:#f5f8f6;font:600 18px/1.3 system-ui,sans-serif}
.yk-foto-detalle button{padding:6px 12px;border:1px solid #6f8176;border-radius:7px;background:#263b2e;color:inherit;font:inherit;cursor:pointer}
.yk-foto-detalle figure{position:relative;max-width:100%;margin:0 auto;background:#080b09;overflow:hidden}
.yk-foto-detalle figure img{display:block;width:100%;height:100%;object-fit:contain}
.yk-foto-detalle .yk-foto-fecha{right:8px;bottom:8px;padding:5px 7px;font-size:clamp(12px,2vw,20px)}
.yk-foto-detalle .yk-foto-fecha small{font-size:11px}
.yk-foto-detalle footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:16px}
.yk-foto-detalle .yk-foto-control{margin:0}.yk-foto-detalle footer a{color:#d5efb2;text-decoration:underline}
.yk-foto-detalle button:focus-visible,.yk-foto-detalle a:focus-visible{outline:2px solid #d5efb2;outline-offset:3px}
@media print{.yk-foto-control,.yk-foto-detalle{display:none}}
`;
    doc.head.appendChild(style);
    doc.documentElement.dataset.fotoFecha = visible ? 'visible' : 'oculta';
    doc.addEventListener('click', function (e) {
      const link = e.target.closest('a.yk-foto');
      if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (typeof doc.createElement('dialog').showModal !== 'function') return;
      e.preventDefault();
      // El detalle conserva la proporción, el instante y el JPEG de la miniatura.
      const dialog = doc.createElement('dialog');
      dialog.className = 'yk-foto-detalle';
      dialog.setAttribute('aria-label', 'Detalle de la imagen');
      dialog.innerHTML = '<header><h2>Detalle de la imagen</h2><button type="button" autofocus>Cerrar</button></header><figure></figure><footer>' + control() + '<a target="_blank" rel="noopener">Abrir original sin marca</a></footer>';
      const figure = dialog.querySelector('figure');
      const img = doc.createElement('img');
      img.alt = link.querySelector('img').alt || 'Imagen de la incidencia';
      const ajustar = function () {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const scale = Math.min(Math.min(840, root.innerWidth - 64) / img.naturalWidth, Math.max(80, root.innerHeight - 230) / img.naturalHeight);
        figure.style.width = Math.round(img.naturalWidth * scale) + 'px';
        figure.style.height = Math.round(img.naturalHeight * scale) + 'px';
      };
      img.onload = ajustar;
      img.src = link.querySelector('img').src;
      figure.appendChild(img);
      const marca = link.querySelector('.yk-foto-fecha');
      if (marca) figure.appendChild(marca.cloneNode(true));
      dialog.querySelector('footer a').href = link.href;
      dialog.querySelector('button').onclick = function () { dialog.close(); };
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', function () { root.removeEventListener('resize', ajustar); dialog.remove(); });
      root.addEventListener('resize', ajustar);
      doc.body.appendChild(dialog);
      dialog.showModal();
      ajustar();
    });
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
