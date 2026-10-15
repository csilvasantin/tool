(() => {
// FILTRO POR CLIENTE EN EL PORTAL DEL COMERCIO (encargo #5980, paraguas global fase 2 · admira.app, 14-oct-2026).
// Un superusuario que ve una cuenta de marca con «Abrir como retailer» escribe /proyecto starbucks en ⌘ Experto
// y el portal enseña solo los locales, equipos e incidencias de Starbucks. El recorte lo hace SIEMPRE la API
// (GET /api/retailer/dashboard?proyecto=…, regla común: id de Xpacio alsea-sbux-*), que además comprueba que
// quien lo pide es superusuario: un comercio normal recibe 403 aunque escriba el verbo. Aquí solo se recuerda
// la elección en esta pestaña (sessionStorage), se añade ?proyecto= a la petición y se pinta el aviso.
// ?proyecto=starbucks en la URL hace lo mismo que el verbo; ?proyecto=off lo quita. Datos solo con textContent.
const KEY='yk_retailer_proyecto',NOMBRES={starbucks:'Starbucks'},APAGAR=['off','todos','all','admira','ninguno'];
const el=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=content;if(cls)n.className=cls;return n;};
let store=null;try{store=window.sessionStorage;}catch{}
const leer=()=>{try{return String(store?.getItem(KEY)||'');}catch{return '';}};
const guardar=id=>{try{id?store?.setItem(KEY,id):store?.removeItem(KEY);}catch{}};
const limpio=v=>String(v||'').trim().toLowerCase().slice(0,64);
// cuenta: el portal ya ha cargado los datos de una cuenta (aplicar con datos); al salir vuelve a false.
let recargar=null,ultimo={proyecto:null,error:''},caja=null,cuenta=false;
(function desdeUrl(){try{const q=new URLSearchParams(location.search);if(!q.has('proyecto'))return;const id=limpio(q.get('proyecto'));guardar(APAGAR.includes(id)?'':id);}catch{}})();
const nombre=id=>NOMBRES[id]||id;
// Añade ?proyecto= solo si hay uno elegido: sin elección, la petición es la de siempre.
function query(path){const id=leer();return id?path+(path.includes('?')?'&':'?')+'proyecto='+encodeURIComponent(id):path;}
if(!document.getElementById('yk-proyecto-style')){const s=el('style');s.id='yk-proyecto-style';s.textContent='.yk-proyecto{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:14px 0 0;padding:10px 14px;border-radius:10px;border:1px solid #d7e2c8;border-left:4px solid #00704a;background:#f1f7ef;font-size:14px}.yk-proyecto strong{font-weight:700}.yk-proyecto.is-error{border-left-color:#c0392b;background:#fff4f2}.yk-proyecto button{width:auto;border:0;background:none;padding:0;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;color:inherit}';document.head.append(s);}
function host(){if(caja)return caja;caja=el('p',undefined,'yk-proyecto');caja.id='proyecto-aviso';caja.setAttribute('role','status');caja.hidden=true;const ref=document.getElementById('workspace-status');if(ref?.parentNode)ref.parentNode.insertBefore(caja,ref);else document.querySelector('main')?.prepend(caja);return caja;}
function pintar(){
 const b=host();
 if(ultimo.error){const quitar=el('button','Entendido');quitar.type='button';quitar.onclick=()=>{ultimo.error='';pintar();};b.className='yk-proyecto is-error';b.replaceChildren(el('strong','Filtro por proyecto'),el('span',ultimo.error),quitar);b.hidden=false;return;}
 if(!ultimo.proyecto){b.hidden=true;b.replaceChildren();return;}
 const quitar=el('button','Quitar filtro');quitar.type='button';quitar.onclick=()=>cambiar('off');
 b.className='yk-proyecto';b.replaceChildren(el('strong','Proyecto '+nombre(ultimo.proyecto)),el('span','Solo ves sus locales, equipos e incidencias. Lo filtra el servidor; los contadores también.'),quitar);b.hidden=false;
}
// El portal llama aquí con la respuesta de /dashboard (o con null al salir). Si el servidor no confirma el
// proyecto, se olvida. El aviso de un 403/400 sobrevive a la recarga sin filtro que viene justo después.
function aplicar(data){cuenta=!!data;const id=data&&typeof data.proyecto==='string'?data.proyecto:null;if(!id&&leer())guardar('');ultimo={proyecto:id,error:data&&!id?ultimo.error:''};pintar();return id;}
// …y aquí si una lectura falla (/dashboard o el inventario ITIL). Solo cuentan los rechazos del filtro (403
// superuser-required, 400 «Proyecto desconocido»): se quita el filtro, se avisa y quien llamó recarga sin él.
// Si otra lectura ya lo quitó (piden a la vez), solo se pide la recarga.
function fallo(e){
 const msg=String(e?.message||''),propio=(e?.status===403&&msg==='superuser-required')||(e?.status===400&&msg.startsWith('Proyecto desconocido'));
 if(!propio)return false;
 const id=leer();if(!id)return true;
 guardar('');
 ultimo={proyecto:null,error:e.status===403?'Solo un superusuario puede filtrar por proyecto, y desde una cuenta de marca abierta con «Abrir como retailer». Se muestran todos tus datos.':'No existe el proyecto «'+id+'». Disponibles: '+Object.keys(NOMBRES).join(', ')+'. Se muestran todos los datos.'};
 pintar();return true;
}
function conectar(fn){recargar=fn;}
async function cambiar(arg){
 const id=limpio(arg);guardar(APAGAR.includes(id)?'':id);ultimo.error='';
 if(recargar)await recargar();
 // El inventario ITIL (retailer-itil.js) escucha esto para volver a pedir sus datos con el filtro nuevo.
 try{document.dispatchEvent(new CustomEvent('portal-proyecto',{detail:{proyecto:leer()||null}}));}catch{}
 return estado();
}
function estado(){
 const en=String(document.documentElement.lang||'').toLowerCase().startsWith('en');
 if(ultimo.error)return ultimo.error;
 // Sin cuenta abierta (sin sesión o sin «Abrir como retailer»), el portal no ha pedido datos todavía: se dice que la
 // elección queda guardada para cuando se abra una, no «sin filtro».
 if(!cuenta){
  const id=leer(),lista=Object.keys(NOMBRES).join(', ');
  if(id&&!Object.hasOwn(NOMBRES,id)){guardar('');return en?'Unknown project «'+id+'». Available: '+lista+'.':'No existe el proyecto «'+id+'». Disponibles: '+lista+'.';}
  if(id)return en?'Project '+nombre(id)+' selected. It applies as soon as you open a brand account: «Abrir como retailer» › the brand (superuser only). /proyecto off removes it.':'Proyecto '+nombre(id)+' elegido. Se aplicará en cuanto abras una cuenta de marca: «Abrir como retailer» › la marca (solo superusuario). /proyecto off lo quita.';
  return en?'No account open in the portal yet. Open a brand account with «Abrir como retailer» and type /proyecto starbucks. Available: '+lista+'.':'Todavía no hay ninguna cuenta abierta en el portal. Abre una cuenta de marca con «Abrir como retailer» y escribe /proyecto starbucks. Disponibles: '+lista+'.';
 }
 if(ultimo.proyecto)return en?'Project '+nombre(ultimo.proyecto)+': only its sites, devices and incidents (filtered by the server). /proyecto off removes it.':'Proyecto '+nombre(ultimo.proyecto)+': solo sus locales, equipos e incidencias (lo filtra el servidor). /proyecto off lo quita.';
 return (en?'No project filter: you see every site of this account. ':'Sin filtro de proyecto: ves todos los locales de esta cuenta. ')+(en?'Available: ':'Disponibles: ')+Object.keys(NOMBRES).join(', ')+'.';
}
window.YokupProyecto={query,aplicar,fallo,conectar,cambiar,estado,actual:leer};
const VERBO={id:'proyecto',aliases:['project'],
 es:'Filtro por cliente (solo superusuario, lo comprueba el servidor): /proyecto starbucks enseña solo los locales, equipos e incidencias de Starbucks; /proyecto off lo quita; /proyecto solo dice cuál está activo.',
 en:'Client filter (superuser only, checked by the server): /proyecto starbucks shows only Starbucks sites, devices and incidents; /proyecto off removes it; /proyecto alone shows the active one.',
 run:args=>String(args||'').trim()?cambiar(args):estado()};
function registrar(){try{window.YkFrame?.registerVerb?.(VERBO);return !!window.YkFrame?.registerVerb;}catch{return true;}}
if(!registrar())document.addEventListener('DOMContentLoaded',registrar,{once:true});
})();
