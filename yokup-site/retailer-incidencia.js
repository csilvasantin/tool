(() => {
// Ficha y alta de incidencias con el aspecto del portal. Los datos de la URL y de la API se insertan solo con textContent.
const API='https://data.yokup.com/api/retailer',ORIGINS={xpaceos:'XpaceOS','admira.store':'admira.store','admira.app':'admira.app'};
const $=s=>document.querySelector(s),q=new URLSearchParams(location.search),id=q.get('id');
const el=(tag,content,cls)=>{const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(cls)node.className=cls;return node;};
const date=ms=>ms?new Date(ms).toLocaleString('es',{dateStyle:'medium',timeStyle:'short'}):'';
const norm=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const slug=v=>{const s=String(v??'').trim().toLowerCase();return /^[a-z0-9][a-z0-9.-]{0,31}$/.test(s)?s:'';};
const originName=s=>ORIGINS[s]||s;
let current=null,dash=null,loading=false;const requestKey=crypto.randomUUID();
async function api(path,body){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(API+path,{method:body?'POST':'GET',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const result=await r.json();if(!r.ok)throw Object.assign(new Error(result.error||'No se pudo completar la operación.'),{status:r.status});return result;}catch(e){if(e.name==='AbortError')throw new Error('La conexión ha tardado demasiado. Actualiza para comprobar si se guardó antes de repetir.');throw e;}finally{clearTimeout(timeout);}}
function show(section){for(const s of ['loading','login-card','missing-card','follow','report'])$('#'+s).hidden=s!==section;}
function login(){show('login-card');$('#login-link').href='/retailer?next='+encodeURIComponent('/retailer/incidencia'+location.search);}
function badge(text){const b=$('#origin-badge');b.hidden=!text;b.textContent=text||'';}
function notice(text){$('#page-notice').hidden=!text;$('#page-notice').textContent=text||'';}
const stateOf=i=>i.status==='open'?'Buscando técnico':i.status==='assigned'?'Técnico asignado':!i.rated_at?'Pendiente de tu valoración':i.satisfied?'Valorada · funciona':'Revisión solicitada';
const STEPS={reported:['Comunicada','Recibida'],assigned:['Técnico asignado','Buscando técnico cercano'],resolved:['Resuelta','Reparación pendiente'],rated:['Valorada','Tu opinión completa el servicio']};

function renderFollow(i){
 document.title='Yokup · '+i.title;$('#heading-follow').hidden=$('#lede-follow').hidden=false;$('#heading-new').hidden=$('#lede-new').hidden=true;
 $('#f-state').textContent=stateOf(i);$('#f-state').dataset.state=i.status==='resolved'?(i.rated_at?(i.satisfied?'ok':'review'):'rate'):i.status;
 $('#f-priority').hidden=i.priority!=='urgent';$('#f-origin').hidden=!i.source;$('#f-origin').textContent=i.source?'Desde '+originName(i.source):'';badge(i.source?'Abierta desde '+originName(i.source):'');
 $('#f-title').textContent=i.title;$('#f-where').textContent=[i.device_name,i.site_name].filter(Boolean).join(' · ');
 const track=$('#f-track'),steps=i.timeline||[];track.replaceChildren();let next=true;
 for(const s of steps){const [label,pending]=STEPS[s.step]||[s.step,''],li=el('li',undefined,s.at?'done':next?'current':'');if(!s.at)next=false;li.append(el('strong',label),el('span',s.at?date(s.at):pending));track.append(li);}
 $('#f-tech').textContent=i.technician_name?i.technician_name:i.status==='open'?'Estamos avisando a técnicos de esta especialidad cerca de tu comercio.':'Técnico asignado.';
 const tz=i.appointment_timezone||undefined;$('#f-appointment').hidden=$('#f-scope').hidden=!i.appointment_start;
 if(i.appointment_start){$('#f-appointment').textContent='Cita confirmada: '+new Date(i.appointment_start).toLocaleString('es-ES',{timeZone:tz,dateStyle:'full',timeStyle:'short'})+(i.appointment_end?' — '+new Date(i.appointment_end).toLocaleTimeString('es-ES',{timeZone:tz,timeStyle:'short'}):'')+(Number.isFinite(i.appointment_cost_cents)?' · '+(i.appointment_cost_cents/100).toFixed(2)+' EUR':'');$('#f-scope').textContent=i.appointment_scope||'';$('#f-scope').hidden=!i.appointment_scope;}
 $('#f-description').textContent=i.description||'Sin descripción.';$('#f-ref').textContent='Referencia: '+i.id;
 $('#f-resolution-box').hidden=!i.resolution;$('#f-resolution').textContent=i.resolution||'';const proof=$('#f-evidence'),safe=/^https:\/\//.test(i.evidence_url||'');proof.hidden=!safe;if(safe)proof.href=i.evidence_url;else proof.removeAttribute('href');
 $('#f-rating-box').hidden=!i.rated_at;if(i.rated_at){$('#f-stars').textContent='★'.repeat(i.stars)+'☆'.repeat(5-i.stars)+' · '+(i.satisfied?'Equipo funcionando':'Revisión en seguimiento')+' · '+date(i.rated_at);$('#f-comment').textContent=i.comment||'';const f=$('#f-followup'),other=i.followup_id&&i.followup_id!==i.id;f.hidden=!other;if(other)f.href='?id='+encodeURIComponent(i.followup_id);}
 $('#rating-form').hidden=!(i.status==='resolved'&&!i.rated_at);
 $('#f-updated').textContent='Actualizado '+new Date().toLocaleTimeString('es',{timeStyle:'short'})+' · se actualiza cada 30 s';
}
async function follow(){if(loading)return;loading=true;try{const r=await api('/incidents/'+encodeURIComponent(id));current=r.incident;renderFollow(current);$('#page-status').textContent='';show('follow');}catch(e){if(e.status===401)login();else if(e.status===404)show('missing-card');else{$('#page-status').textContent=e.message;if(!current)$('#loading').hidden=true;}}finally{loading=false;}}

function deviceOptions(siteId,selected){
 const select=$('#r-device'),devices=dash.devices.filter(d=>!siteId||d.site_id===siteId),siteName=d=>dash.sites.find(s=>s.id===d.site_id)?.name||'';select.replaceChildren();
 const first=el('option',devices.length?'Selecciona el equipo…':'Este establecimiento no tiene equipos');first.value='';select.append(first);
 for(const d of devices){const o=el('option',siteId?d.name:d.name+' · '+siteName(d));o.value=d.id;select.append(o);}select.value=devices.some(d=>d.id===selected)?selected:'';activeNote();
}
function activeNote(){const a=dash.incidents.find(i=>i.device_id===$('#r-device').value&&i.status!=='resolved'),note=$('#r-active');note.hidden=!a;note.replaceChildren();if(a){const link=el('a','Ver su seguimiento →');link.href='?id='+encodeURIComponent(a.id);note.append(el('span','Este equipo ya tiene una incidencia en curso: «'+a.title+'». '),link);}}
async function report(){
 try{dash=await api('/dashboard');}catch(e){if(e.status===401)return login();$('#loading').hidden=true;$('#page-status').textContent=e.message;return;}
 const source=slug(q.get('origen'));badge(source?'Llega desde '+originName(source):'');show('report');
 if(!dash.devices.length){$('#report-form').hidden=true;$('#r-empty').hidden=false;return;}
 const siteQ=norm(q.get('establecimiento')),devQ=norm(q.get('equipo')),same=d=>norm(d.name)===devQ||(!!d.admira_device_id&&norm(d.admira_device_id)===devQ);
 const site=siteQ?dash.sites.find(s=>norm(s.name)===siteQ||(!!s.external_ref&&norm(s.external_ref)===siteQ)):null;
 const device=devQ?(dash.devices.find(d=>(!site||d.site_id===site.id)&&same(d))||dash.devices.find(same)):null,siteId=device?.site_id||site?.id||'';
 const sites=$('#r-site');sites.replaceChildren();const all=el('option','Todos mis establecimientos');all.value='';sites.append(all);for(const s of dash.sites){const o=el('option',s.name);o.value=s.id;sites.append(o);}sites.value=siteId;deviceOptions(siteId,device?.id);
 const missing=[devQ&&!device?'el equipo «'+q.get('equipo')+'»':'',siteQ&&!site&&!device?'el establecimiento «'+q.get('establecimiento')+'»':''].filter(Boolean);
 const match=$('#r-match');match.hidden=!(device||missing.length);match.textContent=device?'Equipo reconocido: '+device.name+' · '+(dash.sites.find(s=>s.id===device.site_id)?.name||''):missing.length?'No encontramos '+missing.join(' ni ')+' entre los tuyos. Elige el equipo afectado.':'';
 const form=$('#report-form');form.elements.title.value=(q.get('problema')||'').slice(0,200);form.elements.priority.value=['urgente','alta','urgent','high'].includes(norm(q.get('gravedad')))?'urgent':'normal';
 form.elements.description.maxLength=2000-(source?source.length+11:0);form.elements.description.value=(q.get('detalle')||'').slice(0,form.elements.description.maxLength);
 form.dataset.source=source;
}
$('#r-site').onchange=e=>deviceOptions(e.target.value,$('#r-device').value);$('#r-device').onchange=activeNote;
$('#report-form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button.primary'),status=form.querySelector('.form-status'),b=Object.fromEntries(new FormData(form));button.disabled=true;status.textContent='Enviando…';
 try{const r=await api('/incidents',{device_id:b.device_id,title:b.title.trim(),description:b.description.trim(),priority:b.priority==='urgent'?'urgent':'normal',request_key:requestKey,...(form.dataset.source?{source:form.dataset.source}:{})});location.assign(location.pathname+'?id='+encodeURIComponent(r.id)+(r.duplicate?'&aviso=duplicada':''));}
 catch(err){if(err.status===401)login();else status.textContent=err.message;button.disabled=false;}};
$('#rating-form [name=satisfied]').onchange=e=>{const c=$('#rating-form [name=comment]');c.minLength=e.target.value==='no'?10:0;c.required=e.target.value==='no';};
$('#rating-form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button.primary'),status=form.querySelector('.form-status'),b=Object.fromEntries(new FormData(form));button.disabled=true;status.textContent='Guardando…';
 try{await api('/incidents/'+encodeURIComponent(id)+'/rating',{stars:Number(b.stars),satisfied:b.satisfied==='yes',comment:b.comment});form.reset();status.textContent='';notice(b.satisfied==='yes'?'Gracias. Tu valoración ya consta en la intervención.':'Gracias. Hemos abierto una revisión y conservamos todo el historial.');await follow();}
 catch(err){if(err.status===401)login();else status.textContent=err.message;}finally{button.disabled=false;}};
if(id){if(q.get('aviso')==='duplicada')notice('Este equipo ya tenía una incidencia en curso. Te mostramos su seguimiento.');follow();setInterval(()=>{if(!document.hidden&&!$('#follow').hidden)follow();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#follow').hidden)follow();});}
else report();
})();
