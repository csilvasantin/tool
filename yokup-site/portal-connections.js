/* Tokens remain in memory only, until the dialog closes. Never localStorage. */
(() => {
const root=document.querySelector('#agent-connections');if(!root)return;
const kind=root.dataset.portalKind,base='https://data.yokup.com/api/'+kind;
const $=s=>root.querySelector(s),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let visible=false,generation=0,dialogGeneration=0;
const dialog=document.querySelector('#connection-dialog'),form=dialog.querySelector('form'),status=dialog.querySelector('[data-status]'),secret=dialog.querySelector('[data-secret]');
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const b=await r.json();if(!r.ok)throw new Error(b.error||'No se pudo completar la operación.');return b;}
function clear(){dialogGeneration++;secret.value='';dialog.querySelector('[data-secret-area]').hidden=true;dialog.querySelector('[data-form-fields]').hidden=false;form.reset();status.textContent='';}
function date(ms){return ms?new Date(ms).toLocaleString('es',{dateStyle:'short',timeStyle:'short'}):'Nunca';}
async function refresh(){if(!visible)return;const current=generation;try{
 const b=await api('/mcp-tokens');if(!visible||current!==generation)return;
 $('[data-endpoint]').textContent=b.endpoint;const list=$('[data-tokens]');list.replaceChildren();
 if(!b.tokens.length)list.append(node('p','Todavía no has autorizado ningún agente.','muted'));
 for(const t of b.tokens){const item=node('article',undefined,'connection-item');const state=t.revoked_at?'Revocado':t.expires_at<=Date.now()?'Caducado':'Activo';item.append(node('strong',t.label+' · '+state),node('p',t.scopes.join(' · ')),node('p','Caduca: '+date(t.expires_at)+' · Último uso: '+date(t.last_used_at)));
 if(!t.revoked_at&&t.expires_at>Date.now()){const button=node('button','Revocar acceso','text-button');button.type='button';button.onclick=async()=>{button.disabled=true;try{await api('/mcp-tokens/'+t.id+'/revoke',{});await refresh();$('[data-status]').textContent='Acceso revocado. El agente ya no podrá usar este token.';}catch(e){$('[data-status]').textContent=e.message;button.disabled=false;}};item.append(button);}list.append(item);}
 const permissions=dialog.querySelector('[data-scopes]');permissions.replaceChildren();for(const [scope,label] of Object.entries(b.available_scopes)){const l=node('label',undefined,'check-line'),checkbox=node('input');checkbox.type='checkbox';checkbox.name='scope';checkbox.value=scope;checkbox.defaultChecked=scope.endsWith(':read');checkbox.checked=checkbox.defaultChecked;l.append(checkbox,node('span',label));permissions.append(l);}
 $('[data-new-token]').disabled=false;
}catch(e){if(visible&&current===generation)$('[data-status]').textContent=e.message;}}
async function audit(){if(!visible)return;const current=generation;try{const b=await api('/mcp-audit');if(!visible||current!==generation)return;const host=$('[data-audit]');host.replaceChildren();if(!b.events.length)host.append(node('p','Sin operaciones MCP registradas.','muted'));for(const e of b.events){const outcomes={success:'Completada',rejected:'Rechazada',replayed:'Reintento recuperado',uncertain:'Resultado por comprobar',started:'Iniciada'};host.append(node('p',date(e.created_at)+' · '+e.integration+' · '+e.tool+' · '+(outcomes[e.outcome]||e.outcome)));}}catch(e){$('[data-status]').textContent=e.message;}}
document.addEventListener('portal-auth',e=>{if(e.detail.kind!==kind)return;generation++;visible=e.detail.authenticated;root.hidden=!visible;if(visible){if(dialog.open)dialog.close();clear();refresh();}else{dialog.close();clear();$('[data-tokens]').replaceChildren();$('[data-audit]').replaceChildren();$('[data-status]').textContent='';}});
$('[data-new-token]').onclick=()=>{clear();dialog.showModal();};$('[data-refresh]').onclick=()=>{refresh();audit();};$('[data-show-audit]').onclick=audit;
dialog.querySelector('[data-connection-close]').onclick=()=>dialog.close();dialog.addEventListener('close',clear);
form.onsubmit=async e=>{e.preventDefault();const scopes=[...form.querySelectorAll('[name=scope]:checked')].map(e=>e.value);if(!scopes.length){status.textContent='Selecciona al menos un permiso.';return;}
 const button=form.querySelector('button.primary');button.disabled=true;const current=generation,dialogRun=dialogGeneration;status.textContent='Creando token…';
 try{const b=await api('/mcp-tokens',{label:form.elements.label.value,expires_in_days:Number(form.elements.days.value),scopes});if(!visible||current!==generation)return;if(!dialog.open||dialogRun!==dialogGeneration){$('[data-status]').textContent='Se creó el token después de cerrar la ventana. Revócalo si no llegaste a copiarlo.';await refresh();return;}
 dialog.querySelector('[data-form-fields]').hidden=true;dialog.querySelector('[data-secret-area]').hidden=false;secret.value=b.token;status.textContent='Cópialo ahora. Al cerrar esta ventana no volverá a mostrarse.';await refresh();
 }catch(e){status.textContent=e.name==='TimeoutError'?'No se confirmó el alta. Cierra y actualiza la lista antes de crear otro token.':e.message;}finally{button.disabled=false;}};
dialog.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(secret.value);status.textContent='Copiado. Guárdalo en el gestor de secretos de tu agente.';}catch{secret.select();status.textContent='Selecciona y copia el token manualmente.';}};
})();
