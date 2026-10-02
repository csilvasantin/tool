// Interruptor del avatar digital (FLT-101350). Un módulo por sitio en esta preview.
// La cara es https://digitalavatar.ai/embed.js (no se redespliega). El cerebro es
// POST mismo-origen /avatar-ask: el servidor habla con brain.digitalavatar.ai y
// no devuelve audio ni claves. Sin argumento alterna; on/off lo fija. El estado
// queda en localStorage por host.
(function (root) {
  'use strict';

  const ON = /^(on|encender|mostrar|show)$/i;
  const OFF = /^(off|apagar|ocultar|hide)$/i;

  function pageLang() {
    try {
      const lang = String((root.document && root.document.documentElement.lang) || '').toLowerCase();
      if (lang.indexOf('en') === 0) return 'en';
      if (lang.indexOf('es') === 0) return 'es';
    } catch (_) {}
    return 'es';
  }

  function storageKey() {
    try { return 'da-avatar:' + ((root.location && root.location.host) || ''); } catch (_) { return 'da-avatar:'; }
  }

  // null si el texto no es el interruptor. 'toggle' | 'on' | 'off' | 'bad'.
  function decide(text) {
    const raw = String(text == null ? '' : text).trim();
    const m = raw.match(/^\/?([^\s@]+)(?:@\S+)?(?:\s+([\s\S]*))?$/);
    if (!m) return null;
    const verb = m[1].toLowerCase();
    let rest = (m[2] || '').trim();
    if (verb === 'cli') {
      const parts = rest.split(/\s+/);
      if (!/^(ayudante|helper)$/i.test(parts[0] || '')) return null;
      rest = parts.slice(1).join(' ');
    } else if (verb !== 'avatardigital' && verb !== 'digitalavatar') {
      return null;
    }
    const arg = rest.split(/\s+/).filter(Boolean)[0] || '';
    if (!arg) return 'toggle';
    if (ON.test(arg)) return 'on';
    if (OFF.test(arg)) return 'off';
    return 'bad';
  }

  function line(mode, lang) {
    const en = lang === 'en';
    if (mode === 'on') return en ? 'Digital avatar on' : 'Avatar digital activado';
    if (mode === 'off') return en ? 'Digital avatar off' : 'Avatar digital desactivado';
    return en
      ? 'Use on/off (show/hide) or no argument to toggle.'
      : 'Usa on/off (mostrar/ocultar, encender/apagar) o ningún argumento para alternar.';
  }

  const api = {decide, line, storageKey, pageLang};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const doc = document;
  const local = (() => { try { return root.localStorage; } catch (_) { return null; } })();
  let face = null;
  let mounting = null;

  function storedOn() {
    try { return !!(local && local.getItem(storageKey()) === '1'); } catch (_) { return false; }
  }
  function store(on) {
    try { if (local) local.setItem(storageKey(), on ? '1' : '0'); } catch (_) {}
  }

  function ensureLift() {
    if (doc.getElementById('da-avatar-lift')) return;
    const style = doc.createElement('style');
    style.id = 'da-avatar-lift';
    // El embed fija bottom:20px y un z-index por encima de todo. Aquí se levanta
    // por encima de la barra Experto y se queda por debajo de las barras (z 40
    // pierde contra el shell en 9000 y contra el dock del gemelo en 30).
    style.textContent = '#da-av{right:16px !important;bottom:var(--da-lift,96px) !important;top:auto !important;z-index:25 !important}';
    doc.head.append(style);
  }

  function barHeight(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    const r = el.getBoundingClientRect();
    if (r.height < 24 || r.bottom < root.innerHeight - 40) return 0;
    if (r.top > root.innerHeight - 8) return 0;
    return Math.round(root.innerHeight - r.top + 16);
  }

  function applyLift() {
    let h = 96;
    for (const id of ['xsExpert', 'telegramDock', 'expert-panel', 'yk-rail-bottom']) h = Math.max(h, barHeight(doc.getElementById(id)));
    doc.querySelectorAll('.xs-expert, .yk-rail-bottom').forEach(el => { h = Math.max(h, barHeight(el)); });
    doc.documentElement.style.setProperty('--da-lift', h + 'px');
  }

  function watchLift() {
    ensureLift();
    applyLift();
    const mo = new MutationObserver(applyLift);
    for (const id of ['xsExpert', 'telegramDock', 'expertBar']) {
      const el = doc.getElementById(id);
      if (el) mo.observe(el, {attributes: true, attributeFilter: ['class', 'style']});
    }
    root.addEventListener('resize', applyLift);
  }

  function fallbackFace() {
    let wrap = doc.getElementById('da-av');
    if (wrap) return wrap;
    wrap = doc.createElement('div');
    wrap.id = 'da-av';
    wrap.className = 'open';
    const en = pageLang() === 'en';
    wrap.innerHTML = '<div style="width:220px;padding:14px 16px;border-radius:16px;background:#02080d;border:1px solid rgba(120,243,255,.45);color:#eef7ff;font:13px/1.4 system-ui,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.45)">'
      + '<div style="font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#78f3ff;margin-bottom:8px">'
      + (en ? 'Digital avatar' : 'Avatar digital') + '</div>'
      + '<div style="font-size:42px;line-height:1;text-align:center">🤖</div>'
      + '<div id="da-cap" style="margin-top:8px">' + (en ? '2D face. The 3D model did not load.' : 'Cara 2D. El modelo 3D no cargó.') + '</div></div>';
    doc.body.append(wrap);
    return wrap;
  }

  async function ensureFace() {
    if (face) return face;
    if (mounting) return mounting;
    mounting = (async () => {
      const lang = pageLang();
      try {
        const mod = await import('https://digitalavatar.ai/embed.js');
        face = await mod.mount({
          brainUrl: (root.location && root.location.origin ? root.location.origin : '') + '/avatar-ask',
          lang: lang === 'en' ? 'en-US' : 'es-ES',
          title: lang === 'en' ? 'Digital avatar' : 'Avatar digital',
          greeting: lang === 'en' ? 'Hello. What do you need?' : 'Hola. ¿En qué te ayudo?',
          placeholder: lang === 'en' ? 'Ask about this project…' : 'Pregunta sobre este proyecto…',
        });
      } catch (_) {
        fallbackFace();
        face = {open() {}, close() {}};
      }
      if (!doc.getElementById('da-av')) fallbackFace();
      applyLift();
      return face;
    })();
    try { return await mounting; } finally { mounting = null; }
  }

  async function show() {
    store(true);
    await ensureFace();
    const node = doc.getElementById('da-av');
    if (node) node.style.display = '';
    try { if (face && face.open) face.open(); } catch (_) {}
    applyLift();
  }

  function hide() {
    store(false);
    const node = doc.getElementById('da-av');
    if (node) node.style.display = 'none';
    try { root.speechSynthesis && root.speechSynthesis.cancel(); } catch (_) {}
  }

  async function handle(text) {
    const mode = decide(text);
    const lang = pageLang();
    if (mode == null || mode === 'bad') return line('bad', lang);
    const next = mode === 'toggle' ? !storedOn() : mode === 'on';
    if (next) await show(); else hide();
    return line(next ? 'on' : 'off', lang);
  }

  root.AvatarDigital = {handle, show, hide, decide, storedOn};
  watchLift();
  if (storedOn()) show();
})(typeof window === 'undefined' ? globalThis : window);
