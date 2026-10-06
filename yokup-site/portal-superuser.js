(() => {
// SUPERUSUARIO EN LOS PORTALES (Carlos, 6-oct-2026). Antes /retailer e /instalador mandaban al
// superusuario a /superusuario sin avisar, y allí no hay inventario ITIL ni incidencias. Ahora se
// queda en el portal y elige qué abrir: «Abrir como retailer» (cuentas de marca, p. ej. 365) o
// «Abrir como instalador». Quién puede y qué ve lo decide SIEMPRE el servidor (yokup-api:
// /api/retailer/switch y /api/portal-admin/view-as, revalidados en cada petición); aquí solo se pinta.
// Comercios e instaladores normales no ven nada de esto: sin sesión de superusuario no aparece.
// Datos solo con textContent.
const kind=document.currentScript?.dataset.kind==='installer'?'installer':'retailer';
const DATA='https://data.yokup.com/api',PANEL='/superusuario';
window.YokupSuperuser={kind};
const el=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=content;if(cls)n.className=cls;return n;};
async function call(path,body){const r=await fetch(DATA+path,{method:body?'POST':'GET',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(d.error||'No se pudo completar la operación.'),{status:r.status});return d;}
if(!document.getElementById('yk-superuser-style')){const s=el('style');s.id='yk-superuser-style';s.textContent='.yk-superuser{border:1px solid var(--line,#dbe3d9);background:#fffef4;border-left:4px solid var(--lime,#d8f36a);border-radius:10px;padding:14px 18px;margin:0 auto 22px;max-width:1180px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;font-size:14px}.yk-superuser strong{font-weight:700}.yk-superuser select{margin:0;padding:8px 10px;font-size:14px;max-width:320px}.yk-superuser .primary{width:auto;margin:0;padding:9px 16px;font-size:14px}.yk-superuser .yk-su-note{color:var(--muted,#667a75);font-size:13px;flex:1 1 100%}.yk-superuser a{font-size:13px}';document.head.append(s);}
let box=null,busy=false,again=false;
function host(){if(box)return box;box=el('section',undefined,'yk-superuser');box.id='superuser-bar';box.setAttribute('aria-label','Modo superusuario');box.hidden=true;const anchor=document.getElementById(kind==='installer'?'onboarding':'access');if(anchor?.parentNode)anchor.parentNode.insertBefore(box,anchor);else document.querySelector('main')?.prepend(box);return box;}
function pick(select,items,current,preferred){select.replaceChildren();for(const it of items){const o=el('option',it.label);o.value=it.id;select.append(o);}select.value=current&&items.some(i=>i.id===current)?current:(items.find(preferred)||items[0]||{}).id||'';}
async function render(){
 if(busy){again=true;return;}busy=true;
 try{
  let admin;try{admin=await call('/portal-admin/me');}catch{if(box)box.hidden=true;return;}
  const b=host(),note=el('span','','yk-su-note'),select=el('select'),open=el('button',kind==='installer'?'Abrir como instalador':'Abrir como retailer','primary');
  select.setAttribute('aria-label',kind==='installer'?'Instalador que quieres abrir':'Cuenta de marca que quieres abrir');
  let me=null;try{me=await call(kind==='installer'?'/installer/me':'/retailer/me');}catch(e){if(e.status!==401)note.textContent=e.message;}
  const viewing=me?.access?.delegated&&me.access.actor_email===admin.email,parts=[el('strong','Modo superusuario'),el('span',admin.email)];
  let items=[],current=null,exit=null;
  if(kind==='installer'){
   const d=await call('/portal-admin/view-as');items=d.installers.map(a=>({id:a.id,label:a.name+' · '+a.city+(a.available?'':' · no disponible')}));current=viewing?me.profile.id:d.installer_as;
   open.onclick=async()=>{if(!select.value)return;open.disabled=true;note.textContent='Abriendo…';try{await call('/portal-admin/view-as',{kind:'installer',installer_id:select.value});location.reload();}catch(e){open.disabled=false;note.textContent=e.message;}};
   if(viewing){exit=el('button','Salir de la vista','text-button');exit.onclick=async()=>{exit.disabled=true;try{await call('/portal-admin/view-as',{kind:'installer',installer_id:null});location.reload();}catch(e){exit.disabled=false;note.textContent=e.message;}};}
  }else{
   const d=await call('/retailer/accounts');items=(d.accounts||[]).filter(a=>a.role==='superuser'||a.current).map(a=>({id:a.id,label:a.name+(a.brand_key?' · marca':''),brand_key:a.brand_key}));current=me?.profile?.id||null;
   open.onclick=async()=>{if(!select.value)return;open.disabled=true;note.textContent='Abriendo…';try{await call('/retailer/switch',{retailer_id:select.value});location.reload();}catch(e){open.disabled=false;note.textContent=e.message;}};
   if(viewing){exit=el('button','Salir de la vista','text-button');exit.onclick=async()=>{exit.disabled=true;try{await call('/retailer/logout',{});location.reload();}catch(e){exit.disabled=false;note.textContent=e.message;}};}
  }
  pick(select,items,current,i=>i.brand_key==='365'||/^365\b/.test(i.label));
  if(!items.length){open.disabled=true;note.textContent=kind==='installer'?'No hay instaladores dados de alta.':'No hay cuentas de marca para abrir.';}
  else if(!note.textContent)note.textContent=viewing?'Estás viendo «'+(me.profile.name||'')+'» como superusuario. Todo lo que hagas queda a nombre de '+admin.email+'.':me?'Has entrado con tu propia cuenta. Puedes abrir otra '+(kind==='installer'?'cuenta de instalador':'cuenta de marca')+' como superusuario.':'Elige '+(kind==='installer'?'el instalador':'la marca')+' y ábrelo para usar el portal completo (inventario, incidencias…).';
  const panel=el('a','Panel de superusuario →');panel.href=PANEL;
  b.replaceChildren(...parts,select,open,...(exit?[exit]:[]),panel,note);b.hidden=false;
 }catch(e){if(box){box.hidden=false;box.replaceChildren(el('strong','Modo superusuario'),el('span',e.message,'yk-su-note'));}}
 finally{busy=false;if(again){again=false;render();}}
}
window.YokupSuperuser.refresh=render;
document.addEventListener('portal-superuser',render);
document.addEventListener('portal-auth',()=>setTimeout(render,0));
render();
})();
