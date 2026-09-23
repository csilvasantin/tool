import {categories,capsulesFrom,filterCapsules} from './training-selection.mjs';
const $=id=>document.getElementById(id),E=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
let all=[],loading=false;const reviewed=new Set();
const key=c=>'yokup-training-read:v1:'+c.id+':'+c.revision;
function readProgress(c){try{if(localStorage.getItem(key(c))==='yes')reviewed.add(key(c));}catch{$('storage-status').textContent='Este navegador no permite guardar el progreso. Podrás consultar todas las cápsulas.';}}
function render(){
 const list=filterCapsules(all,$('search').value,$('category').value);$('capsules').replaceChildren();$('empty').hidden=loading||!!list.length;
 $('total').textContent=all.length;$('progress').textContent=all.filter(c=>reviewed.has(key(c))).length+' de '+all.length+' revisadas en este navegador';
 for(const c of list){const card=E('article',null,'capsule-card');card.dataset.read=String(reviewed.has(key(c)));card.append(E('p',categories[c.category]||'Por clasificar','eyebrow'),E('h3',c.title),E('span','Cómo aplicarlo en Yokup','application-label'),E('p',c.use,'application'));
  const details=E('details'),summary=E('summary','Leer cápsula original'),note=E('p',c.note,'original');details.append(summary,note);card.append(details);
  const link=E('a','Abrir fuente en Pixeria ↗','source-link');link.href=c.source;link.target='_blank';link.rel='noopener noreferrer';card.append(link,E('p','Formación general · ID '+c.id,'source-meta'));
  const read=E('button',reviewed.has(key(c))?'✓ Revisada · desmarcar':'Marcar como revisada','btn secondary read-button');read.type='button';read.setAttribute('aria-pressed',String(reviewed.has(key(c))));  read.onclick=()=>{try{if(reviewed.has(key(c))){localStorage.removeItem(key(c));reviewed.delete(key(c));}else{localStorage.setItem(key(c),'yes');reviewed.add(key(c));}card.dataset.read=String(reviewed.has(key(c)));read.textContent=reviewed.has(key(c))?'✓ Revisada · desmarcar':'Marcar como revisada';read.setAttribute('aria-pressed',String(reviewed.has(key(c))));$('progress').textContent=all.filter(x=>reviewed.has(key(x))).length+' de '+all.length+' revisadas en este navegador';$('storage-status').textContent='Progreso guardado en este navegador. No equivale a una validación técnica.';}catch{$('storage-status').textContent='No se pudo guardar el progreso. Puedes seguir leyendo las cápsulas.';}};
  card.append(read);$('capsules').append(card);
 }
}
async function load(){if(loading)return;loading=true;$('refresh').disabled=true;$('status').textContent='Consultando las cápsulas de Pixeria…';$('empty').hidden=true;
 try{const r=await fetch('https://stock.admira.store/stock/index.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Pixeria no está disponible ('+r.status+').');const items=capsulesFrom(await r.json());
  for(const c of items){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.title+'\n'+c.note));c.revision=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');readProgress(c);}
  all=items;$('status').textContent=all.length+' cápsulas consultadas en Pixeria · '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})+'. Si una cápsula cambia, su lectura vuelve a quedar pendiente.';
 }catch(e){$('status').textContent='No se pudo actualizar: '+e.message+(all.length?' Se mantiene el contenido de la última consulta de esta página.':' Pulsa «Actualizar desde Pixeria» para reintentarlo.');}
 finally{loading=false;$('refresh').disabled=false;render();}
}
$('search').addEventListener('input',render);$('category').addEventListener('change',render);$('refresh').addEventListener('click',load);load();
