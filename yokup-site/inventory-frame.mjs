// Adaptador del inventario ITIL dentro del marco cuadrático común de Yokup (yk-frame).
// FLT-101338 (merge con 31860b2 · 37084e7 · 7b8330f · 4c1945c): Yokup no carga un segundo
// shell para el inventario; este módulo monta lo propio del inventario en los raíles
// canónicos del marco: las vistas, los idiomas y los enlaces en ☰ Opciones (su contenedor
// canónico, .yk-slot del raíl izquierdo), el puente XpaceOS ↔ Yokup y la ayuda del
// inventario en ▤ Avanzado, y los verbos /inventario, /starbucks, /referencias, /ref,
// /equipo, /xpaceos y /yokup en la consola local de ⌘ Experto. Los paneles empiezan
// plegados. Páginas: <body data-inventory-host="yokup" data-inventory-page="retailer|equipment">.
const X = 'https://www.xpaceos.com', Y = 'https://www.yokup.com';
const page = document.body.dataset.inventoryPage || 'catalog';
const en = new URLSearchParams(location.search).get('lang') === 'en';
const tr = (es, english) => en ? english : es;
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const localized = href => { const u = new URL(href, location.href); if (en && u.origin === X) u.searchParams.set('lang', 'en'); return u.href; };
function currentCode() { const selected = document.querySelector('#selected-identity'); const q = new URLSearchParams(location.search); return selected ? selected.textContent.match(/\bPDG103-[A-Z]+-\d+\b/)?.[0] || '' : q.get('code') || q.get('itil') || ''; }
function xpaceURL() { const code = currentCode(); return code ? X + '/inventario/starbucks/?view=inventory&item=' + encodeURIComponent(code) : X + '/inventario/'; }
function yokupURL() { const code = currentCode(); return code ? Y + '/equipo-inventario?code=' + encodeURIComponent(code) : Y + '/retailer#itil'; }
function group(title, cls) { const nav = node('nav', null, 'yk-pub-nav ' + cls); nav.setAttribute('aria-label', title); nav.append(node('div', title.toUpperCase(), 'yk-rail-navhd')); return nav; }
function link(label, href, external) { const a = node('a', label, 'yk-pub-link'); a.href = href; if (external) { a.target = '_blank'; a.rel = 'noopener'; } return a; }

function install() {
  const frame = window.YkFrame;
  const options = document.querySelector('#yk-rail-left .yk-slot'), advanced = document.querySelector('#yk-rail-right .yk-slot');
  if (!frame || !options || !advanced || document.querySelector('.inventory-subnav')) return;
  document.documentElement.classList.add('inventory-frame');
  // ☰ Opciones · vistas del inventario (la actual con aria-current) e idioma.
  const nav = group(tr('Vistas del inventario', 'Inventory views'), 'inventory-subnav');
  for (const [label, href] of [[tr('Catálogo', 'Catalogue'), X + '/inventario/'], [tr('Conjunto 3D', '3D showroom'), X + '/inventario/conjunto/'], ['Starbucks 3D', X + '/inventario/starbucks/?view=inventory'], [tr('Referencias reales', 'Real references'), X + '/inventario/starbucks/?view=references'], ['ITIL · Yokup', Y + '/retailer#itil']]) nav.append(link(label, localized(href)));
  const languages = node('span', null, 'inventory-languages');
  for (const lang of ['es', 'en']) { const a = node('a', lang.toUpperCase()); a.dataset.inventoryLanguage = lang; languages.append(a); }
  nav.append(languages);
  options.prepend(nav);
  // ☰ Opciones · enlaces del inventario (antes window.XPACE_SHELL.options).
  const more = group(tr('Inventario', 'Inventory'), 'inventory-links');
  // Incidencias del PROPIO comercio (6-oct-2026): en el portal del comercio el enlace lleva a su
  // sección #incidencias. /incidencias es la bandeja interna de la flota (verja con Google propio):
  // un comercio no entra y el superusuario perdía su «Abrir como retailer».
  const incidents = page === 'retailer' ? '/retailer#incidencias' : '/incidencias';
  for (const [es, english, href] of [['Inventario ITIL', 'ITIL inventory', '/retailer#itil'], ['Catálogo XpaceOS', 'XpaceOS catalogue', X + '/inventario/'], ['Referencias Starbucks', 'Starbucks references', X + '/inventario/starbucks/?view=references'], ['Incidencias', 'Incidents', incidents]]) {
    if (!options.querySelector('a[href="' + href + '"]')) more.append(link(tr(es, english), localized(href)));
  }
  if (more.querySelector('a')) nav.after(more);
  // ▤ Avanzado · puente con XpaceOS, ayuda del inventario y la Xperience.
  const bridge = node('div', null, 'inventory-bridge'); bridge.setAttribute('data-yk-stack', '');
  for (const label of [tr('Ver en XpaceOS ↗', 'View in XpaceOS ↗'), tr('Ficha en Yokup', 'Yokup record')]) bridge.append(node('a', label, 'yk-action'));
  bridge.append(Object.assign(node('a', tr('Ayuda del inventario', 'Inventory help'), 'yk-action'), {href: '/help#inventory-frame'}));
  bridge.append(Object.assign(node('a', tr('Abrir Xperience ↗', 'Open Xperience ↗'), 'yk-action'), {href: X + '/admira-xp/?play=xtanco&inventory=1'}));
  bridge.append(node('p', tr('Yokup mantiene las fichas ITIL y sus permisos. Modelos y fotos se relacionan por el código del equipo.', 'Yokup owns ITIL records and permissions. Models and photos link through the equipment code.'), 'yk-empty inventory-note'));
  advanced.prepend(bridge);
  // Plegados al entrar (7b8330f): ningún panel se abre solo.
  for (const panel of ['left', 'right', 'bottom']) frame.close(panel);
  function sync() {
    const q = new URLSearchParams(location.search);
    const active = {catalog: 0, showroom: 1, starbucks: q.get('view') === 'references' ? 3 : 2, retailer: 4}[page];
    const views = [...nav.querySelectorAll('a.yk-pub-link')];
    for (const a of views) { a.removeAttribute('aria-current'); a.classList.remove('on'); }
    if (active != null && views[active]) { views[active].setAttribute('aria-current', 'page'); views[active].classList.add('on'); }
    bridge.children[0].href = localized(xpaceURL()); bridge.children[1].href = yokupURL();
    for (const a of languages.children) { const u = new URL(location.href); u.searchParams.set('lang', a.dataset.inventoryLanguage); a.href = u.href; }
  }
  const selected = document.querySelector('#selected-identity');
  if (selected) new MutationObserver(sync).observe(selected, {childList: true, subtree: true});
  sync();
  // Verbos del inventario en la consola local (nunca llegan a un agente).
  const go = href => location.assign(localized(href));
  const verb = (id, aliases, es, english, run) => frame.registerVerb({id, aliases, es, en: english, run});
  verb('inventario', ['inventory'], 'Abrir catálogo; con argumentos, usar el gemelo', 'Open catalogue; arguments run in the twin', args => { if (!args) go(X + '/inventario/'); else return tr('Abre XpaceOS y ejecuta /inventario ' + args + ' en el CLI del gemelo.', 'Open XpaceOS and run /inventario ' + args + ' in the twin CLI.'); });
  verb('starbucks', [], 'Unidades 3D Starbucks', 'Starbucks 3D units', () => go(X + '/inventario/starbucks/?view=inventory'));
  verb('referencias', ['references'], 'Fotos y referencias numeradas', 'Numbered photo references', () => go(X + '/inventario/starbucks/?view=references'));
  verb('ref', [], 'Abrir /ref PG103-001', 'Open /ref PG103-001', args => { if (!/^PG103-\d{3}$/i.test(args)) return tr('Usa /ref PG103-001.', 'Use /ref PG103-001.'); go(X + '/inventario/starbucks/?view=references&ref=' + args.toUpperCase()); });
  verb('equipo', ['equipment'], 'Abrir /equipo PDG103-BOT-01 en Yokup', 'Open /equipment PDG103-BOT-01 in Yokup', args => { if (!/^[A-Z0-9_-]{1,80}$/i.test(args)) return tr('Usa /equipo seguido del código ITIL.', 'Use /equipment followed by the ITIL code.'); go(Y + '/equipo-inventario?code=' + encodeURIComponent(args.toUpperCase())); });
  verb('xpaceos', [], 'Modelo de la unidad seleccionada', 'Selected unit model', () => go(xpaceURL()));
  verb('yokup', [], 'Ficha ITIL de la unidad seleccionada', 'Selected unit ITIL record', () => go(yokupURL()));
}
if (window.YkFrame && window.YkFrame.ready) install(); else document.addEventListener('yk:frame-ready', install, {once: true});
