(() => {
// «Ver como» en la cabecera del Portal del comercio (/retailer y /retailer/incidencia).
// Lista la cuenta propia, las de marca de las que eres miembro y, al superusuario, todas las de
// marca. El servidor decide qué se puede abrir; aquí solo se pinta. Datos solo con textContent.
const API='https://data.yokup.com/api/retailer',ROLES={owner:'titular',manager:'gestión',viewer:'solo lectura',superuser:'superusuario'};
const host=document.getElementById('account-switch');if(!host)return;
const el=(tag,content,cls)=>{const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(cls)node.className=cls;return node;};
async function call(path,body){const r=await fetch(API+path,{method:body?'POST':'GET',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data.error||'No se pudo cambiar de cuenta.'),{status:r.status});return data;}
let busy=false;
async function load(){
 if(busy)return;busy=true;let r;
 try{r=await call('/accounts');}catch{host.hidden=true;busy=false;return;}finally{busy=false;}
 const accounts=r.accounts||[];
 if(accounts.length<2&&!r.current?.delegated&&!(r.superuser&&accounts.length)){host.hidden=true;host.replaceChildren();return;}
 const label=el('label',undefined,'account-switch-label'),select=el('select');select.setAttribute('aria-label','Ver el portal como');label.append(el('span','Ver como'),select);
 if(!r.current){const o=el('option','Elige una cuenta…');o.value='';select.append(o);}
 for(const a of accounts){const o=el('option',a.name+(a.role&&a.role!=='owner'?' · '+(ROLES[a.role]||a.role):''));o.value=a.id;select.append(o);}
 select.value=r.current?.id||'';
 const note=el('span',r.current?.delegated?'como '+r.current.actor_email+(r.current.role==='viewer'?' · solo lectura':''):'','account-switch-note');
 host.replaceChildren(label,note);host.hidden=false;
 select.onchange=async()=>{if(!select.value)return;select.disabled=true;note.textContent='Cambiando…';try{await call('/switch',{retailer_id:select.value});location.reload();}catch(e){select.disabled=false;select.value=r.current?.id||'';note.textContent=e.message;}};
}
load();document.addEventListener('portal-auth',load);
})();
