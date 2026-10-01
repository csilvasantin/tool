// Inventario ITIL por establecimiento/Xpacio en el portal del comercio (FLT-101300 · MorfeoMacMini).
// Yokup es el maestro de los equipos de cada Xpacio. Solo textContent; la API aplica el perímetro del titular.
(() => {
const API='https://data.yokup.com/api/retailer';
const PHOTOS=window.YkPhotoReferences;
const $=s=>document.querySelector(s);
const el=(tag,content,cls)=>{const node=document.createElement(tag);if(content!==undefined&&content!==null)node.textContent=content;if(cls)node.className=cls;return node;};
const CATEGORY={pantalla:'Pantalla',player:'Player',tpv:'TPV',audio:'Audio',iot:'IoT / sensor',red:'Red',kiosk:'Kiosco',mobiliario:'Mobiliario',iluminacion:'Iluminación',otro:'Otro'};
// Insignia de garantía (01-oct-2026): en garantía · vencida · sin dato (y «vence pronto» a ≤30 días).
const WARRANTY={valid:['En garantía','chip-ok'],expiring:['En garantía · vence pronto','chip-warn'],expired:['Garantía vencida','chip-bad'],none:['Garantía: sin dato','chip-none']};
const SIN='sin dato',day=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):SIN,val=v=>v===null||v===undefined||v===''?SIN:String(v);
const STATUS={operational:'Operativo',degraded:'Degradado',maintenance:'En mantenimiento',planned:'Planificado',retired:'Retirado'};
const LC=['manufacturer','model','serial','supplier','purchase_date','invoice_ref','warranty_start','warranty_months','warranty_end','installed_at','installed_by','maintenance_interval_days'];
const NUM=new Set(['maintenance_interval_days','warranty_months']);
const CI=['itil_code','name','category','role','group_name','position','orientation','parent_itil_code'];
let sites=[],current='',inv=null,canEdit=true,adopting=null,retiring=null;
// Enlaces desde la incidencia (01-oct-2026): ?xpacio=|site= &itil=<código> abre esa ficha; ?itil_alta=1&categoria=&nombre=&adoptar= abre el alta prefijada. Se consumen una vez.
const Q=new URLSearchParams(location.search);let deep=Q.has('itil')||Q.get('itil_alta')==='1'?{code:Q.get('itil')||'',alta:Q.get('itil_alta')==='1',store:Q.get('xpacio')||'',site:Q.get('site')||'',category:Q.get('categoria')||'',name:Q.get('nombre')||'',adopt:Q.get('adoptar')||'',ref:Q.get('ref')||'',ticket:Q.get('incidencia')||''}:null;
async function api(path,body){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(API+path,{method:body?'POST':'GET',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const result=await r.json();if(!r.ok)throw Object.assign(new Error(result.error||'No se pudo completar la operación.'),{status:r.status});return result;}finally{clearTimeout(timeout);}}
function status(text){$('#itil-status').textContent=text||'';}
async function loadSites(){
 try{const r=await api('/itil');sites=r.sites||[];const select=$('#itil-site');select.replaceChildren();
  for(const s of sites){const opt=el('option',s.name+(s.admira_store_id?' · Xpacio '+s.admira_store_id:'')+' · '+(s.itil_cis?s.itil_cis+' CI ITIL':'sin ITIL'));opt.value=s.site_id;select.append(opt);}
  if(deep){const hit=sites.find(s=>(deep.site&&s.site_id===deep.site)||(deep.store&&s.admira_store_id===deep.store));if(hit)current=hit.site_id;else if(deep.store||deep.site){status('Ese establecimiento no está entre los tuyos ('+(deep.store||deep.site)+').');deep=null;}}
  if(!sites.some(s=>s.site_id===current))current=(sites.find(s=>s.admira_store_id)||sites[0]||{}).site_id||'';
  select.value=current;$('#itil-new').hidden=!canEdit||!current;
  if(current)await loadInventory();else{$('#itil-groups').replaceChildren(el('p','Añade un establecimiento para empezar su inventario ITIL.','muted'));$('#itil-summary').textContent='';}
 }catch(e){if(e.status!==401)status(e.message);}
}
async function loadInventory(){try{inv=await api('/itil/inventory?site_id='+encodeURIComponent(current));status('');render();openDeep();}catch(e){status(e.message);}}
function openDeep(){
 if(!deep||!inv)return;const d=deep;deep=null;
 if(d.code){const ci=inv.cis.find(c=>c.itil_code===d.code);if(!ci){status('El código '+d.code+' no está en este establecimiento.');return;}const card=document.querySelector('[data-itil-code="'+CSS.escape(d.code)+'"]');if(card){card.classList.add('itil-focus');card.scrollIntoView({block:'center'});}if(canEdit&&ci.managed_by==='itil')openCi(ci);return;}
 if(d.alta){if(!canEdit){status('Tu acceso es de solo lectura: pide al titular que dé de alta el equipo.');return;}
  const cat=Object.hasOwn(CATEGORY,d.category)?d.category:'';openCi(null,d.adopt?{device_id:d.adopt,name:d.name,category:cat}:null);const f=$('#itil-form');if(!d.adopt){if(cat)f.elements.category.value=cat;if(d.name)f.elements.name.value=d.name.slice(0,160);}
  $('#itil-context').textContent='Alta desde la incidencia'+(d.ticket?' '+d.ticket:'')+(d.ref?' · equipo '+d.ref:'')+'. Rellena el código ITIL y, con la factura o el albarán, serie, compra y garantía.';}
}
function chips(ci){
 const lc=ci.lifecycle||{warranty:'none'},box=el('div',undefined,'lifecycle-chips'),[label,cls]=WARRANTY[lc.warranty]||WARRANTY.none;
 box.append(el('span',label,'chip '+cls));
 if(lc.status&&lc.status!=='operational')box.append(el('span',STATUS[lc.status]||lc.status,'chip chip-none'));
 if(lc.maintenance_due)box.append(el('span','Mantenimiento pendiente','chip chip-warn'));
 if(ci.managed_by==='catalogo')box.append(el('span','Provisional · catálogo Admira','chip chip-none'));
 if(ci.open_incidents)box.append(el('span',ci.open_incidents===1?'1 incidencia abierta':ci.open_incidents+' incidencias abiertas','chip chip-bad'));
 return box;
}
function card(ci){
 const retired=ci.lifecycle?.status==='retired',c=el('article',undefined,'device-card itil-card'+(retired?' retired':''));
 const identity=el('div',undefined,'itil-identity'),copy=el('div',undefined,'itil-identity-copy');copy.append(el('h3',ci.name));identity.append(copy);
 c.append(el('span',(CATEGORY[ci.category]||ci.category)+(ci.role?' · '+ci.role:''),'device-type'),el('p',ci.itil_code||'Sin código ITIL','itil-code'),identity);
 const inventory=inv,site={site_id:inventory?.site?.id,admira_store_id:inventory?.xpacio?.admira_store_id};
 if(PHOTOS?.siteMatches(site))PHOTOS.load().then(manifest=>{
  if(inv!==inventory||!identity.isConnected)return;
  const ref=PHOTOS.resolve(manifest,site,ci);if(!ref)return;
  const a=el('a',undefined,'itil-photo'),img=el('img');a.href=ref.href;a.target='_blank';a.rel='noopener';a.setAttribute('aria-label','Abrir referencia '+ref.id+' · '+ci.name);
  img.src=ref.photo;img.alt='Foto real · '+ci.name+' · '+ref.scopeLabel;img.loading='lazy';img.width=88;img.height=88;img.referrerPolicy='no-referrer';
  img.onerror=()=>a.replaceChildren(el('span','Foto no disponible','itil-photo-missing'));
  a.append(img);identity.prepend(a);copy.append(el('span',ref.id,'itil-photo-ref'),el('p',ref.scopeLabel,'small itil-photo-scope'));
 });
 const where=[ci.position,ci.orientation==='vertical'?'Vertical':ci.orientation==='horizontal'?'Horizontal':''].filter(Boolean).join(' · ');if(where)c.append(el('p',where));
 if(ci.parent_itil_code)c.append(el('p','Depende de '+ci.parent_itil_code,'small'));
 const lc=ci.lifecycle||{},facts=el('p',undefined,'small itil-facts'),until=lc.warranty_end||lc.warranty_until;
 facts.textContent='Modelo: '+val([lc.manufacturer,lc.model].filter(Boolean).join(' ')||null)+' · Nº de serie: '+val(lc.serial)+' · Compra: '+day(lc.purchase_date)+' · Garantía: '+(lc.warranty_months?lc.warranty_months+' meses':SIN)+(until?' · hasta '+day(until)+(lc.warranty_end?'':' (calculado)'):'');
 c.append(facts);
 c.append(chips(ci));
 if(ci.itil_code)c.dataset.itilCode=ci.itil_code;
 const actions=el('div',undefined,'itil-actions');
 if(canEdit&&ci.managed_by==='itil'){const edit=el('button','Editar ficha','text-button');edit.onclick=()=>openCi(ci);actions.append(edit);if(!retired){const out=el('button','Retirar','text-button');out.onclick=()=>openRetire(ci);actions.append(out);}}
 if(canEdit&&ci.managed_by==='catalogo'&&!retired){const adopt=el('button','Convertir en CI ITIL','text-button');adopt.onclick=()=>openCi(null,{device_id:ci.device_id,name:ci.name,category:ci.category});actions.append(adopt);}
 if(actions.childNodes.length)c.append(actions);
 return c;
}
function render(){
 const host=$('#itil-groups');host.replaceChildren();if(!inv)return;
 const showRetired=$('#itil-retired').checked,list=inv.cis.filter(c=>showRetired||c.lifecycle?.status!=='retired');
 $('#itil-summary').textContent=(inv.managed_by==='itil'?'Gestionado por ITIL en Yokup':'Aún sin ITIL · equipos provisionales del catálogo de Admira')+' · '+inv.stats.itil+' CI ITIL · '+inv.stats.catalogo+' provisionales · garantías por vencer: '+inv.stats.warranty_expiring+' · vencidas: '+inv.stats.warranty_expired;
 if(!list.length)host.append(el('p',canEdit?'Todavía no hay CIs. Da de alta el primero con «+ CI».':'Todavía no hay CIs en este establecimiento.','muted'));
 const groups=new Map();for(const ci of list){const g=ci.group_name||(ci.managed_by==='catalogo'?'Catálogo de Admira (provisional)':'Sin grupo');if(!groups.has(g))groups.set(g,[]);groups.get(g).push(ci);}
 for(const [name,items] of groups){const section=el('section',undefined,'itil-group'),grid=el('div',undefined,'itil-cards');section.append(el('h3',name+' · '+items.length));for(const ci of items)grid.append(card(ci));section.append(grid);host.append(section);}
 const extra=$('#itil-unmanaged');extra.replaceChildren();
 if(inv.unmanaged?.length){extra.append(el('h3','Equipos sin ficha ITIL'));const grid=el('div',undefined,'itil-cards');for(const d of inv.unmanaged){const c=el('article',undefined,'device-card');c.append(el('h3',d.name),el('p','Aún no forma parte del inventario ITIL.','small'));if(canEdit){const b=el('button','Convertir en CI ITIL','text-button');b.onclick=()=>openCi(null,{device_id:d.device_id,name:d.name,category:{screen:'pantalla',player:'player',audio:'audio',network:'red',sensor:'iot',kiosk:'kiosk'}[d.skill]||'otro'});c.append(b);}grid.append(c);}extra.append(grid);}
}
function parents(except){const select=$('#itil-form [name=parent_itil_code]');select.replaceChildren(el('option','Sin relación'));select.firstChild.value='';for(const ci of inv?.cis||[])if(ci.managed_by==='itil'&&ci.itil_code!==except&&ci.lifecycle?.status!=='retired'){const o=el('option',ci.itil_code+' · '+ci.name);o.value=ci.itil_code;select.append(o);}}
function openCi(ci,adopt){
 const form=$('#itil-form');form.reset();form.querySelector('.form-status').textContent='';adopting=adopt?.device_id||null;parents(ci?.itil_code);
 $('#itil-title').textContent=ci?'Ficha '+ci.itil_code:adopt?'Convertir en CI ITIL':'Nuevo CI';
 $('#itil-context').textContent=adopt?'El equipo «'+adopt.name+'» conserva su historial y pasa a mandarlo ITIL.':'El código ITIL es único en todo Yokup y no cambia.';
 const code=form.elements.itil_code;code.readOnly=!!ci;
 const src=ci||adopt||{};for(const f of CI)if(form.elements[f]&&src[f]!=null)form.elements[f].value=src[f];
 for(const f of LC){const v=ci?.lifecycle?.[f];if(v!=null)form.elements[f].value=v;}
 $('#itil-dialog').showModal();
}
function openRetire(ci){retiring=ci.itil_code;const form=$('#itil-retire-form');form.reset();form.querySelector('.form-status').textContent='';$('#itil-retire-context').textContent=ci.itil_code+' · '+ci.name;$('#itil-retire-dialog').showModal();}
async function send(form,operation){const button=form.querySelector('button.primary'),out=form.querySelector('.form-status');button.disabled=true;out.textContent='Guardando…';try{const r=await operation();form.closest('dialog').close();await loadSites();status(r.retired_catalog?.length?'Guardado. '+r.retired_catalog.length+' equipos provisionales del catálogo quedan retirados («Sustituido por ITIL»).':r.changed===false?'Sin cambios: la ficha ya estaba así.':'Guardado.');}catch(e){out.textContent=e.message;}finally{button.disabled=false;}}
$('#itil-form').onsubmit=e=>{e.preventDefault();const form=e.target,b=Object.fromEntries(new FormData(form));send(form,()=>{
 const body={site_id:current};for(const f of CI)body[f]=(b[f]??'').trim();body.itil_code=body.itil_code.toUpperCase();
 const lifecycle={};for(const f of LC){const v=(b[f]??'').trim();lifecycle[f]=NUM.has(f)?(v?Number(v):null):v;}body.lifecycle=lifecycle;if(adopting)body.adopt_device_id=adopting;
 return api('/itil/cis',body);});};
$('#itil-retire-form').onsubmit=e=>{e.preventDefault();const form=e.target;send(form,()=>api('/itil/cis/'+encodeURIComponent(retiring)+'/retire',{note:form.elements.note.value.trim()}));};
$('#itil-form [name=itil_code]').oninput=e=>{e.target.value=e.target.value.toUpperCase();};
$('#itil-site').onchange=e=>{current=e.target.value;loadInventory();};$('#itil-retired').onchange=render;$('#itil-new').onclick=()=>openCi(null,null);
for(const b of document.querySelectorAll('[data-itil-close]'))b.onclick=()=>b.closest('dialog').close();
document.addEventListener('portal-auth',async e=>{if(e.detail?.kind!=='retailer')return;if(!e.detail.authenticated){inv=null;sites=[];current='';return;}try{const me=await api('/me');canEdit=me.access?.can_edit!==false;}catch{canEdit=false;}loadSites();});
document.addEventListener('retailer-sites-imported',loadSites);
})();
