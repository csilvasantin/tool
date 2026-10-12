/* ⌘ EXPERTO · CLI — piel compartida de la suite AdmiraNeXT (studio, store, app, tv, biz).
 * Carlos, 4-oct-2026: el modo Experto de todas las patas con el look de digitalavatar.ai
 * (csilvasantin/digitalavatar.ai assets/da-shell.js: ficha verde del motor a la izquierda,
 * registro «CLI de … · ADmiraNeXT · escribe /help» a la derecha y orden «›» con borde cian).
 *
 * No sustituye el CLI de cada pata: reviste el panel que ya existe. Los verbos (/help, /marca,
 * /demo…), el historial y el autocompletado siguen siendo los de la pata.
 *
 *   <link rel="stylesheet" href="https://admiranext.com/suite/experto.css?v=…">
 *   <script defer src="https://admiranext.com/suite/experto.js?v=…"
 *     data-engine="ADMIRA BIZ ENGINE" data-pata="admira.biz" data-cli="admira.biz"></script>
 *
 * Selectores (data-*, con los valores por defecto del panel galaxy-shell / responsive-shell):
 *   data-panel="#expert-panel"  data-header=".expert-bar"  data-title=".expert-bar strong"
 *   data-body=".expert-blocks"  data-form="#expert-command-form"  data-input="#expert-command"
 *   data-log="#expert-command-result"  data-hint=".expert-hint"
 *   data-extras='[data-module="verbos"],[data-module="rutinas"]'   (tras «＋ verbos»)
 *   data-chrome=".expert-module-head,.expert-module-resizer,.expert-layout-menu"  (se ocultan)
 *   data-version-url="/version.json"
 * data-move-log: lleva el registro de la pata a la columna del CLI. data-toggle="": sin botones ⌘ genéricos.
 * Modo propio (patas sin CLI): data-mount="#af-panel-bottom" data-mount-body=".af-bd" [data-extras-label="vista"].
 * CERRADO POR DEFECTO (Carlos, 6-oct-2026): quien entra por primera vez (sin almacenamiento ni
 * parámetros) nunca ve el modo Experto; solo aparece al abrirlo a propósito (botón ⌘ de la pata,
 * data-toggle con los de la suite por defecto, su atajo o AdmiraExperto.open()).
 *   data-min="hide" (por defecto): cerrado = oculto del todo, sin la línea.
 *   data-min="line": cerrado = asa de una línea «› /help» anclada abajo (admiranext.com, admira.live);
 *     el asa y el ▾ despliegan/pliegan y una orden lanzada en la línea lo despliega. La página reserva
 *     abajo ese alto (div.ax-dock-spacer al final del body, --ax-dock-pad).
 *   Modo propio sin ⌘ de la pata (data-mount + data-toggle=""): sin otra forma de abrirlo, se queda
 *     la línea aunque no lo pida (compatibilidad con admira.live antes de data-min="line").
 * Abierto se recuerda SOLO en la pestaña (sessionStorage «ax-experto-abierto»): nunca se reabre solo en
 * otra visita. La clave antigua de localStorage (4-oct, reabría el Experto en cada visita) se borra.
 * data-dock="off" desactiva el anclaje (lo gobierna la pata).
 * API: window.AdmiraExperto = {paint(), setState(texto), lines(), set(clave, valor), verb({name, args, desc:[es,en], run(args, log)}), run(texto),
 *      demos(), parseDemo(texto)  ← /demo de las cinco soluciones (studio, store, tv, app, biz),
 *      open(), close(), toggle(), isOpen()}.
 */
(function (root) {
  'use strict';
  if (root.AdmiraExperto || typeof document === 'undefined') return;
  var script = document.currentScript || {};
  var ds = script.dataset || {};
  var host = location.hostname.replace(/^www\./, '');
  var cfg = {
    panel: ds.panel || '#expert-panel',
    header: ds.header || '.expert-bar',
    title: ds.title || '.expert-bar strong',
    body: ds.body || '.expert-blocks',
    form: ds.form || '#expert-command-form',
    input: ds.input || '#expert-command',
    log: ds.log || '#expert-command-result',
    hint: ds.hint || '.expert-hint',
    extras: ds.extras == null ? '[data-module="verbos"],[data-module="rutinas"]' : ds.extras,
    chrome: ds.chrome == null ? '.expert-module-head,.expert-module-resizer,.expert-layout-menu' : ds.chrome,
    pata: ds.pata || host,
    cli: ds.cli || ds.pata || host,
    versionUrl: ds.versionUrl || '/version.json',
    // Modo propio (patas sin CLI, p. ej. admira.tv): data-mount="#af-panel-bottom" data-mount-body=".af-bd".
    // La piel monta su CLI con verbos comunes (/help, /marca, /ir, /estado…) y deja lo que la página
    // ya tenía en ese panel tras «＋ vista».
    mount: ds.mount || '',
    mountBody: ds.mountBody || '',
    extrasLabel: ds.extrasLabel || '',
    // data-move-log: el registro de la pata vive en otro panel (admira.store: «PREVIOS»); se lleva
    // a la columna del CLI, encima de la orden, como en digitalavatar.ai.
    moveLog: ds.moveLog != null,
    dock: ds.dock !== 'off',
    // Cerrado = oculto del todo (Carlos 6-oct-2026: el Experto, apagado por defecto en toda la suite).
    // data-min="line" deja la línea «› /help»; un modo propio sin ⌘ de la pata (data-mount + data-toggle="")
    // también, porque si no no habría forma de abrirlo. data-min="hide" sigue valiendo (Pixeria, biz).
    minHide: ds.min === 'hide' || (ds.min !== 'line' && !(ds.mount && ds.toggle === '')),
    // Botones ⌘ propios de cada pata: biz/clearchannel, admira.tv, admira.app/yokup, pixeria/studio, store.
    toggle: ds.toggle == null ? '#header-expert-toggle,#af-ico-bottom,.yk-ico-exp,.pf-ico[title^="Expert"],.pix-nav-icon-expert,#xsExpertToggle' : ds.toggle
  };
  var DOCK_KEY = 'ax-experto-abierto';
  // Abierto/cerrado solo en la pestaña: en una visita nueva el Experto siempre empieza cerrado.
  function dockStore() { try { return root.sessionStorage; } catch (_) { return null; } }
  // Hasta el 6-oct-2026 las patas con línea lo guardaban en localStorage y lo reabrían en cada visita.
  try { root.localStorage.removeItem(DOCK_KEY); } catch (_) {}
  // Sin data-engine, el nombre sale de la pata: admira.biz → «ADMIRA BIZ ENGINE».
  cfg.engine = ds.engine || (cfg.pata.replace(/\.pages\.dev$/, '').split('.').slice(-2).join(' ').toUpperCase() + ' ENGINE');
  var state = '', version = '', extra = {}, panel = null;
  var lang = function () { return (document.documentElement.lang || 'es').slice(0, 2) === 'en' ? 'en' : 'es'; };
  var T = function (es, en) { return lang() === 'en' ? en : es; };

  // ─── Idioma / language (Carlos, 5-oct-2026) ───
  // /idioma y /language (y typo /languague) alternan o fijan ESP↔ENG.
  // Acepta barra o no, args separados o pegados (idiomaESP, /languageENG…).
  var LANG_VERBS = /^(idioma|language|languague|lang)$/i;
  function normalizeLangToken(s) {
    var n = String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
    if (!n) return '';
    if (/^(en|eng|english|ingles)$/.test(n)) return 'en';
    if (/^(es|esp|spa|spanish|espanol|castellano)$/.test(n)) return 'es';
    return null;
  }
  // null = no es comando de idioma; {ok:false,usage} = verbo sí, arg inválido; {ok:true,lang} = aplicar.
  function parseLangCommand(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return null;
    var body = raw.replace(/^\//, '').trim();
    var m = body.match(/^(idioma|language|languague|lang)(?:[\s_-]*(.*))?$/i);
    if (!m) return null;
    var token = normalizeLangToken(m[2] || '');
    if (token === null) {
      return {ok: false, usage: true, verb: m[1].toLowerCase()};
    }
    var next = token || (lang() === 'en' ? 'es' : 'en');
    return {ok: true, lang: next, verb: m[1].toLowerCase(), toggled: !token};
  }
  function langMessage(l) {
    return l === 'en' ? 'Language: English' : 'Idioma: español';
  }
  function langUsage() {
    return T(
      'Usa /idioma o /language (toggle), /idioma ESP|ENG (o es|en). También languageENG, idiomaESP…',
      'Use /idioma or /language (toggle), /idioma ESP|ENG (or es|en). Also languageENG, idiomaESP…'
    );
  }
  // Una demo en curso (overlay de /demo 1 o recorrido ?ax_demo=) no puede
  // recargar: location.assign a /en/ tiraba el paso y la dejaba inactiva.
  function demoEnCurso() {
    if(root.PixeriaUpdatesDemo) return true;
    try { if (recorrido && recorrido.activo) return true; } catch (_) {}
    try {
      var n = root.AdmiraDemoControl && root.AdmiraDemoControl.state && root.AdmiraDemoControl.state();
      if (n && n.activo) return true;
    } catch (_) {}
    try { if (document.getElementById('ax-demo-muestra') || document.getElementById('admira-native-demo')) return true; } catch (_) {}
    try { if (new URLSearchParams(location.search).get('ax_demo')) return true; } catch (_) {}
    return false;
  }
  // Aplica el idioma a la ficha, a la pata (si expone API) y avisa a quien escuche.
  function applyLang(next) {
    var l = next === 'en' ? 'en' : 'es';
    document.documentElement.lang = l;
    try {
      if (typeof root.setLanguage === 'function') root.setLanguage(l);
      else if (typeof root.setLang === 'function') root.setLang(l);
      else if (typeof root.applyHtmlLang === 'function') root.applyHtmlLang(l);
    } catch (_) {}
    try { root.localStorage.setItem('xtanco_lang', l); } catch (_) {}
    try { root.localStorage.setItem('omnip-lang', l); } catch (_) {}
    // Preferencia explícita del Experto, compartida con pixeria / admira.studio (assets/site-nav.js la
    // lee antes de su auto-redirect a /en/; sin ella, /language ESP en pixeria rebotaba al inglés).
    try { root.localStorage.setItem('admiranext_expert_lang', l); } catch (_) {}
    // Con demo viva se traduce aquí: el mismo paso, el otro idioma, sin recargar.
    var quedarse = demoEnCurso();
    // La pata sabe mejor que el hreflang adónde ir (origen actual, ?lang=es, query conservado).
    var paginaSabe = false;
    if (!quedarse) try {
      var I = root.PixeriaIdioma;
      if (I && typeof I.url === 'function') {
        paginaSabe = true;
        var dest = I.url(l);
        if (dest) { location.assign(dest); return l; }
      }
    } catch (_) {}
    if (!quedarse) try {
      var link = paginaSabe ? null : document.querySelector('link[rel="alternate"][hreflang="' + l + '"]');
      if (link && link.href) {
        var target = new URL(link.href, location.href);
        if (target.origin === location.origin) {
          var cur = (location.pathname.replace(/\/$/, '') || '/');
          var want = (target.pathname.replace(/\/$/, '') || '/');
          if (cur !== want) {
            location.assign(target.pathname + target.search + target.hash);
            return l;
          }
        }
      }
    } catch (_) {}
    // Si la URL trae ?lang= (p. ej. al llegar desde /arquitectura en otra pata), lo alineamos para que
    // recargar no devuelva el idioma anterior.
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('lang') && u.searchParams.get('lang') !== l) {
        u.searchParams.set('lang', l);
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      }
    } catch (_) {}
    try { document.dispatchEvent(new CustomEvent('admiranext:lang', {detail: {lang: l}})); } catch (_) {}
    try { root.dispatchEvent(new CustomEvent('admiranext:lang', {detail: {lang: l}})); } catch (_) {}
    // Contrato de idioma de las patas con contenido bilingüe propio (xpaceos/admira.store:
    // assets/xpace-lang.js escucha admira:languagechange en window y repinta la página).
    try { root.dispatchEvent(new CustomEvent('admira:languagechange', {detail: {lang: l, source: 'admira-experto'}})); } catch (_) {}
    paint();
    if (quedarse) {
      try { if (recorrido && recorrido.pintar) recorrido.pintar(); } catch (_) {}
      try { if (root.AdmiraDemoControl && typeof root.AdmiraDemoControl.idioma === 'function') root.AdmiraDemoControl.idioma(l); } catch (_) {}
    }
    return l;
  }
  function handleLangCommand(text, log) {
    var parsed = parseLangCommand(text);
    if (!parsed) return false;
    if (!parsed.ok) {
      if (log) out(log, langUsage(), 'err');
      return true;
    }
    applyLang(parsed.lang);
    if (log) out(log, langMessage(parsed.lang));
    return true;
  }
  if (typeof root.AdmiraSetLanguage !== 'function') {
    root.AdmiraSetLanguage = function (l) { return applyLang(l); };
  } else {
    var _prevSetLang = root.AdmiraSetLanguage;
    root.AdmiraSetLanguage = function (l) {
      try { _prevSetLang(l); } catch (_) {}
      return applyLang(l);
    };
  }


  function cliente() {
    try {
      var M = root.AdmiraMarca, a = M && typeof M.actual === 'function' && M.actual();
      if (a) return a.nombre || a.name || a.id || a.slug;
    } catch (_) {}
    if (marcaSel) return marcaSel.nombre || marcaSel.id;
    try {
      var q = new URL(location.href).searchParams.get('marca');
      if (q) return q;
      var m = location.pathname.match(/\/marca\/([^\/?#]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (_) {}
    return T('de serie (Admira)', 'default (Admira)');
  }
  function readVersion() {
    // Opt-in por sitio (admiranext.com, 06-10-2026): con <html data-version-oculta="1"> la versión
    // solo se enseña a usuarios con sesión; el anónimo recibe una respuesta neutra. Sin el atributo
    // (el resto de la suite) nada cambia.
    if (document.documentElement.dataset.versionOculta === '1') return T('solo con sesión', 'signed-in users only');
    var v = document.documentElement.dataset.version;
    var meta = document.querySelector('meta[name="admiranext-version"]');
    if (!v && meta && !/__/.test(meta.content)) v = meta.content;
    return v || version || '—';
  }
  function lines() {
    var out = [
      cfg.engine,
      'version: ' + readVersion(),
      T('pata: ', 'leg: ') + cfg.pata,
      T('cliente: ', 'client: ') + cliente(),
      T('cerebro: ', 'brain: ') + 'admiranext.com',
      'host: ' + location.host,
      T('idioma: ', 'language: ') + lang()
    ];
    Object.keys(extra).forEach(function (k) { out.push(k + ': ' + extra[k]); });
    out.push(T('estado: ', 'status: ') + (state || T('listo', 'ready')));
    return out;
  }
  function paint() {
    var pre = panel && panel.querySelector('.ax-engine');
    if (pre) pre.textContent = lines().join('\n');
    var hi = panel && panel.querySelector('.ax-hello');
    if (hi) hi.textContent = helloText();
    // El título sigue al idioma en vivo (antes solo se fijaba al montar la piel).
    var ti = panel && panel.querySelector('.ax-title');
    if (ti) ti.textContent = '⌘ ' + T('EXPERTO', 'EXPERT') + ' · CLI';
    var xb = panel && panel.querySelector('.ax-extras-btn');
    if (xb) xb.textContent = (panel.classList.contains('ax-extras-on') ? '－ ' : '＋ ') + extrasLabel();
  }
  function extrasLabel() { return cfg.extrasLabel || (cfg.mount ? T('vista', 'view') : T('verbos', 'verbs')); }
  function helloText() { return T('CLI de ', 'CLI of ') + cfg.cli + ' · ADmiraNeXT · ' + T('escribe /help', 'type /help'); }
  function hello(log) {
    if (!log || log.querySelector('.ax-hello')) return;
    var tag = /^(OL|UL)$/.test(log.tagName) ? 'li' : 'div';
    var row = document.createElement(tag);
    row.className = 'ax-hello';
    row.textContent = helloText();
    log.insertBefore(row, log.firstChild);
  }
  function tagAll(sel, cls, scope) {
    if (!sel) return;
    try { (scope || panel).querySelectorAll(sel).forEach(function (n) { n.classList.add(cls); }); } catch (_) {}
  }

  // ─── Modo propio: CLI de la suite para patas que no traen el suyo ───
  var verbs = [];
  var adapters = Object.create(null), localDemos = Object.create(null), adapterOwnsInput = false;
  var reserved = ['help','ayuda','?','demo','demos','idioma','language','languague','lang','arquitectura','architecture','organigrama-tecnologico','tech-chart'];
  function registerAdapter(def) {
    if (!def || !/^[a-z0-9-]+$/i.test(def.id || '')) throw Error('Invalid command adapter');
    if (adapters[def.id]) return;
    adapters[def.id]=def;
    adapterOwnsInput=true;
    (def.verbs || []).forEach(function(action){
      if(reserved.indexOf(String(action.name).toLowerCase())>=0)return;
      var aliases=(action.alias || []).filter(function(alias){return reserved.indexOf(String(alias).toLowerCase())<0;});
      verb(Object.assign({},action,{name:String(action.name).toLowerCase(),alias:aliases.map(function(alias){return String(alias).toLowerCase();})}));
    });
    (def.demos || []).forEach(function(action){
      if (!/^[a-z0-9-]*$/i.test(action.name || '') || /^(ios|editor|global|help|ayuda|lista|list)$/.test(action.name)) throw Error('Reserved demo action');
      localDemos[action.name]=action;
    });
  }
  function demoExtensionHelp(){return Object.keys(localDemos).filter(function(name){return name&&!/^(pausa|pause|reanudar|resume|siguiente|next|estado|status|stop|off)$/.test(name);}).map(function(name){return '/demo '+name;}).join(' · ');}
  function recordCommand(text) {
    Object.keys(adapters).forEach(function(id){if(adapters[id].onCommand)adapters[id].onCommand(text);});
  }
  function localDemoAction(args, log) {
    var name=String(args[0] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''), action=localDemos[name];
    if (!action || (action.when && !action.when())) return null;
    var result=action.run(args.slice(name?1:0),log);
    return {handled:true,result:result};
  }

  var MARCAS = 'https://www.admiranext.com/marcablanca/api/marcas';
  var marcaSel = null;
  try { marcaSel = JSON.parse(sessionStorage.getItem('ax-experto-marca') || 'null'); } catch (_) {}
  function verb(v) { var names=[v.name].concat(v.alias||[]);verbs = verbs.filter(function(x){return x.name!==v.name&&names.indexOf(x.name)<0;}).map(function(x){return Object.assign({},x,{alias:(x.alias||[]).filter(function(a){return names.indexOf(a)<0;})});});verbs.push(v); }
  // ─── Verbos bilingües (Carlos, 06-10-2026 10:58) ───
  // Cada verbo vale en castellano y en inglés (/marca = /brand, /ayuda = /help, /limpiar = /clear…).
  // Usar la forma castellana pone la web en castellano y la inglesa en inglés, con el mismo applyLang
  // de /idioma. Lo que se escribe igual en los dos idiomas (/version, /avatar, /cli…) y los atajos
  // /81…/89 no tocan el idioma. Forma compacta: /marca84 = /marca 84, /brandoff = /brand off.
  // /idioma y /language siguen con su contrato propio (sin argumento alternan; con ESP|ENG fijan).
  var PARES_ES_EN = [['ayuda', 'help'], ['marca', 'brand'], ['ir', 'go'], ['estado', 'status'], ['limpiar', 'clear']];
  var COMPACTO = /^(marca|brand)(off|[a-z0-9][a-z0-9_-]*)$/;
  function idiomaDeVerbo(name) {
    for (var i = 0; i < PARES_ES_EN.length; i++) {
      if (PARES_ES_EN[i][0] === name) return 'es';
      if (PARES_ES_EN[i][1] === name) return 'en';
    }
    return null;
  }
  function parDe(name) {
    for (var i = 0; i < PARES_ES_EN.length; i++) {
      if (PARES_ES_EN[i][0] === name) return PARES_ES_EN[i][1];
      if (PARES_ES_EN[i][1] === name) return PARES_ES_EN[i][0];
    }
    return '';
  }
  function findVerb(name) { return verbs.filter(function (x) { return x.name === name || (x.alias || []).indexOf(name) >= 0; })[0]; }
  // «/marca84» → {name: 'marca', parts: ['84']}; null si no es forma compacta de un verbo conocido.
  function compacto(name) {
    var m = COMPACTO.exec(name);
    return m && findVerb(m[1]) ? {name: m[1], arg: m[2]} : null;
  }
  function out(log, text, cls) {
    String(text).split('\n').forEach(function (line) {
      var li = document.createElement('li');
      li.className = cls || '';
      li.textContent = line;
      log.appendChild(li);
    });
    while (log.children.length > 200) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  function navItems() {
    var N = root.AdmiraNav, items = [];
    try { (N && (N.items || N.ITEMS || N.nav || [])).forEach(function (it) { if (it && it.h) items.push(it); }); } catch (_) {}
    return items;
  }
  verb({name: 'help', alias: ['?', 'ayuda'], desc: ['esta lista', 'this list'], run: function (a, log) {
    if (/^(?:demo\s+)?ios$/i.test(a.join(' ').trim())) { out(log, iosHelp()); return; }
    out(log, verbs.map(function (v) { var par = parDe(v.name); return '/' + v.name + (par ? ' · /' + par : '') + (v.args ? ' ' + v.args : '') + ' — ' + T(v.desc[0], v.desc[1]); }).join('\n') +
      '\n' + T('Cada verbo vale en castellano o en inglés: el castellano pone la web en castellano y el inglés en inglés. /marca84 = /marca 84.',
        'Every verb works in Spanish or English: the Spanish one switches the site to Spanish, the English one to English. /brand84 = /brand 84.'));
  }});
  verb({name: 'marca', alias: ['brand', 'marcablanca'], args: '<id>|off|lista', desc: ['marca blanca del catálogo de admiranext.com (cliente de la ficha)', 'white label from the admiranext.com catalogue'], run: function (a, log) {
    var id = (a[0] || '').toLowerCase();
    var M = root.AdmiraMarca;
    if (id === 'list') id = 'lista';
    if (M && typeof M.activar === 'function' && id && id !== 'lista') {
      if (id === 'off') { M.desactivar(); out(log, T('Vuelves a la identidad de serie.', 'Back to the default identity.')); paint(); return; }
      out(log, T('Aplicando la marca ', 'Applying brand ') + id + '…');
      return Promise.resolve(M.activar(id)).then(function (r) { out(log, r && r.ok ? T('Marca ', 'Brand ') + id + T(' activa.', ' active.') : T('No se pudo aplicar ', 'Could not apply ') + id, r && r.ok ? '' : 'err'); paint(); });
    }
    if (id === 'off') { marcaSel = null; try { sessionStorage.removeItem('ax-experto-marca'); } catch (_) {} paint(); out(log, T('Marca retirada: vuelves a Admira.', 'Brand removed: back to Admira.')); return; }
    return fetch(MARCAS, {cache: 'no-store'}).then(function (r) { return r.json(); }).then(function (j) {
      var list = (j && j.clientes) || [];
      if (!id || id === 'lista') { out(log, T('Marcas: ', 'Brands: ') + list.map(function (c) { return c.id; }).join(' · ')); return; }
      var c = list.filter(function (x) { return x.id === id; })[0];
      if (!c) { out(log, T('No hay marca «', 'No brand «') + id + T('». /marca lista enseña el catálogo.', '». /marca lista shows the catalogue.'), 'err'); return; }
      marcaSel = {id: c.id, nombre: c.nombre};
      try { sessionStorage.setItem('ax-experto-marca', JSON.stringify(marcaSel)); } catch (_) {}
      paint();
      document.dispatchEvent(new CustomEvent('admira:marca', {detail: marcaSel}));
      out(log, T('Marca ', 'Brand ') + c.nombre + ' (' + c.id + T(') activa en la ficha de esta pestaña; /marca off vuelve a Admira.', ') active in this tab\'s card; /marca off returns to Admira.'));
    }).catch(function () { out(log, T('El catálogo de marcas no responde.', 'The brand catalogue is not answering.'), 'err'); });
  }});
  verb({name: 'ir', alias: ['go'], args: '<sección>', desc: ['abre una sección de esta web (sin argumento: lista)', 'open a section of this site (no argument: list)'], run: function (a, log) {
    var items = navItems(), k = (a[0] || '').toLowerCase();
    if (!k) { out(log, items.length ? items.map(function (i) { return (i.k || '?') + ' → ' + i.h; }).join('\n') : T('Esta página no publica secciones.', 'This page lists no sections.')); return; }
    var hit = items.filter(function (i) { return (i.k || '').toLowerCase() === k || (i.t || '').toLowerCase() === k; })[0];
    if (!hit) { out(log, T('Sección desconocida: ', 'Unknown section: ') + k + T(' · /ir para la lista', ' · /ir for the list'), 'err'); return; }
    out(log, T('Abriendo ', 'Opening ') + hit.h + '…'); setTimeout(function () { location.assign(hit.h); }, 250);
  }});
  verb({name: 'estado', alias: ['status'], desc: ['ficha del motor en el registro', 'engine card into the log'], run: function (a, log) { out(log, lines().join('\n')); }});
  verb({name: 'version', desc: ['sello de la release', 'release stamp'], run: function (a, log) { out(log, readVersion()); }});
  verb({name: 'idioma', alias: ['language', 'languague', 'lang'], args: '[ESP|ENG|es|en]', desc: ['idioma de la ficha y del CLI (sin arg: alterna)', 'language of the card and CLI (no arg: toggle)'], run: function (a, log) {
    var joined = (a && a.length) ? a.join(' ') : '';
    var parsed = parseLangCommand('idioma' + (joined ? ' ' + joined : ''));
    if (!parsed || !parsed.ok) { out(log, langUsage(), 'err'); return; }
    applyLang(parsed.lang);
    out(log, langMessage(parsed.lang));
  }});
  verb({name: 'limpiar', alias: ['clear', 'cls'], desc: ['vacía el registro', 'clear the log'], run: function (a, log) { log.textContent = ''; hello(log); }});
  // ─── /arquitectura · /architecture (Carlos, 9-oct-2026 06:12) ───
  // Abre el organigrama tecnológico de admiranext.com desde cualquier web de la Suite, en la misma
  // pestaña (como /demo global). El verbo castellano lo abre en castellano y el inglés en inglés:
  // el idioma viaja en ?lang= porque el localStorage no cruza de dominio.
  var ARQ_URL = 'https://www.admiranext.com/arquitectura';
  var ARQ_RE = /^\/?(arquitectura|architecture|organigrama-tecnologico|tech-chart)$/i;
  function arquitecturaUrl(l) {
    var base = /(^|\.)admiranext\.com$/i.test(location.hostname) ? '/arquitectura' : ARQ_URL;
    return base + '?lang=' + (l === 'en' ? 'en' : 'es');
  }
  function irArquitectura(l, log) {
    l = l === 'en' ? 'en' : 'es';
    try { root.localStorage.setItem('admiranext_expert_lang', l); } catch (_) {}
    var url = arquitecturaUrl(l);
    out(log, l === 'en' ? 'Opening the technology org chart · ' + ARQ_URL : 'Abriendo el organigrama tecnológico · ' + ARQ_URL);
    setTimeout(function () { location.assign(url); }, 250);
    return url;
  }
  function parseArquitectura(text) {
    var m = String(text == null ? '' : text).trim().match(ARQ_RE);
    if (!m) return null;
    return /^(architecture|tech-chart)$/i.test(m[1]) ? 'en' : 'es';
  }
  verb({name: 'arquitectura', alias: ['organigrama-tecnologico'], desc: ['abre el organigrama tecnológico de admiranext.com en castellano', 'opens the admiranext.com technology org chart in Spanish'], run: function (a, log) { irArquitectura('es', log); }});
  verb({name: 'architecture', alias: ['tech-chart'], desc: ['abre el organigrama tecnológico de admiranext.com en inglés', 'opens the admiranext.com technology org chart in English'], run: function (a, log) { irArquitectura('en', log); }});

  // ─── /demo · las cinco soluciones (Carlos, 7-oct-2026, demo Alsea · Starbucks España y México) ───
  // Mismo patrón que /demo tpv de admira.store: una orden encarga que se enseñe una funcionalidad.
  // /demo lista las cinco; /demo <solución|1-5> abre su demo; /demo siguiente salta a la siguiente.
  // El avatar digital (assets/avatar.js + digitalavatar.ai) usa este mismo catálogo: AdmiraExperto.demos().
  // Lo que no es una solución (/demo tpv, /demo off…) sigue siendo de la pata.
  var DEMOS = [
    {id: 'studio', alias: ['pixeria', 'contenido', 'contenidos', 'creatividad'], nombre: 'admira.studio',
      hosts: /(^|\.)(admira\.studio|pixeria\.com)$/,
      desc: ['Contenidos con IA: locución, música, imagen, vídeo y adaptación de formatos', 'AI content: voiceover, music, image, video and format adaptation'],
      url: ['https://www.admira.studio/']},
    {id: 'store', alias: ['tienda', 'xpace', 'xpaceos', 'gemelo', 'twin'], nombre: 'admira.store',
      hosts: /(^|\.)(admira\.store|xpaceos\.com)$/,
      desc: ['Gemelo digital del Starbucks de Alsea en Matrix: arranca /demo tpv, un muffin a caja que dispara música y pantallas', 'Digital twin of the Alsea Starbucks in Matrix: starts /demo tpv, a muffin to the register that triggers music and screens'],
      url: ['https://www.admira.store/admira-xp/?marca=starbucks&loc=alsea-sbux-021&project=starbucks&circuit=alsea_starbucks&lang=es&demo=tpv#tpv',
        'https://www.admira.store/admira-xp/?marca=starbucks&loc=alsea-sbux-021&project=starbucks&circuit=alsea_starbucks&lang=en&demo=tpv#tpv']},
    {id: 'tv', alias: ['canal', 'adcelerate', 'calle', 'videoanalytics'], nombre: 'admira.tv',
      hosts: /(^|\.)admira\.tv$/,
      desc: ['Starbucks Passeig de Gràcia 103 desde la calle: el halo de la fachada entra en Matrix', 'Starbucks Passeig de Gràcia 103 from the street: the entrance halo opens Matrix'],
      url: ['https://admira.tv/adcelerate/demo/?view=human&site=starbucks']},
    {id: 'app', alias: ['yokup', 'operaciones', 'itil', 'incidencias', 'retailer'], nombre: 'admira.app',
      hosts: /(^|\.)(admira\.app|yokup\.com)$/,
      desc: ['Operación de la red Starbucks: equipos, incidencias ITIL y estado de cada tienda', 'Starbucks network operations: equipment, ITIL incidents and each store\'s status'],
      url: ['https://www.admira.app/retailer?marca=starbucks']},
    {id: 'biz', alias: ['negocio', 'clearchannel', 'retailmedia', 'comercial'], nombre: 'admira.biz',
      hosts: /(^|\.)(admira\.biz|clearchannel\.tv)$/,
      desc: ['Comercialización: retail media y campañas de marca sobre las pantallas de la red', 'Monetisation: retail media and brand campaigns across the network screens'],
      url: ['https://www.admira.biz/']}
  ];
  function demoUrl(d) { return d.url[lang() === 'en' && d.url[1] ? 1 : 0]; }
  function demoLaunchUrl(d) {
    var u = new URL(demoUrl(d));
    u.searchParams.set('lang',lang());
    u.searchParams.set('ax_demo', d.id);
    u.searchParams.set('ax_run', Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9));
    if (d.id === 'store') { if(u.searchParams.get('demo')==='tpv')u.searchParams.delete('demo');if(u.hash==='#tpv')u.hash=''; } // The native TPV routine must not compete with the controlled walkthrough.
    return u.href;
  }
  function demoActual() { for (var i = 0; i < DEMOS.length; i++) if (DEMOS[i].hosts.test(host)) return i; return -1; }
  function norm(t) { return String(t == null ? '' : t).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // ─── Subdemos locales de la plataforma (encargos de Trinity del 7-oct-2026: activar /demo en admira.studio) ───
  // En los hosts de una plataforma con manifiesto, /demo 1…5 y sus alias son LOCALES de esa plataforma
  // (admira.studio y pixeria.com = studio: 1 voz/locución, 2 música, 3 imagen, 4 vídeo, 5 adaptar), y
  // /demo help lista solo esas. Los nombres de las cinco soluciones (/demo store…) siguen valiendo.
  // Manifiesto {version, plataforma, activacion:{hosts}, default_mode, subdemos:[{id, letra, nombre, desc, url,
  // aliases, muestra:{tipo, url, poster, variantes:[{formato, url}]}, guion, steps}]} (pixeria demo/studio.subdemos.json);
  // contrato de resolución = pixeria demo/studio-comandos.mjs. Sin manifiesto publicado, este catálogo fijo.
  var LOCALES = {
    // Literal published manifests also support rehearsals without a catalog request.
    store: {manifiestos: ["https://www.admiranext.com/subdemos/store.subdemos.json"], m: {"version":1,"plataforma":"store","nombre":"admira.store","default_mode":"recorrido","activacion":{"hosts":["admira.store","www.admira.store","xpaceos.com","www.xpaceos.com"]},"subdemos":[{"id":"voz","letra":"a","nombre":"Gestión de locuciones","desc":"Seleccionar una locución, asignarla a una zona y preparar su horario.","url":"https://www.admira.store/admira-xp/?marca=starbucks&loc=alsea-sbux-021&project=starbucks&circuit=alsea_starbucks&lang=es","cmd":"/demo 1","aliases":["locucion","locuciones","voz"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=store&demo=voz","guion":[{"accion":"di","texto":"Abrir el local de demostración y su gestión de audio."},{"accion":"señala","texto":"Seleccionar la locución preparada de café y bollería; escucharla."},{"accion":"señala","texto":"Asignar entrada y caja, volumen 65 y horario de desayuno."},{"accion":"señala","texto":"Revisar la programación y el resultado antes de activarlo."}],"steps":[],"caso":{"local":"alsea-sbux-021","contenido":"Locución de desayuno","destinos":["Entrada","Caja"],"volumen":65,"horario":"08:00–11:00","estado":"Programación de ejemplo preparada"},"muestra":{"tipo":"audio","url":"https://www.pixeria.com/assets/demos/studio-v1/locucion-es.mp3","descripcion":"Locución preparada para el ensayo; programación de ejemplo."},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/store-voz.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/store-voz.jpg","duracion":32,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"musica","letra":"b","nombre":"Gestión de música","desc":"Seleccionar la playlist del local, zonas, volumen y franjas horarias.","url":"https://www.admira.store/admira-xp/?marca=starbucks&loc=alsea-sbux-021&project=starbucks&circuit=alsea_starbucks&lang=es","cmd":"/demo 2","aliases":["musica","playlist","hilo musical"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=store&demo=musica","guion":[{"accion":"di","texto":"Abrir la gestión del hilo musical del local."},{"accion":"señala","texto":"Escuchar el ambiente musical preparado y seleccionarlo."},{"accion":"señala","texto":"Asignar sala y terraza, volumen 45 y la franja de tarde."},{"accion":"señala","texto":"Revisar cómo conviven música y locución en la programación."}],"steps":[],"caso":{"local":"alsea-sbux-021","playlist":"Ambiente de cafetería","destinos":["Sala","Terraza"],"volumen":45,"horario":"16:00–20:00","prioridad":"La locución atenúa temporalmente la música"},"muestra":{"tipo":"audio","url":"https://www.pixeria.com/assets/demos/studio-v1/musica-cafe.mp3","descripcion":"Pista preparada para ilustrar la gestión del hilo musical."},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/store-musica.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/store-musica.jpg","duracion":27,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"imagenes","letra":"c","nombre":"Gestión de imágenes","desc":"Seleccionar creatividades, organizarlas en playlist y asignar pantallas.","url":"https://www.admira.store/admira-xp/?marca=starbucks&loc=alsea-sbux-021&project=starbucks&circuit=alsea_starbucks&lang=es","cmd":"/demo 3","aliases":["imagen","imagenes","creatividades"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=store&demo=imagenes","guion":[{"accion":"di","texto":"Abrir la gestión de contenidos visuales del local."},{"accion":"señala","texto":"Seleccionar la creatividad de café preparada."},{"accion":"señala","texto":"Asignarla a la pantalla de entrada y fijar su orden en la playlist."},{"accion":"señala","texto":"Revisar el calendario y la vista previa de la pantalla."}],"steps":[],"caso":{"local":"alsea-sbux-021","contenido":"Creatividad de café","destinos":["Pantalla de entrada"],"playlist":"Campaña de desayuno","orden":1,"horario":"08:00–11:00"},"muestra":{"tipo":"image","url":"https://www.pixeria.com/assets/demos/studio-v1/imagen-cafe.jpg","descripcion":"Creatividad preparada para el ensayo de gestión."},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/store-imagenes.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/store-imagenes.jpg","duracion":26,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"video","letra":"d","nombre":"Gestión de vídeo","desc":"Ordenar clips en playlist, asignar destinos y comprobar su reproducción.","url":"https://www.admira.store/admira-xp/?marca=starbucks&loc=alsea-sbux-021&project=starbucks&circuit=alsea_starbucks&lang=es","cmd":"/demo 4","aliases":["video","videos","clip"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=store&demo=video","guion":[{"accion":"di","texto":"Abrir la playlist de vídeo del local."},{"accion":"señala","texto":"Previsualizar el clip preparado de la campaña."},{"accion":"señala","texto":"Asignarlo a la pantalla de pared y colocarlo después de la imagen."},{"accion":"señala","texto":"Revisar la reproducción y la programación por destino."}],"steps":[],"caso":{"local":"alsea-sbux-021","contenido":"Clip de campaña de café","destinos":["Pantalla de pared"],"playlist":"Campaña de desayuno","orden":2,"reproduccion":"Bucle dentro de la playlist"},"muestra":{"tipo":"video","url":"https://www.pixeria.com/assets/demos/studio-v1/video-fuente.mp4","poster":"https://www.pixeria.com/assets/demos/studio-v1/video-fuente.jpg","descripcion":"Clip preparado para el ensayo de gestión."},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/store-video.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/store-video.jpg","duracion":25,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"tpv","letra":"e","nombre":"Gestión del TPV","desc":"Seleccionar un producto y enseñar su relación con audio, pantallas y reglas del local.","url":"https://www.admira.store/admira-xp/?marca=starbucks&loc=alsea-sbux-021&project=starbucks&circuit=alsea_starbucks&lang=es&demo=tpv#tpv","cmd":"/demo 5","aliases":["caja","tpv","venta"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=store&demo=tpv","guion":[{"accion":"di","texto":"Abrir el TPV del gemelo de demostración."},{"accion":"señala","texto":"Seleccionar un muffin para mostrar la operación en caja."},{"accion":"señala","texto":"Revisar la regla que relaciona el producto con su campaña."},{"accion":"señala","texto":"Comprobar los destinos de audio y vídeo asociados en este ensayo."}],"steps":[],"caso":{"local":"alsea-sbux-021","producto":"Muffin","evento":"Selección de producto en TPV","regla":"Si se selecciona el muffin, mostrar la campaña asociada","destinos":["Caja","Pantalla de pared","Altavoces"]},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/store-tpv.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/store-tpv.jpg","duracion":30,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}}],"nota":"Recorridos preparados con datos de demostración. El ensayo conserva cambios solo en esta sesión; el alta o la activación real se revisa en la plataforma."}},
    biz: {manifiestos: ["https://www.admiranext.com/subdemos/biz.subdemos.json"], m: {"version":1,"plataforma":"biz","nombre":"admira.biz","default_mode":"recorrido","activacion":{"hosts":["admira.biz","www.admira.biz","clearchannel.tv","www.clearchannel.tv"]},"subdemos":[{"id":"proyecto","letra":"a","nombre":"Dar de alta un proyecto","desc":"Definir el identificador, nombre, responsable y circuito del proyecto.","url":"https://www.admiranext.com/xpace/manage","cmd":"/demo 1","aliases":["proyecto","alta proyecto"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=biz&demo=proyecto","guion":[{"accion":"di","texto":"Abrir la gestión de proyectos y preparar un alta de demostración."},{"accion":"señala","texto":"Definir un identificador estable y un nombre reconocible."},{"accion":"señala","texto":"Relacionar el proyecto con su circuito y revisar su responsable."},{"accion":"señala","texto":"Validar los datos preparados antes de dar el alta real."}],"steps":[],"caso":{"id":"demo-alsea-retail","nombre":"Alsea · Retail Media","responsable":"Equipo de demostración","circuito":"demo-alsea-dooh","estado":"Ficha de ejemplo preparada"},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/biz-proyecto.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/biz-proyecto.jpg","duracion":26,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"circuito","letra":"b","nombre":"Dar de alta un circuito DooH","desc":"Agrupar puntos DooH y definir el vuelo de la campaña con fechas, franjas y frecuencia.","url":"https://www.admiranext.com/xpace/manage","cmd":"/demo 2","aliases":["circuito","dooh","vuelo"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=biz&demo=circuito","guion":[{"accion":"di","texto":"Preparar el circuito vinculado al proyecto de demostración."},{"accion":"señala","texto":"Añadir sus diferentes puntos DooH: entrada, escaparate y tótem."},{"accion":"señala","texto":"Definir el vuelo: inicio y fin, franjas, duración de pieza y frecuencia."},{"accion":"señala","texto":"Revisar cobertura por punto y el calendario del vuelo de ejemplo."}],"steps":[],"caso":{"id":"demo-alsea-dooh","proyecto":"demo-alsea-retail","puntos":[{"id":"dooh-entrada","tipo":"Pantalla de entrada"},{"id":"dooh-escaparate","tipo":"Pantalla de escaparate"},{"id":"dooh-totem","tipo":"Tótem"}],"vuelo":{"inicio":"2026-11-01","fin":"2026-11-14","franjas":["08:00–11:00","16:00–20:00"],"pieza_segundos":15,"frecuencia":"Una inserción por bloque de ejemplo"}},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/biz-circuito.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/biz-circuito.jpg","duracion":25,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"gemelo","letra":"c","nombre":"Dar de alta gemelos digitales · Retail Media","desc":"Representar el local, sus zonas y el inventario de soportes de Retail Media.","url":"https://www.admira.biz/backoffice.html","cmd":"/demo 3","aliases":["gemelo","gemelos","retailmedia","retail media"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=biz&demo=gemelo","guion":[{"accion":"di","texto":"Preparar la ficha del local y su relación con el proyecto."},{"accion":"señala","texto":"Definir las zonas comerciales y sus soportes de Retail Media."},{"accion":"señala","texto":"Asociar el gemelo digital a la ubicación de demostración."},{"accion":"señala","texto":"Revisar qué soportes del gemelo se pueden incluir en una campaña."}],"steps":[],"caso":{"gemelo":"alsea-sbux-021","proyecto":"demo-alsea-retail","zonas":["Entrada","Caja","Sala"],"retail_media":[{"zona":"Entrada","soporte":"Pantalla"},{"zona":"Caja","soporte":"Pantalla TPV"},{"zona":"Sala","soporte":"Tótem"}]},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/biz-gemelo.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/biz-gemelo.jpg","duracion":26,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"iot","letra":"d","nombre":"Dar de alta dispositivos IoT","desc":"Relacionar pantallas, altavoces, cámaras y tótems con el gemelo y sus controles.","url":"https://www.admira.biz/backoffice.html","cmd":"/demo 4","aliases":["iot","dispositivos","pantallas","altavoces","camaras","totem"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=biz&demo=iot","guion":[{"accion":"di","texto":"Preparar el alta de dispositivos del gemelo."},{"accion":"señala","texto":"Identificar pantalla, altavoz, cámara y tótem con IDs únicos."},{"accion":"señala","texto":"Asignar zona, tipo de dispositivo y control previsto."},{"accion":"señala","texto":"Revisar conectividad, estado y relación con el inventario tecnológico."}],"steps":[],"caso":{"gemelo":"alsea-sbux-021","dispositivos":[{"id":"demo-screen-01","tipo":"Pantalla","zona":"Entrada","control":"Contenido y estado"},{"id":"demo-speaker-01","tipo":"Altavoz","zona":"Sala","control":"Audio y volumen"},{"id":"demo-camera-01","tipo":"Cámara","zona":"Entrada","control":"Estado y disponibilidad"},{"id":"demo-totem-01","tipo":"Tótem","zona":"Sala","control":"Contenido e interacción"}]},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/biz-iot.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/biz-iot.jpg","duracion":27,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"itil","letra":"e","nombre":"Integrar en el inventario tecnológico · ITIL","desc":"Registrar los dispositivos como elementos de configuración y relacionar ubicación, servicio y mantenimiento.","url":"https://www.xpaceos.com/inventario/starbucks/?view=references","cmd":"/demo 5","aliases":["itil","inventario","tecnologia"],"duracion":60,"ensayo_url":"https://www.admiranext.com/subdemos/ensayo.html?plataforma=biz&demo=itil","guion":[{"accion":"di","texto":"Abrir el inventario tecnológico de la ubicación."},{"accion":"señala","texto":"Preparar una referencia de configuración para cada dispositivo del gemelo."},{"accion":"señala","texto":"Relacionar servicio, responsable y dependencias entre los elementos."},{"accion":"señala","texto":"Revisar estado y vínculo con mantenimiento e incidencias."}],"steps":[],"caso":{"servicio":"Retail Media · local piloto","ubicacion":"alsea-sbux-021","responsable":"Equipo de operaciones de demostración","elementos":[{"ci":"CI-DEMO-SCREEN-01","dispositivo":"demo-screen-01"},{"ci":"CI-DEMO-SPEAKER-01","dispositivo":"demo-speaker-01"},{"ci":"CI-DEMO-CAMERA-01","dispositivo":"demo-camera-01"},{"ci":"CI-DEMO-TOTEM-01","dispositivo":"demo-totem-01"}],"relacion":"Dispositivo → gemelo → servicio","estado":"Inventario de ejemplo preparado"},"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/biz-itil.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/biz-itil.jpg","duracion":26,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}}],"nota":"Recorridos preparados con datos de demostración. El ensayo conserva cambios solo en esta sesión; el alta o la activación real se revisa en la plataforma."}},
    studio: {manifiestos: ["https://www.admiranext.com/subdemos/studio.subdemos.json","https://www.pixeria.com/demo/studio.subdemos.json"], m: {"version":1,"plataforma":"studio","nombre":"Admira Studio / Pixeria","release":"v.07.10.2026.r1.10:00","estado":"preparado_para_incorporar","duracion_total":300,"default_mode":"muestra","asset_resolution":"URLs HTTPS de producción; los recursos nuevos se activan al incorporar y publicar el pack.","subdemos":[{"id":"voz","letra":"a","nombre":"Crear locución","desc":"De un guion breve a una voz lista para escuchar.","url":"https://www.admira.studio/audio.html","mirror_url":"https://www.pixeria.com/audio.html","cmd":"/demo 1","duracion":60,"steps":[],"muestra":{"tipo":"audio","url":"https://www.pixeria.com/assets/demos/studio-v1/locucion-es.mp3","descripcion":"Resultado preparado; este ensayo no realiza generación ni publicación.","variantes":[]},"guion":[{"selector":"","accion":"di","texto":"Escribe el mensaje de tu tienda y elige idioma, voz y tono."},{"selector":"#proj-cliente","accion":"escribe","texto":"Cafetería Demo · café y bollería"},{"selector":"#a-personaje","accion":"escribe","texto":"Voz adulta cálida y cercana"},{"selector":"#a-idioma","accion":"elige","texto":"Espanol (ES)"},{"selector":"#a-tono","accion":"elige","texto":"Cercano"},{"selector":"#a-guion","accion":"escribe","texto":"Bienvenidos a nuestra cafetería. Haz una pausa y disfruta de un café recién hecho. Pregunta por la combinación de café y bollería. Te esperamos."},{"selector":"#playOutput","accion":"señala","texto":"Aquí se crea la locución. Escuchamos la muestra preparada en castellano."}],"ejecucion_real_opcional":{"tool":"crear_locucion","args":{"text":"Bienvenidos a nuestra cafetería. Haz una pausa y disfruta de un café recién hecho. Pregunta por la combinación de café y bollería. Te esperamos.","provider":"free","language_code":"es"},"requires_auth":true,"provider_credit":false},"verificacion":{"require_media":true,"checks":["recurso reproducible","sin generación durante el ensayo","sin publicación durante el ensayo"]},"aliases":["locucion","voz"],"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/studio-voz.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/studio-voz.jpg","duracion":30,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"musica","letra":"b","nombre":"Crear música","desc":"Del ambiente de una marca a su hilo musical.","url":"https://www.admira.studio/musica.html","mirror_url":"https://www.pixeria.com/musica.html","cmd":"/demo 2","duracion":60,"steps":[{"tool":"demo_muestra","args":{"id":"music"},"page":"/musica.html"}],"muestra":{"tipo":"audio","url":"https://www.pixeria.com/assets/demos/studio-v1/musica-cafe.mp3","descripcion":"Resultado preparado; este ensayo no realiza generación ni publicación.","variantes":[]},"guion":[{"selector":"","accion":"di","texto":"Define el ambiente, el estilo y el formato de la música."},{"selector":"#m-versiones","accion":"elige","texto":"Loop instrumental ~15s"},{"selector":"#m-style","accion":"elige","texto":"Blues"},{"selector":"#m-titulo","accion":"escribe","texto":"Una pausa con café"},{"selector":"#m-letra","accion":"escribe","texto":"[Instrumental]\nPiano cálido, guitarra suave y contrabajo. Sin voz."},{"selector":"#playOutput","accion":"señala","texto":"Aquí se genera música nueva. Escuchamos una pieza de cafetería ya preparada."}],"ejecucion_real_opcional":{"tool":"crear_musica","args":{"prompt":"Música instrumental cálida para una cafetería: blues suave, piano, guitarra y contrabajo, ritmo relajado, sin voz ni letra."},"requires_auth":true,"provider_credit":true},"verificacion":{"require_media":true,"checks":["recurso reproducible","sin generación durante el ensayo","sin publicación durante el ensayo"]},"aliases":["musica"],"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/studio-musica.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/studio-musica.jpg","duracion":29,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"imagen","letra":"c","nombre":"Crear imagen","desc":"Del briefing a una creatividad visual.","url":"https://www.admira.studio/imagenes.html","mirror_url":"https://www.pixeria.com/imagenes.html","cmd":"/demo 3","duracion":60,"steps":[{"tool":"demo_muestra","args":{"id":"image"},"page":"/imagenes.html"}],"muestra":{"tipo":"image","url":"https://www.pixeria.com/assets/demos/studio-v1/imagen-cafe.jpg","descripcion":"Resultado preparado; este ensayo no realiza generación ni publicación.","variantes":[]},"guion":[{"selector":"","accion":"di","texto":"Describe producto, escenario, estilo e iluminación."},{"selector":"#proj-cliente","accion":"escribe","texto":"Cafetería Demo · café y bollería"},{"selector":"#i-prompt","accion":"escribe","texto":"Fotografía publicitaria de un café humeante en una taza de cerámica sobre una barra de madera, luz cálida de la mañana, fondo de cafetería desenfocado, sin texto y con el producto centrado."},{"selector":"#playOutput","accion":"señala","texto":"Aquí se crea una imagen nueva. Mostramos una creatividad de café preparada."},{"selector":"#imageStage","accion":"señala","texto":"Revisa el encuadre y el producto antes de descargar o publicar."}],"ejecucion_real_opcional":{"tool":"crear_imagen","args":{"prompt":"Fotografía publicitaria de un café humeante en una taza de cerámica sobre una barra de madera, luz cálida de la mañana, fondo de cafetería desenfocado, sin texto y con el producto centrado.","aspect_ratio":"16:9"},"requires_auth":true,"provider_credit":true},"verificacion":{"require_media":true,"checks":["recurso reproducible","sin generación durante el ensayo","sin publicación durante el ensayo"]},"aliases":["imagen"],"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/studio-imagen.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/studio-imagen.jpg","duracion":24,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"video","letra":"d","nombre":"Crear vídeo","desc":"De una imagen al movimiento de un clip.","url":"https://www.admira.studio/video.html","mirror_url":"https://www.pixeria.com/video.html","cmd":"/demo 4","duracion":60,"steps":[{"tool":"demo_muestra","args":{"id":"video"},"page":"/video.html"}],"muestra":{"tipo":"video","url":"https://www.pixeria.com/assets/demos/studio-v1/video-fuente.mp4","descripcion":"Resultado preparado; este ensayo no realiza generación ni publicación.","variantes":[],"poster":"https://www.pixeria.com/assets/demos/studio-v1/video-fuente.jpg"},"guion":[{"selector":"","accion":"di","texto":"Partimos de una imagen y describimos el movimiento que queremos."},{"selector":"#clip-stock","accion":"escribe","texto":"1791230658801-jnv969"},{"selector":"#clip-prompt","accion":"escribe","texto":"La cámara se acerca lentamente al café, el vapor asciende suavemente y la luz de la mañana cambia de forma sutil. Conserva la taza y el fondo, sin texto ni cambios de producto."},{"selector":"#clip-one","accion":"señala","texto":"Aquí se solicita un clip nuevo de cinco segundos. Esta demo reproduce un vídeo de café ya preparado, de unos ocho segundos."},{"selector":"#clip-status","accion":"señala","texto":"Durante una generación real, esperamos a que termine."},{"selector":"","accion":"di","texto":"Revisa el movimiento, el producto y la luz en el resultado preparado."}],"ejecucion_real_opcional":{"tool":"clip_desde_imagen","args":{"prompt":"La cámara se acerca lentamente al café, el vapor asciende suavemente y la luz de la mañana cambia de forma sutil. Conserva la taza y el fondo, sin texto ni cambios de producto.","stock_id":"1791230658801-jnv969","aspect_ratio":"16:9"},"requires_auth":true,"provider_credit":true,"result":"async","poll":{"tool":"clip_estado","args":{"request_id":"$result.request_id"}},"persists_to_library":true},"verificacion":{"require_media":true,"checks":["recurso reproducible","sin generación durante el ensayo","sin publicación durante el ensayo"]},"aliases":["video"],"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/studio-video.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/studio-video.jpg","duracion":26,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}},{"id":"adaptar","letra":"e","nombre":"Adaptar formatos","desc":"Una misma pieza en horizontal, vertical, cuadrado y barra.","url":"https://www.admira.studio/adaptaciones/","mirror_url":"https://www.pixeria.com/adaptaciones/","cmd":"/demo 5","duracion":60,"steps":[{"tool":"adaptacion_plan","args":{"source":{"ancho":1280,"alto":720,"fps":24},"formato":"9:16","compatibilidad":"fhd"},"page":"/adaptaciones/","selector":"#size-categories"}],"muestra":{"tipo":"video","url":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-horizontal.mp4","descripcion":"Resultado preparado; este ensayo no realiza generación ni publicación.","variantes":[{"nombre":"horizontal","url":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-horizontal.mp4","ancho":1920,"alto":1080,"encaje":"recortar","duracion":8.057007,"fps":"30/1","codec":"h264","bytes":1725926,"sha256":"8abb6aa02bdfbe673c1ae678c7521a4138e3d913ea79a7dfd68157c6563e3881","formato":"1920x1080","poster":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-horizontal.jpg"},{"nombre":"vertical","url":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-vertical.mp4","ancho":1080,"alto":1920,"encaje":"recortar","duracion":8.057007,"fps":"30/1","codec":"h264","bytes":1999117,"sha256":"fed4b18cc3f03e40e97d44a9278a0ac958d80f525dcc766c39590dce4e7b1f2e","formato":"1080x1920","poster":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-vertical.jpg"},{"nombre":"cuadrado","url":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-cuadrado.mp4","ancho":1080,"alto":1080,"encaje":"recortar","duracion":8.057007,"fps":"30/1","codec":"h264","bytes":1150973,"sha256":"1caefb82c748f507a179ca1292b7b74eadef37d88bdeaf389effdc5aeaa18e9c","formato":"1080x1080","poster":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-cuadrado.jpg"},{"nombre":"barra","url":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-barra.mp4","ancho":1920,"alto":540,"encaje":"contener","duracion":8.057007,"fps":"30/1","codec":"h264","bytes":560382,"sha256":"18b9545ab7c9b0d9c4ea3f237c41a21f7d0ec8fe2e954865518f86a5b4258983","formato":"1920x540","poster":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-barra.jpg"}],"poster":"https://www.pixeria.com/assets/demos/studio-v1/adaptado-horizontal.jpg"},"guion":[{"selector":"","accion":"di","texto":"Elige una pieza existente y comprueba su ficha técnica."},{"selector":"#stock-pick","accion":"señala","texto":"Selecciona el vídeo de café de la biblioteca."},{"selector":"#src-select","accion":"elige","texto":"Un anuncio elegante de café recién hecho"},{"selector":"","accion":"espera","texto":"3"},{"selector":"#btn-adaptar","accion":"clic","texto":"Abrimos los formatos de salida."},{"selector":"#size-categories","accion":"señala","texto":"Elige horizontal, vertical, cuadrado o barra. Ajusta el encuadre para proteger el producto."},{"selector":"#export-all","accion":"señala","texto":"El adaptador exporta archivos reales en el navegador. Aquí comparamos los cuatro archivos preparados y comprobados."},{"selector":"","accion":"di","texto":"Horizontal 1920 por 1080; vertical 1080 por 1920; cuadrado 1080 por 1080; barra 1920 por 540. El vertical y el cuadrado recortan; la barra conserva la imagen completa con bandas laterales."}],"ejecucion_real_opcional":{"execution":"browser_ffmpeg","page":"/adaptaciones/","source":"/assets/demos/studio-v1/video-fuente.mp4","provider_credit":false,"publishes_to_stock":true,"note":"La exportación de la interfaz actual puede guardar el resultado en Stock. El ensayo del pack solo reproduce archivos ya exportados y no activa ese botón."},"verificacion":{"require_media":true,"checks":["recurso reproducible","sin generación durante el ensayo","sin publicación durante el ensayo"]},"aliases":["adaptar","formatos","adaptacion"],"video":{"version":1,"tipo":"video","url":"https://www.admiranext.com/assets/demos/suite-v1/studio-adaptar.mp4","poster":"https://www.admiranext.com/assets/demos/suite-v1/studio-adaptar.jpg","duracion":27,"audio":true,"idioma":"es","descripcion":"Ensayo preparado de esta función. No realiza altas, generación ni publicación.","fuente":"ensayo-local"}}],"activacion":{"comando":"/demo","entradas":["experto","avatar"],"help":"/demo help","alcance":"plataforma_actual","hosts":["admira.studio","www.admira.studio","pixeria.com","www.pixeria.com"],"normalizacion":"minúsculas, espacios exteriores y tildes","modo":"muestra","nota":"Contrato preparado para incorporar al motor de Neo; el pack no instala el motor."}}}
  };
  // Preserve the published fifteen reels when a saved catalog predates prepared video.
  var VIDEOS_LOCALES=Object.create(null);
  Object.keys(LOCALES).forEach(function(k){LOCALES[k].m.subdemos.forEach(function(d){if(d.video)VIDEOS_LOCALES[k+'/'+d.id]=Object.freeze(JSON.parse(JSON.stringify(d.video)));});});
  Object.freeze(VIDEOS_LOCALES);
  // Copia literal de resolverDemo (pixeria demo/studio-comandos.mjs, Trinity): test/experto-demo.test.mjs
  // pasa su batería de verificar-studio-comandos.mjs contra esta copia para que no diverjan.
  function normalizar(value) { return String(value == null ? '' : value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function resolverDemo(texto, manifest, hostname) {
    var command = normalizar(texto);
    if (!/^\/demo(?:\s|$)/.test(command)) return {tipo: 'no_demo'};
    if (manifest.activacion.hosts.indexOf(String(hostname).toLowerCase()) < 0) return {tipo: 'otra_plataforma'};
    var arg = command.slice(5).trim();
    var opciones = manifest.subdemos.map(function (demo, index) {
      return {numero: index + 1, id: demo.id, nombre: demo.nombre, comando: demo.cmd, alias: '/demo ' + demo.aliases[0]};
    });
    if (!arg || arg === 'help') return {tipo: 'ayuda', plataforma: manifest.plataforma, opciones: opciones};
    var demo = null;
    manifest.subdemos.forEach(function (item, index) {
      if (!demo && (arg === String(index + 1) || item.aliases.some(function (alias) { return normalizar(alias) === arg; }))) demo = item;
    });
    if (!demo) return {tipo: 'desconocido', mensaje: 'Demo desconocida. Escribe /demo help.', opciones: opciones};
    return {tipo: 'demo', plataforma: manifest.plataforma, clave: manifest.plataforma + '/' + demo.id, modo: manifest.default_mode, demo: demo};
  }
  ['app','tv'].forEach(function(site){
    LOCALES[site]={manifiestos:[],m:{version:1,plataforma:site,nombre:'Admira '+site,default_mode:'recorrido',activacion:{hosts:site==='app'?['admira.app','www.admira.app','yokup.com','www.yokup.com']:['admira.tv','www.admira.tv']},subdemos:[]}};
  });
  var plataforma = null;
  Object.keys(LOCALES).forEach(function (k) { if (LOCALES[k].m.activacion.hosts.indexOf(String(location.hostname).toLowerCase()) >= 0) plataforma = k; });
  function localM() { return plataforma ? LOCALES[plataforma].m : null; }
  // Los recursos de muestra viven en www.pixeria.com: en www.admira.studio/assets/demos/ dan 404 (7-oct-2026).
  function muestrasPixeria(j) {
    var fix = function (u) { return typeof u === 'string' ? u.replace(/^https:\/\/(www\.)?admira\.studio\/assets\/demos\//, 'https://www.pixeria.com/assets/demos/') : u; };
    j.subdemos.forEach(function (d) {
      var canonicalVideo=VIDEOS_LOCALES[j.plataforma+'/'+d.id];if(d.video==null&&canonicalVideo)d.video=JSON.parse(JSON.stringify(canonicalVideo));
      var mu = d.muestra; if (!mu || typeof mu !== 'object') return;
      mu.url = fix(mu.url); mu.poster = fix(mu.poster);
      (mu.variantes || []).forEach(function (v) { if (v) { v.url = fix(v.url); v.poster = fix(v.poster); } });
    });
    return j;
  }
  function valido(j) { return j && j.plataforma === plataforma && j.activacion && Array.isArray(j.activacion.hosts) && Array.isArray(j.subdemos) && j.subdemos.length <= 40 && j.subdemos.every(function (d) { return d && /^[a-z0-9-]{1,40}$/.test(d.id) && /^https:\/\//.test(d.url || '') && Array.isArray(d.aliases) && d.aliases.length; }); }
  var publishedCatalog = null;
  function usePublishedCatalog(data) {
    if (!data || !Array.isArray(data.demos)) return false;
    publishedCatalog = data;
    Object.keys(LOCALES).forEach(function(site){
      if(!data.demos.some(function(doc){return doc.id===site&&doc.status==='published';})) LOCALES[site].m=Object.assign({},LOCALES[site].m,{subdemos:[],catalogId:site});
    });
    data.demos.forEach(function (doc) {
      if (doc.kind !== 'demo' || doc.status !== 'published' || !LOCALES[doc.site]) return;
      if (doc.id !== doc.site) return;
      var old = LOCALES[doc.site].m;
      LOCALES[doc.site].m = Object.assign({}, old, {catalogId:doc.id, catalogVersion:doc.version, subdemos:doc.subdemos.map(function (sub, index) {
        var previous = old.subdemos.filter(function (item) { return item.id === sub.id; })[0] || {};
        return Object.assign({}, previous, {id:sub.id,nombre:sub.title && (sub.title[lang()] || sub.title.es || sub.title.en) || sub.id,url:sub.url,aliases:(sub.aliases || []).concat([sub.id]),steps:sub.steps || [],catalogId:doc.id,letra:String.fromCharCode(97+index)});
      })});
    });
    recogerNombres(data);
    return true;
  }
  function cargarLocalFallback() {
    if (!plataforma) return Promise.resolve(null);
    try { var guardados = JSON.parse(localStorage.getItem('ax-subdemos-manifiestos') || '{}'), custom = guardados[plataforma]; if (custom && typeof custom === 'object') { custom = Object.assign({}, LOCALES[plataforma].m, custom); if (Array.isArray(custom.subdemos)) custom.subdemos = custom.subdemos.map(function (d) { return Object.assign({}, d, {aliases: d.aliases && d.aliases.length ? d.aliases : [d.id]}); }); } if (valido(custom)) { LOCALES[plataforma].m = muestrasPixeria(custom); return Promise.resolve(custom); } } catch (_) {}
    if (typeof fetch !== 'function') return Promise.resolve(null);
    var urls = LOCALES[plataforma].manifiestos.slice();
    var next = function () {
      var u = urls.shift();
      if (!u) return null;
      return fetch(u, {cache: 'no-store'}).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        .then(function (j) { if (valido(j)) { LOCALES[plataforma].m = muestrasPixeria(j); return j; } return next(); });
    };
    return next();
  }
  var catalogReady = ds.catalog === 'offline';
  function refreshCatalog() {
    if (typeof fetch !== 'function') { catalogReady=true; return Promise.resolve(null); }
    return fetch(origenCatalogo()+'/api/demos', {cache:'no-store',credentials:'omit'}).then(function (response) {
      if (!response.ok) throw Error('catalog');
      return response.json();
    }).then(function (data) { if (!usePublishedCatalog(data)) throw Error('catalog'); return data; }).catch(function () { return cargarLocalFallback(); }).then(function (data) { catalogReady=true; return data; });
  }
  var localListo = ds.catalog === 'offline' ? cargarLocalFallback() : refreshCatalog();
  var nombresCatalogo = Object.create(null);
  function origenCatalogo() {
    var h = '';
    try { h = String(location.hostname || ''); } catch (_) { h = ''; }
    if (/(^|\.)admiranext\.com$/i.test(h) || /\.admiranext\.pages\.dev$/i.test(h) || h === 'localhost' || h === '127.0.0.1') {
      try { return location.origin; } catch (_) {}
    }
    return 'https://www.admiranext.com';
  }
  function anotarNombres(lista) {
    (lista || []).forEach(function (n) {
      n = norm(n);
      if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(n) && !reservadoDemo(n)) nombresCatalogo[n] = true;
    });
  }
  function reservadoDemo(token) {
    return /^(hoy|today|editor|editar|edit|list|lista|help|ayuda|proyectos|projects|marcas|brands|roadmap|idioma|language|global|auto|todas|todos|all|pausa|pause|reanudar|resume|continuar|parar|stop|off|estado|status|siguiente|next|sig|soluciones|solutions|studio|store|tv|app|biz|pixeria|yokup|demos)$/.test(token);
  }
  function tokenSlug(token) {
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(token) && token.length <= 40 && !reservadoDemo(token);
  }
  function tokenCatalogo(token) {
    if (!tokenSlug(token)) return false;
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(token)) return true;
    return !!nombresCatalogo[token];
  }
  function formaCatalogo(arg) {
    if (!arg) return null;
    var partes = arg.split(' ');
    if (partes.length === 2 && tokenCatalogo(partes[0]) && tokenSlug(partes[1])) return {catalogo: partes[0], pieza: partes[1]};
    if (partes.length === 1 && arg.indexOf('.') > 0) {
      var dot = arg.split('.');
      if (dot.length === 2 && tokenCatalogo(dot[0]) && tokenSlug(dot[1])) return {catalogo: dot[0], pieza: dot[1]};
      return null;
    }
    if (partes.length === 1 && tokenCatalogo(arg)) return {catalogo: arg};
    return null;
  }
  function recogerNombres(j) {
    var lista = [];
    ((j && j.macros) || []).forEach(function (d) {
      lista.push(d.slug || d.id);
      (d.aliases || []).forEach(function (a) { lista.push(a); });
      (d.items || []).forEach(function (item) {
        var sub = item.subdemo || {};
        if (sub.slug) lista.push(sub.slug);
        if (sub.id) lista.push(sub.id);
        var cola = String(item.ref || '').split('/')[1];
        if (cola) lista.push(cola);
      });
    });
    ((j && j.demos) || []).forEach(function (d) {
      (d.subdemos || []).forEach(function (sub) {
        if (sub.slug) lista.push(sub.slug);
        if (sub.id) lista.push(sub.id);
      });
    });
    ((j && j.nombres) || []).forEach(function (n) { lista.push(n); });
    anotarNombres(lista);
  }
  var nombresPedidos = false;
  function cargarNombres() {
    if (nombresPedidos || typeof fetch !== 'function') return;
    nombresPedidos = true;
    fetch(origenCatalogo() + '/api/demos', {cache: 'no-store', credentials: 'omit'}).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) recogerNombres(j); }).catch(function () {});
  }
  function completarNombreDemo(e) {
    if (!e || e.key !== 'Tab' || !e.target || e.target.value == null) return;
    var m = /^\/demo\s+(\S*)$/i.exec(String(e.target.value).trim());
    if (!m) return;
    var pref = norm(m[1]);
    var hits = Object.keys(nombresCatalogo).filter(function (n) { return !pref || n.indexOf(pref) === 0; }).sort();
    if (!hits.length) return;
    if (hits.length === 1) { e.preventDefault(); e.target.value = '/demo ' + hits[0] + ' '; return; }
    var comun = hits[0];
    hits.forEach(function (n) { while (comun && n.indexOf(comun) !== 0) comun = comun.slice(0, -1); });
    if (comun && comun.length > pref.length) { e.preventDefault(); e.target.value = '/demo ' + comun; }
  }
  // pixeria.com es espejo de admira.studio: sus subdemos abren en el mismo host.
  function subUrl(d) { return /(^|\.)pixeria\.com$/.test(host) && d.mirror_url ? d.mirror_url : d.url; }

  // null = no es de la suite (lo resuelve la pata); {lista} | {local:true, lista} | {local:true, sub, n} | {local:true, desconocida} | {demo, i}.
  // En una plataforma con manifiesto manda resolverDemo (números y alias locales); los nombres de las cinco
  // soluciones (/demo store, /demo biz…) siguen abriendo las otras plataformas.
  var recorrido = null, recorridoTimer = null, recorridoVideo = null, recorridoPrime = 0;
  function iosHelp() {
    return T('Demo nativa iPhone + Apple Watch', 'Native iPhone + Apple Watch demo') + '\n' +
      '/demo ios — iPhone + Apple Watch\n/demo ios iphone — iPhone\n/demo ios watch — Apple Watch\n/demo ios #musica — tags del proyecto / project tags\n/demo ios "playlist" — asociar playlist / associate playlist\n' +
      T('Por defecto usa la última playlist asociada al proyecto activo. Requiere el lanzador Admira IOS Demo en macOS y los simuladores instalados; no necesita dispositivos físicos. Acepta Abrir Admira IOS Demo si Chrome lo pide. El envío no confirma el arranque. Ayuda: https://www.admiranext.com/help/#demo-ios',
      'Defaults to the latest playlist associated with the active project. Requires the Admira IOS Demo macOS launcher and installed simulators; no physical devices required. Accept Open Admira IOS Demo if Chrome asks. Sending does not confirm startup. Help: https://www.admiranext.com/help/#demo-ios');
  }
  function parseDemo(text) {
    var m = /^\/?demo(?:\s+(.*))?$/i.exec(String(text == null ? '' : text).trim());
    if (!m) return null;
    if (/^android(?:\s|$)/i.test(String(m[1] || ''))) return {android: String(text).trim()};
    if (/^ios(?:\s|$)/i.test(String(m[1] || ''))) return {ios: String(text).trim()};
    var arg = norm(m[1]).replace(/^admira\./, ''), L = localM();
    // /demo <funcionalidad>: hoy (castellano) y today (pone la web en inglés). El resto de nombres
    // desconocidos sigue siendo de la pata. Los pasos viven en suite/demo-control.js.
    if (arg === 'hoy' || arg === 'today') return {funcion: 'hoy', lang: arg === 'today' ? 'en' : 'es'};
    if (/^(pixeria|studio) (novedades|updates|news)$/.test(arg)) return {updates: true, lang: /(?:updates|news)$/.test(arg) ? 'en' : 'es'};
    // /demo <página> (encargo #5446). El verbo inglés abre el mismo recorrido en inglés.
    // /demo idioma, si ya hay una demo en curso, sigue cambiando el idioma sin perder el paso.
    var FUNCION_PAGINA = {proyectos:'proyectos', projects:'proyectos', marcas:'marcas', brands:'marcas', roadmap:'roadmap'};
    if (FUNCION_PAGINA[arg]) {
      var langPagina = (arg === 'projects' || arg === 'brands' || (arg === 'roadmap' && lang() === 'en')) ? 'en' : 'es';
      return {funcion: FUNCION_PAGINA[arg], lang: langPagina};
    }
    if (arg === 'editor') return {funcion: 'editor', lang: lang()};
    if (arg === 'idioma' || arg === 'language') {
      if (demoEnCurso()) return {idiomaDemo: true};
      return {funcion: 'idioma', lang: arg === 'language' ? 'en' : 'es'};
    }
    if(arg==='global')return {global:true};
    if (L && /^(auto|todas|todos|all)$/.test(arg)) return {local: true, auto: true};
    if ((root.PixeriaUpdatesDemo || L || (root.AdmiraDemoControl && root.AdmiraDemoControl.state().activo)) && /^(pausa|pause|reanudar|resume|continuar|parar|stop|off|estado|status|siguiente|next)$/.test(arg) &&
      (plataforma !== 'store' || (recorrido && recorrido.activo) || (root.AdmiraDemoControl && root.AdmiraDemoControl.state().activo) || !/^(stop|off|estado|status)$/.test(arg))) return {control: arg};
    // Controles del recorrido TPV nativo: los sigue atendiendo el gemelo.
    if (plataforma === 'store' && /^(tpv|off|stop|estado|status|tpv (off|stop|estado|status))$/.test(arg)) return null;
    if (L) {
      var pideCatalogo = /^(lista|list)$/.test(arg);
      var r = resolverDemo('/demo ' + (/^(ayuda|\?|lista|list)$/.test(arg) ? 'help' : arg), L, location.hostname);
      if (r.tipo === 'ayuda') return {local: true, lista: true, catalogoLista: pideCatalogo};
      if (r.tipo === 'demo') return {local: true, sub: r.demo, n: L.subdemos.indexOf(r.demo) + 1, clave: r.clave, modo: r.modo};
    }
    if (!arg || /^(lista|list|soluciones|solutions)$/.test(arg)) return {lista: true, catalogoLista: !arg || /^(lista|list)$/.test(arg)};
    var i = -1;
    if (/^(siguiente|next|sig)$/.test(arg)) i = (demoActual() + 1) % DEMOS.length;
    else if (!L && /^[1-5]$/.test(arg)) i = +arg - 1;
    else DEMOS.forEach(function (d, k) { if (i < 0 && (d.id === arg || d.alias.indexOf(arg) >= 0)) i = k; });
    var forma = i < 0 ? formaCatalogo(arg) : null;
    if (forma) return forma;
    if (i < 0 && L) return {local: true, desconocida: arg};
    return i < 0 ? null : {demo: DEMOS[i], i: i};
  }
  function demoLista() {
    return '/demo android [Fold8|watch] [playlist|#tag] · Fold + Watch virtuales\n/demo ios [iphone|watch] [playlist|#tag] · iPhone + Apple Watch\n' + T('/demo pixeria novedades · mejoras de Trinity → gemelo 360\n','/demo pixeria updates · Trinity updates → 360 twin\n') + T('/demo global · Sneakers Store: proyecto → Xpacio → Pixeria → gemelo → cámara\nDemos · las cinco soluciones:', '/demo global · Sneakers Store: project → Xpace → Pixeria → twin → camera\nDemos · the five solutions:') + '\n' +
      DEMOS.map(function (d, k) { return (k + 1) + ' /demo ' + d.id + ' · ' + d.nombre + ' — ' + T(d.desc[0], d.desc[1]); }).join('\n') +
      '\n' + T('/demo 1…5 o /demo siguiente. También desde el avatar digital: «/demo store».', '/demo 1…5 or /demo next. Also from the digital avatar: "/demo store".') +
      '\n' + T('/demo hoy recorre lo de hoy y resume bien, mal o pendiente. /demo today lo hace en inglés.',
        '/demo hoy walks through today and marks each step. /demo today does it in English.') +
      '\n' + T('/demo idioma abre la demo 1 y cambia de idioma sin perder el paso.',
        '/demo idioma opens demo 1 and changes language without losing the step.') +
      '\n' + T('/demo proyectos, /demo idioma, /demo marcas y /demo roadmap recorren esa página y resumen bien o mal. En inglés: /demo projects, /demo language, /demo brands y /demo roadmap.',
        '/demo projects, /demo language, /demo brands and /demo roadmap walk that page and mark each step ok or fail. In Spanish: /demo proyectos, /demo idioma, /demo marcas y /demo roadmap.') +
      '\n' + T('/demo editor abre el editor de demos. /demos editar y /demos edit también.', '/demo editor opens the demo editor. /demos editar and /demos edit do too.') +
      '\n' + T('/demo lista muestra las demos y las macros. /demo alsea-biz-app recorre biz y luego app.', '/demo list shows the demos and the macros. /demo alsea-biz-app walks biz and then app.') +
      '\n' + T('/demo <nombre> recorre esa macro. /demo <nombre> <subdemo> o /demo <nombre>.<subdemo> abre solo esa pieza. Tab completa el nombre.', '/demo <name> runs that macro. /demo <name> <subdemo> or /demo <name>.<subdemo> opens just that piece. Tab completes the name.');
  }
  function localLista() {
    var L = localM();
    return '/demo android [Fold8|watch] [playlist|#tag] · Fold + Watch virtuales\n/demo ios [iphone|watch] [playlist|#tag] · iPhone + Apple Watch\n' + T('/demo pixeria novedades · mejoras de Trinity → gemelo 360\n','/demo pixeria updates · Trinity updates → 360 twin\n') + T('Demos de ', 'Demos of ') + (L.nombre || plataforma) + ':\n' +
      L.subdemos.map(function (d, k) { return '/demo ' + (k + 1) + ' · /demo ' + d.aliases[0] + ' — ' + d.nombre + (d.desc ? ': ' + d.desc : ''); }).join('\n') +
      '\n' + T('Recorridos y muestras preparados. /demo store, /demo biz… abren las otras plataformas.',
        'Prepared walkthroughs and samples. /demo store, /demo biz… open the other platforms.') +
      '\n' + T('/demo auto encadena todas; /demo pausa, reanudar, siguiente y stop controlan el ensayo.',
        '/demo auto runs all; /demo pause, resume, next and stop control the rehearsal.') +
      '\n' + T('/demo hoy recorre lo de hoy y resume bien, mal o pendiente. /demo today lo hace en inglés.',
        '/demo hoy walks through today and marks each step. /demo today does it in English.') +
      '\n' + T('/demo proyectos, /demo idioma, /demo marcas y /demo roadmap recorren esa página y resumen bien o mal. En inglés: /demo projects, /demo language, /demo brands y /demo roadmap.',
        '/demo projects, /demo language, /demo brands and /demo roadmap walk that page and mark each step ok or fail. In Spanish: /demo proyectos, /demo idioma, /demo marcas y /demo roadmap.') +
      '\n' + T('/demo editor abre el editor de demos. /demos editar y /demos edit también.', '/demo editor opens the demo editor. /demos editar and /demos edit do too.') +
      '\n' + T('/demo lista muestra las demos y las macros. /demo alsea-biz-app recorre biz y luego app.', '/demo list shows the demos and the macros. /demo alsea-biz-app walks biz and then app.') +
      '\n' + T('/demo <nombre> recorre esa macro. /demo <nombre> <subdemo> o /demo <nombre>.<subdemo> abre solo esa pieza. Tab completa el nombre.', '/demo <name> runs that macro. /demo <name> <subdemo> or /demo <name>.<subdemo> opens just that piece. Tab completes the name.');
  }
  // Modo muestra (default_mode): panel con el resultado preparado y enlace a la página de la función.
  function abs(u) { try { return new URL(u, location.href).href; } catch (_) { return u; } }
  function mediaEl(tipo, url, poster) {
    var el = document.createElement(tipo === 'audio' ? 'audio' : tipo === 'image' ? 'img' : 'video');
    el.src = abs(url);
    if (el.tagName === 'IMG') el.alt = '';
    else { el.controls = true; el.preload = 'metadata'; el.muted = true; el.playsInline = true; if (poster) el.poster = abs(poster); }
    return el;
  }
  function videoEnsayo(d) {
    var v=d.video;if(!v)return null;
    function https(u){try{var x=new URL(u);return typeof u==='string'&&u.length<=2048&&x.protocol==='https:'&&!x.username&&!x.password;}catch(_){return false;}}
    return typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(function(k){return ['version','tipo','url','poster','duracion','audio','idioma','descripcion','fuente'].indexOf(k)>=0;})&&v.version===1&&v.tipo==='video'&&https(v.url)&&(v.poster===undefined||https(v.poster))&&typeof v.audio==='boolean'&&/^(es|en|ca)$/.test(v.idioma)&&v.fuente==='ensayo-local'&&typeof v.descripcion==='string'&&v.descripcion.length<=1000&&(v.duracion===undefined||(typeof v.duracion==='number'&&isFinite(v.duracion)&&v.duracion>0&&v.duracion<=300))?v:null;
  }
  function retirarMuestra() { var o = document.getElementById('ax-demo-muestra'); if (o) { o.querySelectorAll('audio,video').forEach(function (el) { try { el.pause(); } catch (_) {} }); o.parentNode.removeChild(o); } }
  function cerrarMuestra() {
    recorridoPrime++;
    clearTimeout(recorridoTimer); recorridoTimer = null;
    if (recorrido && recorrido.esc) document.removeEventListener('keydown', recorrido.esc);
    recorrido = null; retirarMuestra();
  }
  function estadoRecorrido() {
    return recorrido ? {activo: recorrido.activo, pausado: recorrido.pausado, demo: plataforma + '/' + recorrido.d.id,
      fase: recorrido.fase + 1, fases: recorrido.pasos.length, numero: recorrido.indice + 1, total: recorrido.cola.length} : {activo: false};
  }
  function programarRecorrido(ms) {
    clearTimeout(recorridoTimer);
    var r = recorrido; if (!r || !r.activo || r.pausado) return;
    if(r.fase===r.pasos.length-1&&r.d.video!=null)return; // The prepared function reel owns its actual completion.
    r.restante = ms; r.plazo = Date.now() + ms;
    recorridoTimer = setTimeout(function () { if (recorrido === r && r.activo && !r.pausado) avanzarRecorrido(); }, ms);
  }
  function avanzarRecorrido() {
    var r = recorrido; if (!r || !r.activo) return;
    clearTimeout(recorridoTimer);
    if (r.fase + 1 < r.pasos.length) { r.fase++; r.restante = r.intervalo; r.pintar(); if (!r.pausado) programarRecorrido(r.intervalo); }
    else if (r.indice + 1 < r.cola.length) { mostrarMuestra(r.cola[r.indice + 1], r.indice + 2, r.cola, r.indice + 1, r.pausado); }
    else { r.activo = false; r.pausado = false; r.media.forEach(function (el) { try { el.pause(); } catch (_) {} }); r.pintar(); }
  }
  function controlarRecorrido(control) {
    var r = recorrido;
    if (/^(stop|off|parar)$/.test(control)) { cerrarMuestra(); return estadoRecorrido(); }
    if (!r || !r.activo) return estadoRecorrido();
    if (/^(pausa|pause)$/.test(control) && !r.pausado) {
      recorridoPrime++;
      r.priming=false;
      r.restante = Math.max(0, r.plazo - Date.now()); r.pausado = true; clearTimeout(recorridoTimer);
      r.media.forEach(function (el) { try { el.pause(); } catch (_) {} }); r.pintar();
    } else if (/^(reanudar|resume|continuar)$/.test(control) && r.pausado) {
      r.pausado = false; r.error=''; r.pintar(); programarRecorrido(r.restante);
    } else if (/^(siguiente|next)$/.test(control)) avanzarRecorrido();
    return estadoRecorrido();
  }
  function mostrarMuestra(d, n, cola, indice, pausado) {
    if (root.AdmiraDemoControl && root.AdmiraDemoControl.state().activo) root.AdmiraDemoControl.control('stop');
    cerrarMuestra();
    var pasos = Array.isArray(d.guion) && d.guion.length ? d.guion.map(function (p) { return typeof p === 'string' ? p : (p.texto || p.text || ''); }) :
      [d.desc || d.nombre, T('Preparar el caso de demostración.', 'Prepare the demonstration case.'), T('Mostrar el resultado preparado.', 'Show the prepared result.'), T('Revisar el resultado sin generar ni publicar.', 'Review the result without generating or publishing.')];
    var r = recorrido = {d: d, cola: cola || [d], indice: indice || 0, fase: 0, pasos: pasos, activo: true, pausado: Boolean(pausado), media: [],video:null,error:'',
      intervalo: Math.max(1800, Math.min(30000, (Number(d.duracion) || 40) * 1000 / pasos.length))};
    r.restante = r.intervalo;
    var o = document.createElement('div');
    o.id = 'ax-demo-muestra';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-label', d.nombre);
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(5,4,12,.82);display:flex;align-items:center;justify-content:center;padding:16px';
    var c = document.createElement('div');
    c.style.cssText = 'background:#14111f;color:#eee;border:1px solid #3b3358;max-width:960px;width:100%;max-height:92vh;overflow:auto;padding:18px 20px;font:14px/1.5 system-ui,sans-serif';
    var h = document.createElement('h2'); h.style.cssText = 'margin:0 0 4px;font-size:20px'; h.textContent = (d.letra ? d.letra + '. ' : n + '. ') + d.nombre;
    var p = document.createElement('p'); p.style.cssText = 'margin:0 0 12px;color:#b9b0cf'; p.textContent = d.desc || '';
    c.appendChild(h); c.appendChild(p);
    var status = document.createElement('p'); status.setAttribute('data-demo-status', ''); c.appendChild(status);
    var phase = document.createElement('p'); phase.setAttribute('data-demo-phase', ''); phase.style.cssText = 'font-size:22px;line-height:1.4'; c.appendChild(phase);
    var warning = document.createElement('p'); warning.textContent = T('Ensayo con datos preparados: no crea altas, ventas ni emisiones reales.', 'Prepared-data rehearsal: no real registrations, sales or broadcasts.'); warning.style.cssText = 'font-size:12px;color:#b9b0cf'; c.appendChild(warning);
    if (d.caso && typeof d.caso === 'object') {
      var data = document.createElement('dl'); data.setAttribute('data-demo-case', '');
      function textoCaso(value, depth) {
        if (depth > 6) return T('Datos de ejemplo', 'Example data');
        if (Array.isArray(value)) return value.map(function (v) { return textoCaso(v, depth + 1); }).join('\n');
        if (value && typeof value === 'object') return Object.keys(value).map(function (k) { return k.replace(/_/g, ' ') + ': ' + textoCaso(value[k], depth + 1); }).join(' · ');
        return String(value == null ? '' : value);
      }
      Object.keys(d.caso).forEach(function (key) { var term = document.createElement('dt'), value = document.createElement('dd'); term.textContent = key.replace(/_/g, ' '); term.style.fontWeight = '700'; value.textContent = textoCaso(d.caso[key], 0); value.style.cssText = 'margin:4px 0 10px;white-space:pre-wrap;overflow-wrap:anywhere;color:#b9b0cf'; data.appendChild(term); data.appendChild(value); });
      c.appendChild(data);
    }
    var results = document.createElement('div'); results.setAttribute('data-demo-result', ''); results.hidden = true; c.appendChild(results);
    var clipRoot=document.createElement('section');clipRoot.setAttribute('data-demo-video','');clipRoot.hidden=true;c.appendChild(clipRoot);
    var clipDefinition=videoEnsayo(d),soundPrefs={narration:true,samples:true,muted:false};
    try{var savedSound=JSON.parse(localStorage.getItem('admira-demo-audio-v1')||'{}');Object.keys(soundPrefs).forEach(function(k){if(typeof savedSound[k]==='boolean')soundPrefs[k]=savedSound[k];});}catch(_){}
    function clipSound(){if(r.video)r.video.muted=soundPrefs.muted||!soundPrefs.samples||!clipDefinition.audio;try{localStorage.setItem('admira-demo-audio-v1',JSON.stringify(soundPrefs));}catch(_){} }
    function clipFailure(reason){if(recorrido!==r||!r.activo)return;r.error=reason&&reason.name==='NotAllowedError'?T('El navegador ha bloqueado el vídeo. Pulsa Reanudar o reproducir para autorizarlo.','The browser blocked the video. Press Resume or Play to authorize it.'):T('El vídeo no se ha podido reproducir. Comprueba el acceso o el formato y pulsa Reanudar para reintentar.','The video could not play. Check access or format and press Resume to retry.');r.pausado=true;clearTimeout(recorridoTimer);r.media.forEach(function(el){el.pause();});r.pintar();}
    if(clipDefinition){
      var clipTitle=document.createElement('h3');clipTitle.textContent=T('Vídeo del ensayo','Rehearsal video');clipRoot.appendChild(clipTitle);
      r.video=recorridoVideo||(recorridoVideo=mediaEl('video',clipDefinition.url,clipDefinition.poster));r.video.pause();
      if(r.video.src!==abs(clipDefinition.url)){r.video.src=abs(clipDefinition.url);r.video.load&&r.video.load();}r.video.currentTime=0;r.video.poster=clipDefinition.poster?abs(clipDefinition.poster):'';
      r.video.style.cssText='width:100%;max-height:calc(86vh - 170px);object-fit:contain;background:#000';clipRoot.appendChild(r.video);clipSound();
      r.video.onended=function(){if(recorrido===r&&r.activo&&!r.pausado&&r.fase===r.pasos.length-1&&r.video.ended)avanzarRecorrido();};r.video.onerror=clipFailure;
      r.video.onvolumechange=function(){if((soundPrefs.muted||!soundPrefs.samples||!clipDefinition.audio)&&!r.video.muted)r.video.muted=true;};
    }
    var mu = d.muestra;
    if (mu && mu.url) {
      var vs = (mu.variantes || []).filter(function (v) { return v && v.url; });
      if (vs.length) {
        var g = document.createElement('div'); g.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px';
        vs.forEach(function (v) {
          var f = document.createElement('figure'); f.style.margin = '0';
          var el = mediaEl(mu.tipo, v.url, v.poster); el.style.cssText = 'width:100%;max-height:260px;object-fit:contain;background:#000';
          var cap = document.createElement('figcaption'); cap.style.cssText = 'font-size:12px;color:#b9b0cf'; cap.textContent = (v.nombre || '') + (v.formato ? ' · ' + v.formato : '');
          f.appendChild(el); f.appendChild(cap); g.appendChild(f);
        });
        results.appendChild(g);
      } else {
        var el = mediaEl(mu.tipo, mu.url, mu.poster); el.style.cssText = 'width:100%;max-height:60vh;object-fit:contain;background:#000;display:block';
        results.appendChild(el);
      }
      if (mu.descripcion) { var q = document.createElement('p'); q.style.cssText = 'font-size:12px;color:#8f86a8;margin:8px 0 0'; q.textContent = mu.descripcion; results.appendChild(q); }
    }
    var bar = document.createElement('p'); bar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 0';
    var a = document.createElement('a'); a.href = abs(subUrl(d)); a.textContent = T('Abrir la función →', 'Open the feature →'); a.style.cssText = 'color:#ff8dbf';
    var x = document.createElement('button'); x.type = 'button'; x.textContent = T('Cerrar', 'Close'); x.onclick = cerrarMuestra;
    var pause = document.createElement('button'); pause.type = 'button'; pause.setAttribute('data-demo-pause', ''); pause.onclick = function () { controlarRecorrido(r.pausado ? 'resume' : 'pause'); };
    var next = document.createElement('button'); next.type = 'button'; next.textContent = T('Siguiente fase', 'Next phase'); next.onclick = function () { controlarRecorrido('next'); };
    var stop = document.createElement('button'); stop.type = 'button'; stop.textContent = T('Detener', 'Stop'); stop.onclick = cerrarMuestra;
    bar.appendChild(pause); bar.appendChild(next); bar.appendChild(stop);
    if (mu && mu.url && mu.tipo !== 'image') {
      var soundLabel = document.createElement('label'), sound = document.createElement('input'); sound.type = 'checkbox'; sound.setAttribute('data-demo-sound', '');
      sound.onchange = function () { r.media.filter(function(el){return el!==r.video;}).forEach(function (el, index) { el.muted = soundPrefs.muted || !sound.checked || index > 0; }); };
      var soundText = document.createElement('span'); soundText.textContent = T(' Escuchar la muestra', ' Listen to the sample'); soundLabel.appendChild(sound); soundLabel.appendChild(soundText); bar.appendChild(soundLabel);
    }
    if(r.video){var clipLabel=document.createElement('label'),clipListen=document.createElement('input');clipListen.type='checkbox';clipListen.checked=soundPrefs.samples;clipListen.setAttribute('data-demo-video-sound','');clipListen.onchange=function(){soundPrefs.samples=clipListen.checked;clipSound();};var clipText=document.createElement('span');clipText.textContent=T(' Escuchar el vídeo',' Listen to the video');clipLabel.appendChild(clipListen);clipLabel.appendChild(clipText);bar.appendChild(clipLabel);
      var mute=document.createElement('button');mute.type='button';function muteLabel(){mute.textContent=soundPrefs.muted?T('Activar sonido','Enable sound'):T('Silenciar todo','Mute all');mute.setAttribute('aria-pressed',String(soundPrefs.muted));}muteLabel();mute.onclick=function(){soundPrefs.muted=!soundPrefs.muted;clipSound();r.media.filter(function(el){return el!==r.video;}).forEach(function(el){if(soundPrefs.muted){el.demoMuteBefore=el.muted;el.muted=true;}else if(typeof el.demoMuteBefore==='boolean')el.muted=el.demoMuteBefore;});muteLabel();};bar.appendChild(mute);}
    bar.appendChild(a);
    if (d.ensayo_url && /^https:\/\//.test(d.ensayo_url)) { var ensayo = document.createElement('a'); ensayo.href = d.ensayo_url; ensayo.textContent = T('Ensayar paso a paso →', 'Rehearse step by step →'); ensayo.style.cssText = 'color:#ff8dbf'; bar.appendChild(ensayo); }
    bar.appendChild(x); c.appendChild(bar);
    o.appendChild(c);
    o.addEventListener('click', function (e) { if (e.target === o) cerrarMuestra(); });
    r.esc = function (e) { if (e.key === 'Escape') cerrarMuestra(); }; document.addEventListener('keydown', r.esc);
    document.body.appendChild(o);
    r.media = Array.prototype.slice.call(c.querySelectorAll('audio,video'));
    r.media.filter(function(el){return el!==r.video;}).forEach(function(el){el.addEventListener('volumechange',function(){if(soundPrefs.muted&&!el.muted)el.muted=true;});});
    r.pintar = function () {
      status.textContent = r.error || T('Demo ', 'Demo ') + (r.indice + 1) + '/' + r.cola.length + ' · ' + (r.activo ? (r.pausado ? T('En pausa', 'Paused') : T('Fase ', 'Phase ') + (r.fase + 1) + '/' + r.pasos.length) : T('Ensayo completado', 'Rehearsal complete'));
      phase.textContent = alIdioma(r.pasos[r.fase]);
      h.textContent = (d.letra ? d.letra + '. ' : (r.indice + 1) + '. ') + alIdioma(d.nombre);
      p.textContent = alIdioma(d.desc || '');
      results.hidden = r.fase < (plataforma === 'studio' ? r.pasos.length - 1 : 1);
      pause.textContent = r.pausado ? T('Reanudar', 'Resume') : T('Pausa', 'Pause'); pause.disabled = next.disabled = !r.activo;
      var finalPhase=r.fase===r.pasos.length-1,cinema=finalPhase&&Boolean(r.video);clipRoot.hidden=!finalPhase;
      if(cinema){results.hidden=true;phase.hidden=true;p.hidden=true;warning.hidden=true;if(data)data.hidden=true;h.style.fontSize='18px';}else{phase.hidden=false;p.hidden=false;warning.hidden=false;if(data)data.hidden=false;}
      r.media.forEach(function(el){if(el===r.video&&r.priming&&r.activo&&!r.pausado)return;if(el!==r.video||!r.activo||r.pausado||!finalPhase){try{el.pause();}catch(_){}}}); // Original samples remain manual.
      if(r.activo&&!r.pausado&&finalPhase&&d.video!=null){
        if(!r.video){r.error=T('Vídeo preparado no válido. Revisa el catálogo.','Invalid prepared video. Check the catalog.');r.pausado=true;status.textContent=r.error;pause.textContent=T('Reanudar','Resume');}
        else {if(r.priming){r.priming=false;recorridoPrime++;r.video.currentTime=0;r.video.volume=1;clipSound();}if(r.video.ended)r.video.onended();else if(r.video.paused){try{recorridoPrime++;r.video.volume=1;clipSound();var play=r.video.play();if(play&&play.catch)play.catch(function(e){if(e.name!=='AbortError')clipFailure(e);});}catch(e){clipFailure(e);}}}
      }
    };
    if(r.video&&(!cola||!indice)){
      var prime=++recorridoPrime;r.priming=true;r.video.volume=0;
      try{var primed=r.video.play();if(primed&&primed.then)primed.then(function(){if(recorrido!==r||prime!==recorridoPrime)return;r.priming=false;if(r.fase!==r.pasos.length-1||r.pausado){r.video.pause();r.video.currentTime=0;}r.video.volume=1;clipSound();}).catch(function(e){if(recorrido===r&&prime===recorridoPrime){r.priming=false;r.video.volume=1;clipSound();}});}catch(_){r.priming=false;r.video.volume=1;}
    }
    r.pintar(); if (!r.pausado) programarRecorrido(r.intervalo);
  }
  // Devuelve {id, nombre, desc} de lo que se enseña (lo usa el avatar para presentarlo) o null.
  function marcaDeEditor() {
    var re = /^[a-z0-9][a-z0-9-]{0,40}$/;
    function limpia(v) {
      v = String(v || '').trim().toLowerCase();
      return re.test(v) ? v : '';
    }
    try {
      var deUrl = limpia(new URL(location.href).searchParams.get('marca'));
      if (deUrl) return deUrl;
    } catch (_) {}
    try {
      var attr = document.documentElement && document.documentElement.getAttribute && document.documentElement.getAttribute('data-mb-marca');
      var deHtml = limpia(attr);
      if (deHtml) return deHtml;
    } catch (_) {}
    try {
      var deSesion = limpia(sessionStorage.getItem('mb:marca'));
      if (deSesion) return deSesion;
    } catch (_) {}
    return '';
  }
  function funcionDemoUrl(id, l) {
    var rutas = {hoy:'/arquitectura', proyectos:'/proyectos/', idioma:'/', marcas:'/marcablanca/', roadmap:'/roadmap', editor:'/demos/editor/'};
    var path = rutas[id] || '/arquitectura';
    var hostAhora = location.hostname || '';
    var aqui = /(^|\.)admiranext\.com$/i.test(hostAhora) || /^(localhost|127\.0\.0\.1)$/i.test(hostAhora);
    var base = aqui ? path : ('https://www.admiranext.com' + path);
    var u; try { u = new URL(base, location.href); } catch (_) { u = new URL('https://www.admiranext.com' + path); }
    u.searchParams.set('lang', l === 'en' ? 'en' : 'es');
    if (id === 'editor') {
      var marcaEditor = marcaDeEditor();
      if (marcaEditor) u.searchParams.set('marca', marcaEditor);
    }
    u.searchParams.set('ax_demo', id || 'hoy');
    u.searchParams.set('ax_run', Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9));
    return u.href;
  }
  // Frases de /demo 1 (locución). El catálogo guarda el castellano; el inglés se pinta al vuelo.
  var FRASE_EN = {
    'Crear locución': 'Create a voiceover',
    'De un guion breve a una voz lista para escuchar.': 'From a short script to a voice ready to hear.',
    'Escribe el mensaje de tu tienda y elige idioma, voz y tono.': 'Write your store message and choose language, voice and tone.',
    'Cafetería Demo · café y bollería': 'Demo café · coffee and pastries',
    'Voz adulta cálida y cercana': 'Warm, close adult voice',
    'Espanol (ES)': 'Spanish (ES)',
    'Cercano': 'Warm',
    'Bienvenidos a nuestra cafetería. Haz una pausa y disfruta de un café recién hecho. Pregunta por la combinación de café y bollería. Te esperamos.': 'Welcome to our coffee shop. Take a break and enjoy a freshly made coffee. Ask about the coffee and pastry pairing. We are waiting for you.',
    'Aquí se crea la locución. Escuchamos la muestra preparada en castellano.': 'The voiceover is created here. We listen to the prepared Spanish sample.'
  };
  function alIdioma(es) {
    es = String(es == null ? '' : es);
    if (lang() !== 'en') return es;
    return Object.prototype.hasOwnProperty.call(FRASE_EN, es) ? FRASE_EN[es] : es;
  }
  function demoIdioma(log) {
    var L = localM();
    var sub = L && L.subdemos && L.subdemos[0];
    var nativo = root.AdmiraDemoControl && root.AdmiraDemoControl.state && root.AdmiraDemoControl.state();
    if (!(recorrido && recorrido.activo) && !(nativo && nativo.activo) && sub) mostrarMuestra(sub, 1);
    var fase = null;
    if (recorrido && recorrido.activo) fase = recorrido.fase;
    else if (nativo && nativo.activo) fase = nativo.fase;
    else {
      nativo = root.AdmiraDemoControl && root.AdmiraDemoControl.state && root.AdmiraDemoControl.state();
      if (nativo && nativo.activo) fase = nativo.fase;
    }
    if (fase == null) {
      out(log, T('Esta página no tiene la demo 1. /demo idioma enseña el cambio de idioma sin cortar el paso.', 'This page has no demo 1. /demo idioma shows the language change without dropping the step.'), 'err');
      return {ok: false};
    }
    var destino = lang() === 'en' ? 'es' : 'en';
    applyLang(destino);
    var fase2 = recorrido && recorrido.activo ? recorrido.fase : null;
    if (fase2 == null && root.AdmiraDemoControl && root.AdmiraDemoControl.state) {
      var st = root.AdmiraDemoControl.state();
      if (st && st.activo) fase2 = st.fase;
    }
    var frase = '';
    try { var ph = document.querySelector('[data-demo-phase]'); if (ph) frase = ph.textContent || ''; } catch (_) {}
    var mismo = fase2 === fase && lang() === destino;
    out(log, (mismo ? T('bien', 'ok') : T('mal', 'bad')) + ' · ' + T('paso ', 'step ') + String(fase2 == null ? '—' : fase2) + ' · ' + destino + (frase ? ' · ' + frase : ''));
    return {ok: !!mismo, fase: fase2, lang: lang()};
  }
  function updatesDemoUrl(l) { return 'https://www.admiranext.com/demo/pixeria-novedades/?run=1&lang=' + (l === 'en' ? 'en' : 'es'); }
  function planViaje(plan) {
    if (!plan || plan.kind !== 'macro' || typeof btoa !== 'function') return '';
    var ctx = plan.context || {};
    var copia = {kind:'macro', id:plan.id, version:plan.version, title:plan.title || null, context:{}, items:(plan.items || []).map(function (item) {
      var sub = item.subdemo || {};
      var limpio = {};
      ['id','slug','title','steps','aliases'].forEach(function (k) { if (sub[k] != null) limpio[k] = sub[k]; });
      return {ref:item.ref, subdemo:limpio};
    })};
    if (plan.slug) copia.slug = plan.slug;
    if(plan.piece)copia.piece=plan.piece;
    ['lang','marca','project','circuit'].forEach(function (k) { if (typeof ctx[k] === 'string' && ctx[k] && ctx[k].length <= 80) copia.context[k] = ctx[k]; });
    if (plan.transition && Number(plan.transition.seconds) >= 3) copia.transition = {seconds:Number(plan.transition.seconds)};
    var json = '';
    try { json = JSON.stringify(copia); } catch (_) { return ''; }
    if (!json || json.length > 12000 || /token|secret|csrf|password/i.test(json)) return '';
    try {
      var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      return b64 && b64.length <= 16000 ? b64 : '';
    } catch (_) { return ''; }
  }
  function urlMacro(plan, index, runId, langForzado, fin) {
    var hogares = {biz:'https://www.admira.biz/', app:'https://www.admira.app/retailer', store:'https://www.admira.store/', studio:'https://www.admira.studio/', tv:'https://www.admira.tv/'};
    var gemelos = {biz:['admira.biz','clearchannel.tv'], app:['admira.app','yokup.com'], store:['admira.store','xpaceos.com'], studio:['admira.studio','pixeria.com'], tv:['admira.tv']};
    var item = plan.items[index];
    var site = String(item.ref || '').split('/')[0];
    var base = hogares[site] || 'https://www.admiranext.com/demo/';
    var subUrl = item.subdemo && item.subdemo.url;
    if (typeof subUrl === 'string') {
      try {
        var parsed = new URL(subUrl);
        var hostPieza = parsed.hostname.replace(/^www\./, '');
        if ((gemelos[site] || []).indexOf(hostPieza) >= 0 && !parsed.username && !parsed.password) base = parsed.origin + parsed.pathname;
      } catch (_) {}
    }
    var url = new URL(base);
    url.search = ''; url.hash = ''; url.username = ''; url.password = '';
    var ctx = plan.context || {};
    var idioma = langForzado === 'en' || langForzado === 'es' ? langForzado : (ctx.lang === 'en' ? 'en' : 'es');
    url.searchParams.set('ax_demo', 'macro:' + plan.id);
    url.searchParams.set('ax_run', String(runId || 'run'));
    url.searchParams.set('ax_i', String(index));
    url.searchParams.set('ax_v', String(plan.version));
    if(plan.piece)url.searchParams.set('ax_piece',plan.piece);
    ['project','circuit'].forEach(function (k) { if (typeof ctx[k] === 'string' && ctx[k] && ctx[k].length <= 80) url.searchParams.set(k, ctx[k]); });
    var marcaPagina = marcaDeEditor();
    var marcaPlan = marcaPagina || (typeof ctx.marca === 'string' ? ctx.marca : '');
    if (marcaPlan && marcaPlan.length <= 80) url.searchParams.set('marca', marcaPlan);
    url.searchParams.set('lang', idioma);
    if (Number.isInteger(fin) && fin > index && fin < plan.items.length) url.searchParams.set('ax_fin', String(fin));
    var viaje = planViaje(plan);
    if (viaje) url.searchParams.set('ax_plan', viaje);
    return url.href;
  }
  function listarCatalogo(log) {
    fetch(origenCatalogo() + '/api/demos', {cache: 'no-store', credentials: 'omit'}).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) { out(log, T('No pude leer el catálogo de demos.', 'I could not read the demo catalog.'), 'err'); return; }
      recogerNombres(j);
      function titulo(doc) { var tx = doc && doc.title; if (!tx) return (doc && doc.id) || ''; return lang() === 'en' ? (tx.en || tx.es || '') : (tx.es || tx.en || ''); }
      var demos = (j.demos || []).map(function (d) { return '/demo ' + d.id + ' · ' + titulo(d); });
      var macros = (j.macros || []).map(function (d) {
        var nombre = d.slug || d.id;
        var alias = (d.aliases || []).filter(Boolean).join(', ');
        return '/demo ' + nombre + ' · ' + titulo(d) + (alias ? ' · ' + alias : '');
      });
      out(log, T('Demos publicadas:', 'Published demos:') + '\n' + (demos.join('\n') || '—') + '\n' + T('Macros:', 'Macros:') + '\n' + (macros.join('\n') || '—'));
    }).catch(function () { out(log, T('No pude leer el catálogo de demos.', 'I could not read the demo catalog.'), 'err'); });
  }
  function lanzarCatalogo(id, log, pieza) {
    var runId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    var base = origenCatalogo();
    var nombre = pieza ? (id + '.' + pieza) : id;
    var aplicar = function (plan, index) {
      if (!plan || (plan.kind !== 'macro' && plan.kind !== 'demo')) { out(log, T('Demo desconocida: ', 'Unknown demo: ') + nombre, 'err'); return; }
      var destino;
      if (plan.kind === 'macro' && plan.items && plan.items.length) {
        var i = index == null ? 0 : index;
        if (i < 0 || i >= plan.items.length) { out(log, T('Demo desconocida: ', 'Unknown demo: ') + nombre, 'err'); return; }
        destino = urlMacro(plan, i, runId, lang(), pieza ? i + 1 : null);
      } else {
        var site = plan.site || plan.id;
        var hogares = {biz:'https://www.admira.biz/', app:'https://www.admira.app/retailer', store:'https://www.admira.store/', studio:'https://www.admira.studio/', tv:'https://www.admira.tv/'};
        destino = new URL(hogares[site] || 'https://www.admiranext.com/demo/');
        destino.searchParams.set('ax_demo', site);
        destino.searchParams.set('ax_run', runId);
        destino.searchParams.set('lang', lang() === 'en' ? 'en' : 'es');
        var marcaPieza = marcaDeEditor();
        if (marcaPieza) destino.searchParams.set('marca', marcaPieza);
        destino = destino.href;
      }
      out(log, T('Abriendo ', 'Opening ') + destino);
      setTimeout(function () { location.assign(destino); }, 600);
    };
    if (publishedCatalog && publishedCatalog.demos.some(function (doc) { return doc.id === id; })) {
      return fetch(base+'/api/demos/'+encodeURIComponent(id)+'/run'+(pieza?'?piece='+encodeURIComponent(pieza):''),{cache:'no-store',credentials:'omit'}).then(function (r) { if(!r.ok)throw Error('Demo no disponible');return r.json(); }).then(function (plan) { plan.piece=pieza;aplicar(plan,0); }).catch(function(e){out(log,String(e.message||e),'err');});
    }
    return fetch(base + '/api/demos/resolver?nombre=' + encodeURIComponent(nombre), {cache: 'no-store', credentials: 'omit'}).then(function (r) { return r.ok ? r.json() : null; }).then(function (res) {
      if (res && res.tipo === 'ambiguo') { out(log, T('Hay más de una demo con ese nombre. Escribe /demo lista.', 'More than one demo uses that name. Type /demo list.'), 'err'); return; }
      if (res && res.tipo === 'reservado') { out(log, T('Ese nombre está reservado.', 'That name is reserved.'), 'err'); return; }
      if (res && res.plan) { aplicar(res.plan, res.tipo === 'pieza' ? res.index : 0); return null; }
      return fetch(base + '/api/demos/' + encodeURIComponent(id), {cache: 'no-store', credentials: 'omit'}).then(function (r) { return r.ok ? r.json() : null; }).then(function (plan) {
        var index = 0;
        if (pieza && plan && plan.items) {
          index = -1;
          plan.items.forEach(function (item, n) {
            var cola = String(item.ref || '').split('/')[1];
            var sub = item.subdemo || {};
            if (index < 0 && (cola === pieza || sub.id === pieza || sub.slug === pieza)) index = n;
          });
        }
        aplicar(plan, index);
      });
    }).catch(function () { out(log, T('No pude leer el plan.', 'I could not read the plan.'), 'err'); });
  }
  function demoRun(p, log) {
    if(p.android){
      if (/^\/?demo\s+android\s+(?:help|ayuda)$/i.test(p.android)) { out(log, '/demo android — Fold + Watch\n/demo android Fold8 — plegable\n/demo android watch — visor\n/demo android [Fold8|watch] ["playlist"|#tag]\nPlaylist del proyecto activo. Fold8 es alias de un perfil Pixel Fold Android 16, sin firmware Samsung. Watch: Wear OS 4; audio como título silencioso. Requiere el lanzador Admira Native Demo en este Mac. El envío no confirma la reproducción.'); return {id:'android',help:true}; }
      out(log,T('Solicitando la demo Android del proyecto. Si el navegador lo pide, acepta Abrir Admira Native Demo.', 'Requesting the project Android demo. If prompted, accept Open Admira Native Demo.'));
      var androidModuleURL = new URL('demo-android.mjs?v=20261012-android-1', script.src || 'https://www.admiranext.com/suite/experto.js').href;
      import(androidModuleURL).then(function(m){return m.runAndroid(p.android,root);}).then(function(r){out(log,T('Solicitud enviada al lanzador del Mac: ','Request sent to the Mac launcher: ')+r.project+' · '+r.playlist.name+' · '+r.device);}).catch(function(e){out(log,String(e.message||e),'err');});
      return {id:'android',native:true};
    }
    if(p.ios){
      if (/^\/?demo\s+ios\s+(?:help|ayuda)$/i.test(p.ios)) { out(log,iosHelp()); return {id:'ios',help:true}; }
      out(log,T('Solicitando la demo nativa. Si Chrome lo pide, acepta Abrir Admira IOS Demo. Requiere el lanzador instalado en este Mac.', 'Requesting the native demo. If Chrome asks, accept Open Admira IOS Demo. The launcher must be installed on this Mac.'));
      var moduleURL = new URL('demo-ios.mjs?v=20261012-ios-1', script.src || 'https://www.admiranext.com/suite/experto.js').href;
      import(moduleURL).then(function(m){return m.runIOS(p.ios,root);}).then(function(r){out(log,T('Solicitud enviada al lanzador del Mac: ','Request sent to the Mac launcher: ')+r.project+' · '+r.playlist.name+' · '+r.device);}).catch(function(e){out(log,String(e.message||e),'err');});
      return {id:'ios',native:true};
    }
    if (p.updates) { var updatesUrl=updatesDemoUrl(p.lang); out(log,T('Abriendo Pixeria · novedades, recorrido preparado…','Opening Pixeria updates, prepared tour…')); location.assign(updatesUrl); return {id:'pixeria-novedades-20261009',url:updatesUrl}; }
    if (p.idiomaDemo) return demoIdioma(log);
    if(p.global){var globalUrl='https://www.admira.biz/demo/?lang='+T('es','en');out(log,T('Abriendo demo global · Sneakers Store…','Opening global demo · Sneakers Store…'));location.assign(globalUrl);return {id:'global',url:globalUrl};}
    if (p.funcion) {
      applyLang(p.lang);
      var furl = funcionDemoUrl(p.funcion, p.lang);
      var enNombre = {hoy:'today', proyectos:'projects', idioma:'language', marcas:'brands', roadmap:'roadmap'};
      var etiqueta = p.lang === 'en' ? (enNombre[p.funcion] || p.funcion) : (p.funcion === 'hoy' ? 'hoy' : p.funcion);
      out(log, p.lang === 'en' ? ('Demo ' + etiqueta + ' · the walkthrough runs in English.') : ('Demo ' + etiqueta + ' · el recorrido comprueba cada paso.'));
      out(log, (p.lang === 'en' ? 'Opening ' : 'Abriendo ') + furl);
      setTimeout(function () { location.assign(furl); }, 600);
      return {id: p.funcion, lang: p.lang, url: furl};
    }
    if (p.control && root.PixeriaUpdatesDemo) { var updateAction={pausa:'pause',reanudar:'resume',continuar:'resume',parar:'stop',off:'stop',siguiente:'next'}[p.control] || p.control; var updateState=root.PixeriaUpdatesDemo.control(updateAction); out(log,JSON.stringify(updateState)); return updateState; }
    if (p.control) { var native = root.AdmiraDemoControl; var nativeControl = {pausa:'pause',pause:'pause',reanudar:'resume',resume:'resume',continuar:'resume',parar:'stop',stop:'stop',off:'stop',siguiente:'next',next:'next'}[p.control]; var state = native && native.state().activo ? (nativeControl ? native.control(nativeControl) : native.state()) : controlarRecorrido(p.control); out(log, JSON.stringify(state)); return state; }
    if (p.auto) { var L = localM(); if (!L.subdemos.length) { out(log, T('No hay subdemos en este catálogo.', 'No subdemos in this catalog.')); return null; } mostrarMuestra(L.subdemos[0], 1, L.subdemos, 0); return estadoRecorrido(); }
    if (p.catalogo) { lanzarCatalogo(p.catalogo, log, p.pieza); return {id: p.catalogo, pieza: p.pieza || ''}; }
    if (p.lista) { out(log, (p.local ? localLista() : demoLista())+'\n'+demoExtensionHelp()); if (p.catalogoLista) listarCatalogo(log); return null; }
    if (p.desconocida != null) { out(log, T('Demo desconocida: ', 'Unknown demo: ') + p.desconocida + T('. Escribe /demo help.', '. Type /demo help.') + '\n' + localLista(), 'err'); return null; }
    if (p.local && p.sub && p.sub.catalogId) { return lanzarCatalogo(p.sub.catalogId,log,p.sub.id); }
    if (p.local) {
      var d = p.sub, modo = p.modo || 'muestra';
      out(log, 'Demo ' + p.n + ' · ' + d.nombre + (d.desc ? ' — ' + d.desc : ''));
      try { document.dispatchEvent(new CustomEvent('admira:demo', {detail: {id: p.clave, url: abs(subUrl(d)), modo: modo}})); } catch (_) {}
      if ((modo === 'muestra' && d.muestra && d.muestra.url) || modo === 'recorrido') { out(log, modo === 'recorrido' ? T('Recorrido preparado: guion y datos de demostración.', 'Prepared walkthrough: script and demonstration data.') : T('Modo muestra: resultado preparado, sin generar ni publicar.', 'Sample mode: prepared result, nothing generated or published.')); mostrarMuestra(d, p.n); }
      else { out(log, T('Abriendo ', 'Opening ') + abs(subUrl(d)) + '…'); setTimeout(function () { location.assign(abs(subUrl(d))); }, 600); }
      return {id: p.clave, nombre: d.nombre, desc: d.desc || ''};
    }
    var g = p.demo;
    if(publishedCatalog && publishedCatalog.demos.some(function(doc){return doc.id===g.id;}))return lanzarCatalogo(g.id,log);
    var url = demoLaunchUrl(g);
    if (root.AdmiraDemoControl && root.AdmiraDemoControl.state().activo) root.AdmiraDemoControl.control('stop');
    cerrarMuestra();
    out(log, T('Demo ', 'Demo ') + (p.i + 1) + '/5 · ' + g.nombre + ' — ' + T(g.desc[0], g.desc[1]));
    out(log, T('Abriendo ', 'Opening ') + url + '…');
    try { document.dispatchEvent(new CustomEvent('admira:demo', {detail: {id: g.id, url: url}})); } catch (_) {}
    setTimeout(function () { location.assign(url); }, 600);
    return {id: g.id, nombre: g.nombre, desc: T(g.desc[0], g.desc[1])};
  }
  // Punto de entrada común para Experto y avatar: texto «/demo …» → lo ejecuta y devuelve qué enseña.
  function demoTexto(text, log) {
    var p = parseDemo(text);
    if (!p) return null;
    log = log || (panel && panel.querySelector('.ax-cli-out')) || {appendChild: function () {}, children: [], removeChild: function () {}};
    return execute(text, log, {echo:false});
  }
  verb({name: 'demo', args: 'android [Fold8|watch] [playlist|#tag] | ios [iphone|watch] [playlist|#tag] | [global|help|hoy|today|proyectos|projects|idioma|language|marcas|brands|roadmap|editor|número|nombre|auto|pausa|reanudar|stop|studio|store|tv|app|biz|siguiente]', desc: ['enseña una demo o encadena los ensayos locales sin operaciones reales (sin argumento: lista)', 'show a demo or run local rehearsals without real operations (no argument: list)'], run: function (a, log) {
    var localAction=localDemoAction(a,log); if(localAction)return localAction.result;
    if (!catalogReady && !/^(?:android|ios|pausa|pause|reanudar|resume|stop|off|estado|status)(?:\s|$)/i.test(a.join(' '))) return localListo.then(function(){return execute('/demo '+a.join(' '),log,{echo:false,record:false});});
    var p = parseDemo('/demo ' + a.join(' '));
    if (!p) { out(log, T('Demo desconocida: ', 'Unknown demo: ') + a.join(' ') + '\n' + demoLista(), 'err'); return; }
    return demoRun(p, log);
  }});
  verb({name: 'demos', args: 'editar|edit', desc: ['abre el editor de demos', 'opens the demo editor'], run: function (a, log) {
    var arg = norm(a.join(' '));
    if (arg !== 'editar' && arg !== 'edit') { out(log, T('Usa /demos editar o /demos edit.', 'Use /demos editar or /demos edit.'), 'err'); return; }
    demoRun({funcion: 'editor', lang: lang()}, log);
  }});

  // Avatar conversacional. Un solo cargador (admiranext.com/assets/avatar.js): good = Admirito (nube animada),
  // better = chica Ready Player Me, best = Neo. En modo piel el CLI de la pata ya lo tiene;
  // aquí entra el modo propio (data-mount), que es el dock de las patas sin consola.
  var AVATAR_SRC = 'https://www.admiranext.com/assets/avatar.js?v=20261007-demo-1';
  function avatarApi() {
    if (root.AdmiraAvatar && root.AdmiraAvatar.handle) return Promise.resolve(root.AdmiraAvatar);
    var tag = document.querySelector('script[data-admira-avatar]');
    if (!tag) {
      tag = document.createElement('script');
      tag.src = AVATAR_SRC;
      tag.async = true;
      tag.setAttribute('data-admira-avatar', '');
      (document.head || document.documentElement).appendChild(tag);
    }
    return new Promise(function (resolve) {
      var done = function () { resolve(root.AdmiraAvatar || null); };
      if (root.AdmiraAvatar) return done();
      tag.addEventListener('load', done, {once: true});
      tag.addEventListener('error', done, {once: true});
      setTimeout(done, 4000);
    });
  }
  function avatarRun(text, log) {
    return avatarApi().then(function (A) {
      if (!A) { out(log, T('Avatar digital no disponible', 'Digital avatar unavailable'), 'err'); return; }
      return Promise.resolve(A.handle(text)).then(function (msg) { if (msg) out(log, String(msg)); });
    });
  }
  verb({name: 'avatar', args: '[avatar|human|metahuman]', desc: [
    'avatar abre a Admirito, la nube animada (mueve los labios y hace cosas sola) · human abre a Luna, la anfitriona web (Ready Player Me) · metahuman abre a Neo (MetaHuman; si el host de render está apagado, cae a Luna). good/better/best siguen como alias. Sin nivel, el estado. /avatarON lo muestra y /avatarOFF lo oculta. /avatar reset vuelve al interruptor del proyecto',
    'avatar opens Admirito, the animated cloud · human opens Luna, the web host (Ready Player Me) · metahuman opens Neo (MetaHuman; if the render host is off, Luna takes over). good/better/best kept as aliases. Alone, the status. /avatarON shows it and /avatarOFF hides it. /avatar reset follows the project switch'
  ], run: function (a, log) { return avatarRun('/avatar' + (a.length ? ' ' + a.join(' ') : ''), log); }});
  verb({name: 'avataron', desc: ['muestra el avatar digital y lo recuerda', 'show the digital avatar and remember it'], run: function (a, log) { return avatarRun('/avatarON', log); }});
  verb({name: 'avataroff', desc: ['oculta el avatar digital y lo recuerda', 'hide the digital avatar and remember it'], run: function (a, log) { return avatarRun('/avatarOFF', log); }});
  verb({name: 'avatardigital', alias: ['digitalavatar'], desc: ['sin nada, muestra u oculta a Admirito (la nube); con on/off lo fija', 'alone, shows or hides Admirito (the cloud); on/off sets it'], run: function (a, log) {
    return avatarRun('/avatarDigital' + (a.length ? ' ' + a.join(' ') : ''), log);
  }});
  verb({name: 'admirito', desc: ['muestra u oculta a Admirito, la mascota nube', 'show or hide Admirito, the cloud mascot'], run: function (a, log) {
    return avatarRun('/admirito' + (a.length ? ' ' + a.join(' ') : ''), log);
  }});
  verb({name: 'cli', args: 'ayudante|helper', desc: ['interruptor del avatar en esta consola', 'avatar switch on this console'], run: function (a, log) {
    if (/^(ayudante|helper)$/i.test(a[0] || '')) return avatarRun('/cli ' + a.join(' '), log);
    out(log, T('En esta consola, /cli ayudante es el avatar. /avatar good, /avatar better o /avatar best elige la cara.', 'On this console, /cli helper is the avatar. /avatar good, /avatar better or /avatar best picks the face.'), 'err');
  }});

  // opts.echo === false: quien llama ya pintó la orden (p. ej. el CLI del armazón de admiranext.com).
  function sharedCommand(text) {
    var t = String(text || '').trim();
    return !!(parseLangCommand(t) || (t.charAt(0) === '/' && (parseArquitectura(t) || parseDemo(t))));
  }
  function execute(text, log, opts) {
    var t = String(text || '').trim();
    if (!t) return;
    if (!opts || opts.echo !== false) out(log, '› ' + t, 'cmd');
    if(!opts||opts.record!==false)recordCommand(t);
    if (handleLangCommand(t, log)) return;
    var parts = t.replace(/^\//, '').split(/\s+/), name = (parts.shift() || '').toLowerCase();
    var v = findVerb(name), c = v ? null : compacto(name);
    if (c) { name = c.name; parts.unshift(c.arg); v = findVerb(name); }
    if (!v) { var unknown=T('Verbo desconocido: /', 'Unknown verb: /') + name + T(' · escribe /help', ' · type /help');out(log,unknown,'err');return {ok:false,error:unknown}; }
    // El idioma del verbo pasa a ser el de la web, cuando la orden ya ha hecho lo suyo.
    var idioma = idiomaDeVerbo(name);
    var cambiaIdioma = function () {
      if (!idioma || idioma === lang()) return;
      applyLang(idioma);
      out(log, langMessage(idioma));
    };
    try {
      var actionArgs=parts;
      if(v.attributes){
        actionArgs={};var rest=parts.join(' '),match=rest.match(/^([^\s=:]+)\s*[=:]\s*([\s\S]+)$/),attrs=v.attributes;
        var attr=match&&attrs.filter(function(a){return a.key===match[1]||(a.aliases||[]).indexOf(match[1])>=0;})[0];
        if(rest){attr=attr||attrs[0];if(!attr)throw Error(T('Esta orden no admite atributos','This command takes no attributes'));var value=attr&&match&&(attr.key===match[1]||(attr.aliases||[]).indexOf(match[1])>=0)?match[2]:rest;actionArgs[attr.key]=attr.normalize?attr.normalize(value):value;}
        attrs.forEach(function(a){if(a.required&&!actionArgs[a.key])throw Error(T('Falta el atributo: ','Missing attribute: ')+a.key);});
      }
      var r = v.run(actionArgs, log, {raw:t,name:name,args:parts.join(' ')});
      if (r && typeof r.then === 'function') return r.then(function (x) { cambiaIdioma(); return x; }, function (e) { cambiaIdioma(); out(log,String(e && e.message || e),'err'); return {ok:false,error:String(e && e.message || e)}; });
      cambiaIdioma();
      return r;
    } catch (e) { var error=String(e&&e.message||e);out(log,error,'err');return {ok:false,error:error}; }
  }

  function build() {
    var host = document.querySelector(cfg.mount);
    if (!host) return false;
    var bd = (cfg.mountBody && host.querySelector(cfg.mountBody)) || host;
    var previous = Array.prototype.slice.call(bd.childNodes);
    var hd = document.createElement('div');
    hd.className = 'ax-own-hd';
    hd.innerHTML = '<strong class="ax-own-title"></strong>';
    var body = document.createElement('div');
    body.className = 'ax-own-body';
    body.innerHTML = '<div class="ax-own-cli"><ol class="ax-own-out" role="log" aria-live="polite" tabindex="0"></ol>' +
      '<form class="ax-own-form" autocomplete="off"><input class="ax-own-input" id="axCliInput" type="text" spellcheck="false" autocapitalize="off" aria-label="' + T('Orden para el CLI', 'CLI command') + '"></form></div>';
    var keep = previous.filter(function (n) { return !(n.nodeType === 1 && n.classList.contains('af-empty')) && !(n.nodeType === 3 && !n.textContent.trim()); });
    previous.forEach(function (n) { if (n.parentNode === bd) bd.removeChild(n); });
    if (keep.length) {
      var ex = document.createElement('section');
      ex.className = 'ax-own-extra';
      keep.forEach(function (n) { ex.appendChild(n); });
      body.appendChild(ex);
    }
    bd.appendChild(hd);
    bd.appendChild(body);
    bd.classList.add('ax-own-panel');
    var form = body.querySelector('.ax-own-form'), input = body.querySelector('.ax-own-input'), log = body.querySelector('.ax-own-out');
    var hist = [], cur = 0;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = input.value; input.value = '';
      if (t.trim()) { hist.push(t); hist = hist.slice(-30); cur = hist.length; }
      execute(t, log);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); cur = Math.max(0, cur - 1); input.value = hist[cur] || ''; }
      else if (e.key === 'ArrowDown' && hist.length) { e.preventDefault(); cur = Math.min(hist.length, cur + 1); input.value = hist[cur] || ''; }
      else if (e.key === 'Tab' && input.value.trim()) {
        var pre = input.value.trim().replace(/^\//, '').toLowerCase();
        // Autocompleta nombres y alias (castellano e inglés): gana la forma que se está escribiendo.
        var cand = [];
        verbs.forEach(function (v) { [v.name].concat(v.alias || []).forEach(function (n) { if (n.indexOf(pre) === 0 && /^[a-z0-9]/.test(n)) cand.push({v: v, n: n}); }); });
        var distintos = cand.filter(function (x, i) { return cand.findIndex(function (y) { return y.v === x.v; }) === i; });
        if (distintos.length === 1) { e.preventDefault(); input.value = '/' + distintos[0].n + ' '; }
      }
    });
    cfg.panel = cfg.mount; cfg.header = '.ax-own-hd'; cfg.title = '.ax-own-title'; cfg.body = '.ax-own-body';
    cfg.form = '.ax-own-form'; cfg.input = '.ax-own-input'; cfg.log = '.ax-own-out'; cfg.hint = '.ax-own-hint';
    cfg.extras = '.ax-own-extra'; cfg.chrome = cfg.chrome === '.expert-module-head,.expert-module-resizer,.expert-layout-menu' ? '' : cfg.chrome;
    return true;
  }

  // ── Minimizado = una línea de orden ─────────────────────────────────────────
  // Carlos (4-oct 23:11): «no es cerrada es minimizada, que se pueda escribir pero no ocupe mucho
  // espacio». Minimizado solo queda la orden «› /help» (escribible) con un asa pequeña encima;
  // el asa, el ▾ de la cabecera o el ⌘ de la pata despliegan/pliegan, y una orden lanzada en
  // minimizado lo despliega para que se vea la respuesta. La página reserva abajo ese alto.
  function isOpen() { return !!panel && !panel.classList.contains('ax-min'); }
  function pad() {
    if (!panel) return;
    if (cfg.minHide) { document.documentElement.style.setProperty('--ax-dock-pad', '0px'); return; }
    var h = panel.classList.contains('ax-min') ? panel.offsetHeight : 0;
    if (h) document.documentElement.style.setProperty('--ax-dock-pad', h + 'px');
  }
  function setOpen(open, remember) {
    if (!panel || !panel.classList.contains('ax-dock')) return;
    panel.classList.toggle('ax-min', !open);
    panel.classList.toggle('ax-hide', cfg.minHide && !open);
    document.documentElement.setAttribute('data-ax-dock', open ? 'open' : cfg.minHide ? 'hidden' : 'min');
    var lab = open ? (cfg.minHide ? T('Ocultar el modo Experto', 'Hide Expert mode') : T('Minimizar el modo Experto', 'Minimise Expert mode')) : T('Desplegar el modo Experto', 'Expand Expert mode');
    [].forEach.call(panel.querySelectorAll('.ax-fold,.ax-grip'), function (f) {
      if (f.classList.contains('ax-fold')) f.textContent = open ? '▾' : '▴';
      f.setAttribute('aria-expanded', open ? 'true' : 'false');
      f.setAttribute('aria-label', lab); f.title = lab;
    });
    if (remember) { try { dockStore().setItem(DOCK_KEY, open ? '1' : '0'); } catch (_) {} }
    if (open) {
      var log = panel.querySelector('.ax-cli-out');
      if (log) setTimeout(function () { log.scrollTop = log.scrollHeight; }, 0);
    } else pad();
    try { root.dispatchEvent(new Event('resize')); } catch (_) {}
  }
  function dock(hd, form) {
    if (!cfg.dock || panel.classList.contains('ax-dock')) return;
    // Caminos de la orden y de la cabecera hasta el panel: minimizado solo queda la orden.
    for (var n = form.parentNode; n && n !== panel; n = n.parentNode) n.classList.add('ax-form-path');
    var f = document.createElement('button');
    f.type = 'button';
    f.className = 'ax-fold';
    hd.appendChild(f);
    hd.addEventListener('click', function (e) {
      if (e.target.closest('button:not(.ax-fold),a,input,select,textarea,summary,label')) return;
      setOpen(!isOpen(), true);
    });
    var g = document.createElement('button');
    g.type = 'button';
    g.className = 'ax-grip';
    g.addEventListener('click', function () { setOpen(!isOpen(), true); });
    panel.insertBefore(g, panel.firstChild);
    // Una orden lanzada en minimizado despliega el panel (sin recordarlo) para ver la respuesta.
    form.addEventListener('submit', function () { if (!isOpen()) setOpen(true, false); }, true);
    if (cfg.toggle) {
      document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest(cfg.toggle);
        if (t && !panel.contains(t)) setOpen(!isOpen(), true);
      }, true);
    }
    panel.classList.add('ax-dock');
    var sp = document.createElement('div');
    sp.className = 'ax-dock-spacer';
    sp.setAttribute('aria-hidden', 'true');
    document.body.appendChild(sp);
    try { new ResizeObserver(pad).observe(panel); } catch (_) {}
    var open = false;
    try { open = dockStore().getItem(DOCK_KEY) === '1'; } catch (_) {}
    setOpen(open, false);
  }

  function apply() {
    if (cfg.mount && !document.querySelector(cfg.mount + ' .ax-own-form') && !document.querySelector(cfg.panel + ' ' + cfg.form)) {
      if (!build()) return false;
    }
    panel = document.querySelector(cfg.panel);
    var form = panel && panel.querySelector(cfg.form);
    var input = panel && panel.querySelector(cfg.input);
    var log = panel && panel.querySelector(cfg.log);
    if (!panel || !form || !input || !log) return false;
    cargarNombres();
    if (panel.classList.contains('ax-experto')) return true;
    document.documentElement.setAttribute('data-ax-experto', 'on');
    panel.classList.add('ax-experto');

    // Las asas y menús de bloque de la pata pueden aparecer después (expert-panel.js): CSS, no clases.
    if (cfg.chrome) {
      var st = document.createElement('style');
      st.id = 'ax-experto-chrome';
      st.textContent = cfg.chrome.split(',').map(function (s) { return 'html[data-ax-experto] .ax-experto ' + s.trim(); }).join(',') + '{display:none!important}';
      document.head.appendChild(st);
    }

    // Cabecera
    var hd = panel.querySelector(cfg.header);
    if (!hd) { hd = document.createElement('div'); panel.insertBefore(hd, panel.firstChild); }
    hd.classList.add('ax-hd');
    var title = panel.querySelector(cfg.title);
    if (!title) { title = document.createElement('strong'); hd.insertBefore(title, hd.firstChild); }
    title.classList.add('ax-title');
    title.textContent = '⌘ ' + T('EXPERTO', 'EXPERT') + ' · CLI';
    title.setAttribute('data-shell-text-es', '⌘ EXPERTO · CLI');
    title.setAttribute('data-shell-text-en', '⌘ EXPERT · CLI');

    // Cuerpo + ficha del motor
    var body = cfg.body ? panel.querySelector(cfg.body) : null;
    if (!body && form.parentNode === panel) {
      // Panel plano (registro y orden sueltos dentro del panel, p. ej. Pixeria/admira.studio):
      // se envuelven sin recrearlos, así el CLI de la pata conserva sus nodos y listeners.
      body = document.createElement('div');
      var inner = document.createElement('div');
      panel.insertBefore(body, log.parentNode === panel ? log : form);
      inner.appendChild(log); inner.appendChild(form);
      body.appendChild(inner);
    }
    if (!body) body = form.parentNode.parentNode;
    body.classList.add('ax-body');
    var cliModule = form.closest('[data-module]') || form.parentNode;
    if (cliModule === body) cliModule = form.parentNode;
    cliModule.classList.add('ax-cli-module');
    cliModule.removeAttribute('hidden');
    var slot = document.createElement('section');
    slot.className = 'ax-engine-slot';
    slot.setAttribute('aria-label', T('Motor de ', 'Engine of ') + cfg.pata);
    slot.innerHTML = '<pre class="ax-engine" aria-live="polite"></pre>';
    body.insertBefore(slot, body.firstChild);

    // CLI: registro arriba, orden «›» abajo (como digitalavatar.ai)
    var cli = form.parentNode;
    cli.classList.add('ax-cli');
    log.classList.add('ax-cli-out');
    form.classList.add('ax-cli-form');
    input.classList.add('ax-cli-input');
    // Algunas patas reescriben el placeholder al traducir: en la piel de la suite es /ayuda en castellano y
    // /help en inglés (06-10-2026: el verbo sugerido no cambia el idioma de la web al escribirlo).
    var pista = function () { return T('/ayuda', '/help'); };
    input.setAttribute('placeholder', pista());
    try {
      new MutationObserver(function () { if (input.getAttribute('placeholder') !== pista()) input.setAttribute('placeholder', pista()); })
        .observe(input, {attributes: true, attributeFilter: ['placeholder']});
      new MutationObserver(function () { if (input.getAttribute('placeholder') !== pista()) input.setAttribute('placeholder', pista()); })
        .observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
    } catch (_) {}
    if (!form.querySelector('.ax-cli-prompt')) {
      var prompt = document.createElement('label');
      prompt.className = 'ax-cli-prompt';
      prompt.textContent = '›';
      if (input.id) prompt.htmlFor = input.id;
      form.insertBefore(prompt, form.firstChild);
    }
    if (cfg.moveLog && log.parentNode !== cli) cli.insertBefore(log, form);
    if (log.parentNode === cli) cli.insertBefore(form, log.nextSibling);
    // Orden en textarea (admira.store): una sola línea; Enter ya lo gestiona la pata.
    if (input.tagName === 'TEXTAREA') input.rows = 1;
    var hint = panel.querySelector(cfg.hint);
    if (hint) { hint.classList.add('ax-cli-hint'); cli.appendChild(hint); }
    hello(log);

    // Extras de la pata (verbos, rutinas…) tras un botón
    tagAll(cfg.extras, 'ax-extra');
    if (panel.querySelector('.ax-extra') && !hd.querySelector('.ax-extras-btn')) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ax-extras-btn';
      b.setAttribute('aria-pressed', 'false');
      b.textContent = '＋ ' + extrasLabel();
      b.addEventListener('click', function () {
        var on = panel.classList.toggle('ax-extras-on');
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.textContent = (on ? '－ ' : '＋ ') + extrasLabel();
      });
      hd.insertBefore(b, title.nextSibling);
    }

    // Una entrada para los comandos compartidos: consola, API y avatar usan execute.
    // Los adaptadores locales antiguos todavía deben migrar sus acciones al registro.
    (root.addEventListener ? root : form).addEventListener('submit', function (e) {
      if (e.target !== form) return;
      var val = (input && input.value != null) ? String(input.value).trim() : '';
      if (!val || (!adapterOwnsInput && !cfg.mount && !sharedCommand(val))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      input.value = '';
      if (!isOpen()) setOpen(true, false);
      execute(val, log);
      state = '';
      paint();
    }, true);
    // La ficha se repinta tras cada orden (/marca cambia el cliente) y al cambiar marca o idioma.
    form.addEventListener('submit', function () {
      state = T('ejecutando…', 'running…'); paint();
      setTimeout(function () { state = ''; paint(); }, 900);
      setTimeout(paint, 2500);
    }, true);
    document.addEventListener('admira:marca', paint);
    try { new MutationObserver(paint).observe(document.documentElement, {attributes: true, attributeFilter: ['lang', 'data-version', 'data-version-oculta']}); } catch (_) {}
    paint();
    dock(hd, form);
    if (readVersion() === '—' && cfg.versionUrl && document.documentElement.dataset.versionOculta !== '1') {
      fetch(cfg.versionUrl, {cache: 'no-store'}).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.version) { version = j.version; paint(); } }).catch(function () {});
    }
    return true;
  }

  root.AdmiraExperto = {
    paint: paint, lines: lines,
    setState: function (s) { state = s || ''; paint(); },
    set: function (k, v) { if (v == null) delete extra[k]; else extra[k] = v; paint(); },
    apply: apply,
    refreshCatalog: function(){localListo=refreshCatalog();return localListo;},
    catalog: function(){return publishedCatalog;},
    verb: verb,
    registerAdapter: registerAdapter,
    engineVersion: '20261012-unified-1',
    run: function (t) { var log = panel && panel.querySelector('.ax-cli-out'); if (log) return execute(t, log); },
    open: function () { setOpen(true, true); },
    close: function () { setOpen(false, true); },
    toggle: function () { setOpen(!isOpen(), true); },
    isOpen: isOpen,
    // admiranext.com (06-10-2026): el CLI del armazón (admira-frame.js) delega en estos verbos.
    // Añadidos compatibles: las cinco patas no los usan.
    list: function () { return verbs.map(function (v) { return {name: v.name, alias: (v.alias || []).slice(), args: v.args || '', desc: (v.desc || []).slice()}; }); },
    has: function (n) { n = String(n || '').replace(/^\//, '').toLowerCase(); return verbs.some(function (v) { return v.name === n || (v.alias || []).indexOf(n) >= 0; }); },
    idiomaDeVerbo: idiomaDeVerbo,
    pares: function () { return PARES_ES_EN.map(function (p) { return p.slice(); }); },
    exec: function (t, log, opts) { log = log || (panel && panel.querySelector('.ax-cli-out')); if (log) return execute(t, log, opts); },
    parseLangCommand: parseLangCommand,
    parseArquitectura: parseArquitectura, arquitecturaUrl: arquitecturaUrl,
    // /demo (7-oct-2026): catálogo de las cinco soluciones y lanzador, para el avatar digital.
    demos: function () { return DEMOS.map(function (d) { return {id: d.id, nombre: d.nombre, alias: d.alias.slice(), desc: T(d.desc[0], d.desc[1]), url: demoUrl(d)}; }); },
    parseDemo: function (t) { var p = parseDemo(t); if (!p) return null; if(p.android) return {id:'android',native:true,command:p.android}; if(p.ios) return {id:'ios',native:true,command:p.ios}; if(p.updates) return {id:'pixeria-novedades-20261009',lang:p.lang,url:updatesDemoUrl(p.lang)}; if (p.idiomaDemo) return {idiomaDemo: true}; if (p.funcion) return {funcion: p.funcion, lang: p.lang, id: p.funcion, url: funcionDemoUrl(p.funcion, p.lang)}; if (p.global) return {id:'global',url:'https://www.admira.biz/demo/'}; if (p.control) return {control: p.control}; if (p.auto) return {auto: true, local: true}; if (p.catalogo) { var cat = {catalogo: p.catalogo, id: p.catalogo}; if (p.pieza) cat.pieza = p.pieza; return cat; } if (p.lista) return p.local ? {lista: true, local: true} : {lista: true}; if (p.desconocida != null) return {desconocida: p.desconocida}; if (p.local) return {id: plataforma + '/' + p.sub.id, i: p.n - 1, url: abs(subUrl(p.sub)), local: true}; return {id: p.demo.id, i: p.i, url: demoUrl(p.demo)}; },
    demoEstado: function () { if(root.PixeriaUpdatesDemo) return root.PixeriaUpdatesDemo.state(); return root.AdmiraDemoControl && root.AdmiraDemoControl.state().activo ? root.AdmiraDemoControl.state() : estadoRecorrido(); },
    demoLaunchUrl: function(id) { var d=DEMOS.filter(function(x){return x.id===id;})[0];return d?demoLaunchUrl(d):''; },
    demo: demoTexto, plataforma: function () { return plataforma; }, subdemos: function () { return localM(); }, listo: function () { return localListo; }, resolverDemo: resolverDemo, anotarNombres: anotarNombres,
    normalizeLangToken: normalizeLangToken,
    setLanguage: applyLang
  };

  (root.AdmiraCommandAdapters || []).splice(0).forEach(function(connect){connect(root.AdmiraExperto);});
  try { root.dispatchEvent(new CustomEvent('admira:commands-ready',{detail:{version:root.AdmiraExperto.engineVersion}})); } catch (_) {}

  function bootNativeDemo() {
    var id; try { id = new URLSearchParams(location.search).get('ax_demo'); } catch (_) { return; }
    var nativo = /^(studio|store|tv|biz|app|hoy|proyectos|idioma|marcas|roadmap)$/.test(id || '');
    var macro = !!id && String(id).indexOf('macro:') === 0;
    if ((!nativo && !macro) || root.AdmiraDemoControl || document.querySelector('script[data-admira-native-control]')) return;
    var loader = document.createElement('script');
    var base;try { base = new URL(script.src || 'https://www.admiranext.com/suite/experto.js'); } catch (_) { base = new URL('https://www.admiranext.com/suite/experto.js'); }
    loader.src = new URL('/suite/demo-control.js?v=20261012-unified-1',base.origin).href;
    loader.setAttribute('data-admira-native-control','');
    loader.onerror = function(){ var msg=document.createElement('p');msg.setAttribute('role','alert');msg.textContent=T('No se pudo cargar el recorrido. Recarga la página para reintentar.','The walkthrough could not load. Reload the page to retry.');document.body.appendChild(msg); };
    document.head.appendChild(loader);
  }
  function langDeQuery() {
    try {
      var q = normalizeLangToken(new URLSearchParams(location.search).get('lang') || '');
      return q === 'en' || q === 'es' ? q : '';
    } catch (_) { return ''; }
  }
  function boot() {
    if (root.addEventListener) root.addEventListener('focus',function(){localListo=refreshCatalog();});
    var pedido = langDeQuery();
    if (pedido && pedido !== lang()) { try { applyLang(pedido); } catch (_) {} }
    try { document.addEventListener('keydown', completarNombreDemo, true); } catch (_) {}
    bootNativeDemo();
    if (apply()) return;
    var mo = new MutationObserver(function () { if (apply()) mo.disconnect(); });
    mo.observe(document.documentElement, {childList: true, subtree: true});
    setTimeout(function () { mo.disconnect(); }, 20000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})(typeof window === 'undefined' ? globalThis : window);
