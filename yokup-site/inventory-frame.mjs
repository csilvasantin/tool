// Page adapter: inventory controls and links in the shared XpaceOS shell.
const X = 'https://www.xpaceos.com', Y = 'https://www.yokup.com';
const page = document.body.dataset.inventoryPage || 'catalog';
const yokup = document.body.dataset.inventoryHost === 'yokup';
const en = new URLSearchParams(location.search).get('lang') === 'en';
const tr = (es, english) => en ? english : es;
if (en) document.documentElement.lang = 'en';
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const localized = href => { const u = new URL(href, location.href); if (en && u.origin === X) u.searchParams.set('lang','en'); return u.href; };
function currentCode() { const selected = document.querySelector('#selected-identity'); const q = new URLSearchParams(location.search); return selected ? selected.textContent.match(/\bPDG103-[A-Z]+-\d+\b/)?.[0] || '' : q.get('code') || q.get('itil') || ''; }
function xpaceURL() { const code = currentCode(); return code ? X + '/inventario/starbucks/?view=inventory&item=' + encodeURIComponent(code) : X + '/inventario/'; }
function yokupURL() { const code = currentCode(); return code ? Y + '/equipo-inventario?code=' + encodeURIComponent(code) : Y + '/retailer#itil'; }
function install() {
 const shell = window.XpaceShell; if (!shell?.registerVerb || document.querySelector('.inventory-subnav')) return;
 document.documentElement.classList.add('inventory-frame');
 const nav = node('nav',null,'inventory-subnav');nav.setAttribute('aria-label',tr('Vistas del inventario','Inventory views'));
 for (const [label,href] of [[tr('Catálogo','Catalogue'),X+'/inventario/'],[tr('Conjunto 3D','3D showroom'),X+'/inventario/conjunto/'],['Starbucks 3D',X+'/inventario/starbucks/?view=inventory'],[tr('Referencias reales','Real references'),X+'/inventario/starbucks/?view=references'],['ITIL · Yokup',Y+'/retailer#itil']]) {const a=node('a',label);a.href=localized(href);nav.append(a);}
 const languages=node('span',null,'inventory-languages');for(const lang of ['es','en']){const a=node('a',lang.toUpperCase());a.dataset.inventoryLanguage=lang;languages.append(a);}nav.append(languages);document.querySelector('#xsOptions .xs-actions').prepend(nav);
 const bridge=node('div',null,'inventory-bridge');for(const label of [tr('Ver en XpaceOS','View in XpaceOS'),tr('Ficha en Yokup','Yokup record')])bridge.append(node('a',label));document.querySelector('#xsAdvanced .xs-actions').prepend(bridge);
 const note=node('p',tr('Yokup mantiene las fichas ITIL y sus permisos. Modelos y fotos se relacionan por el código del equipo.','Yokup owns ITIL records and permissions. Models and photos link through the equipment code.'),'qm-hint');document.querySelector('#xsAdvanced .xs-actions').append(note);
 for (const panel of ['left','right','expert']) shell.close(panel);
 function sync() {const q=new URLSearchParams(location.search);const active={catalog:0,showroom:1,starbucks:q.get('view')==='references'?3:2,retailer:4}[page];for(const a of nav.querySelectorAll('a'))a.removeAttribute('aria-current');if(active!=null)nav.children[active].setAttribute('aria-current','page');bridge.children[0].href=localized(xpaceURL());bridge.children[1].href=yokupURL();for(const a of languages.children){const u=new URL(location.href);u.searchParams.set('lang',a.dataset.inventoryLanguage);a.href=u.href;}}
 document.addEventListener('xpace:shell-panel',sync);const selected=document.querySelector('#selected-identity');if(selected)new MutationObserver(sync).observe(selected,{childList:true,subtree:true});sync();
 const go=href=>location.assign(localized(href));
 const verb=(id,aliases,es,english,run)=>shell.registerVerb({id,aliases,es,en:english,run});
 verb('inventario',['inventory'],'Abrir catálogo; con argumentos, usar el gemelo','Open catalogue; arguments run in the twin',args=>{if(!args)go(X+'/inventario/');else if(!yokup)shell.handoff('/inventario '+args);else return tr('Abre XpaceOS y ejecuta /inventario '+args+' en el CLI del gemelo.','Open XpaceOS and run /inventario '+args+' in the twin CLI.');});
 verb('starbucks',[],'Unidades 3D Starbucks','Starbucks 3D units',()=>go(X+'/inventario/starbucks/?view=inventory'));
 verb('referencias',['references'],'Fotos y referencias numeradas','Numbered photo references',()=>go(X+'/inventario/starbucks/?view=references'));
 verb('ref',[],'Abrir /ref PG103-001','Open /ref PG103-001',args=>{if(!/^PG103-\d{3}$/i.test(args))return tr('Usa /ref PG103-001.','Use /ref PG103-001.');go(X+'/inventario/starbucks/?view=references&ref='+args.toUpperCase());});
 verb('equipo',['equipment'],'Abrir /equipo PDG103-BOT-01 en Yokup','Open /equipment PDG103-BOT-01 in Yokup',args=>{if(!/^[A-Z0-9_-]{1,80}$/i.test(args))return tr('Usa /equipo seguido del código ITIL.','Use /equipment followed by the ITIL code.');go(Y+'/equipo-inventario?code='+encodeURIComponent(args.toUpperCase()));});
 verb('xpaceos',[],'Modelo de la unidad seleccionada','Selected unit model',()=>go(xpaceURL()));verb('yokup',[],'Ficha ITIL de la unidad seleccionada','Selected unit ITIL record',()=>go(yokupURL()));
 if(yokup){const brand=document.querySelector('.xs-brand-name');brand.textContent='yokup●';const brandLink=document.querySelector('.xs-brand');brandLink.dataset.shellLabelEs='Yokup · inicio';brandLink.dataset.shellLabelEn='Yokup · home';brandLink.setAttribute('aria-label',tr('Yokup · inicio','Yokup · home'));brandLink.setAttribute('title',tr('Yokup · inicio','Yokup · home')); }
}
if(window.XpaceShell?.registerVerb)install();else document.addEventListener('xpace:shell-ready',install,{once:true});
