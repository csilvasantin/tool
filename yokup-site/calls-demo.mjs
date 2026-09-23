import {PROFILES,SCENARIOS,STAGES,buildStory,stateAt,dialogueText,estimateCost} from './calls-demo-model.mjs';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const params=new URLSearchParams(location.search);
let profile=Object.hasOwn(PROFILES,params.get('calidad'))?params.get('calidad'):'balanced';
let scenario=Object.hasOwn(SCENARIOS,params.get('caso'))?params.get('caso'):'normal';
let story=buildStory(scenario),index=0,playing=false,timer,runGeneration=0,voiceGeneration=0,voiceCancel=null;
const status=t=>$('status').textContent=t;
const stateNames={open:'Incidencia abierta',proposed:'Propuesta pendiente',scheduled:'Cita confirmada',awaiting_rating:'Pendiente de satisfacción',reopened:'Revisión necesaria',closed:'Cierre satisfactorio',human_handoff:'Continúa una persona'};
const fields={device:'Equipo',site:'Ubicación',issue:'Incidencia',priority:'Prioridad',availability:'Disponibilidad',access:'Acceso',technician:'Técnico',distance:'Distancia',slot:'Franja propuesta',scope:'Trabajo',price:'Importe del ejemplo'};
function updateUrl(){const url=new URL(location.href);url.searchParams.set('calidad',profile);url.searchParams.set('caso',scenario);history.replaceState(null,'',url);}
function stopVoice(){voiceGeneration++;window.speechSynthesis?.cancel();voiceCancel?.();voiceCancel=null;}
function stop(){runGeneration++;playing=false;clearTimeout(timer);stopVoice();controls();}
function controls(){$('play').textContent=playing?'Pausar demo Ⅱ':index===story.length-1?'Volver a ver ▶':'Reproducir demo ▶';$('prev').disabled=index===0;$('next').disabled=index===story.length-1;}
function renderProfiles(){
 $('profiles').replaceChildren();for(const [key,p] of Object.entries(PROFILES)){const b=el('button',undefined,'profile');b.type='button';b.setAttribute('aria-pressed',String(key===profile));b.append(el('span',p.tag,'profile-tag'),el('strong',p.name),el('span',p.style,'small'));b.onclick=()=>{stop();profile=key;updateUrl();render();};$('profiles').append(b);}
}
function render(){
 const e=story[index],s=stateAt(story,index);renderProfiles();$('scenario').value=scenario;
 $('stages').replaceChildren();for(const [i,name] of STAGES.entries()){const li=el('li',undefined,i===e.stage?'current':i<e.stage?'done':'');li.append(el('span',String(i+1)),el('b',name));if(i===e.stage)li.setAttribute('aria-current','step');$('stages').append(li);}
 $('stage-label').textContent=STAGES[e.stage]+' · '+PROFILES[profile].name;$('step-title').textContent=e.title;$('step-description').textContent=e.description;
 $('dialogue').replaceChildren();for(const line of e.dialogue){const bubble=el('div',undefined,'bubble '+(line.who==='Yokup IA'?'ai':'person'));bubble.append(el('span',line.who,'speaker'),el('p',dialogueText(line,profile)));$('dialogue').append(bubble);}
 if(!e.dialogue.length){const visual=el('div',undefined,'system-visual'),icon=el('span',s.closed?'✓':e.kind==='no_answer'?'↻':'▱','screen-icon');icon.setAttribute('aria-hidden','true');visual.append(icon,el('p',e.kind==='detected'?'Señal detectada → incidencia única → contacto autorizado':e.kind==='no_answer'?'Sin respuesta → espera → nuevo intento':e.kind==='proposal'?`Propuesta v${s.version}: ambas partes tienen que aceptar.`:'El expediente conserva el contexto de cada paso.'));$('dialogue').append(visual);}
 $('decision').textContent=e.action;$('case-status').textContent=stateNames[s.status];$('case-data').replaceChildren();for(const [key,value] of Object.entries(s.data)){$('case-data').append(el('dt',fields[key]||key),el('dd',value));}
 $('proposal-version').textContent=s.version?'ACEPTACIONES · PROPUESTA V'+s.version:'SIN PROPUESTA TODAVÍA';$('acceptances').replaceChildren();for(const [key,name] of [['retailer','Comercio'],['installer','Técnico']]){const row=el('div',undefined,'acceptance');row.append(el('span',name),el('b',s.acceptances[key]?'Aceptada ✓':'Pendiente',s.acceptances[key]?'accepted':''));$('acceptances').append(row);}
 $('call-count').textContent=s.calls;$('retry-count').textContent=s.retries;$('step-count').textContent=`${index+1} / ${story.length}`;$('step-announcement').textContent=`Paso ${index+1} de ${story.length}. ${e.title}. ${stateNames[s.status]}.`;
 $('history').replaceChildren();for(const h of s.history){const li=el('li');li.append(el('strong',h.title),el('p',h.action));$('history').append(li);}
 const end=index===story.length-1;$('outcome').hidden=!end;$('outcome').replaceChildren();if(end){$('outcome').append(el('h3',s.closed?'La incidencia termina con una confirmación.':'La IA sabe cuándo pasar el relevo.'),el('p',s.closed?`${s.calls} contactos de ejemplo, ${s.version} ${s.version===1?'versión':'versiones'} de propuesta y un historial compartido. El comercio ha confirmado que la solución funciona.`:'La incidencia sigue abierta. Una persona recibe el contexto y continúa la gestión; pedir ayuda nunca se interpreta como una resolución.'));}
 controls();
}
function say(text,generation){return new Promise(resolve=>{
 if(generation!==voiceGeneration)return resolve();
 const utterance=new SpeechSynthesisUtterance(text);utterance.lang='es-ES';utterance.rate=1;
 const voices=window.speechSynthesis.getVoices();const voice=voices.find(v=>v.lang==='es-ES')||voices.find(v=>v.lang.startsWith('es'));if(voice)utterance.voice=voice;
 let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timeout);voiceCancel=null;resolve();};
 const timeout=setTimeout(()=>{status('La lectura ha tardado demasiado. Puedes continuar por escrito.');window.speechSynthesis.cancel();finish();},45000);
 voiceCancel=finish;utterance.onend=finish;utterance.onerror=()=>{if(generation===voiceGeneration)status('La voz no está disponible. Los diálogos siguen visibles.');finish();};window.speechSynthesis.speak(utterance);
 });}
async function narrate(){
 if(!$('narrate').checked)return;
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){status('Este navegador no dispone de locución. Puedes seguir la demo por escrito.');return;}
 stopVoice();const generation=voiceGeneration,e=story[index];
 const lines=e.dialogue.length?e.dialogue.map(l=>l.who+'. '+dialogueText(l,profile)):[e.title+'. '+e.description];
 for(const line of lines){if(generation!==voiceGeneration)return;await say(line,generation);}
}
async function run(){const generation=runGeneration;await narrate();if(!playing||generation!==runGeneration)return;if(index===story.length-1){playing=false;controls();return;}clearTimeout(timer);timer=setTimeout(()=>{if(!playing)return;index++;render();run();},Number($('pace').value));}
function play(){if(playing){stop();return;}stop();status('');if(index===story.length-1)index=0;playing=true;render();run();}
$('play').onclick=play;$('hero-play').onclick=()=>{if(!playing)play();};
$('next').onclick=()=>{stop();index=Math.min(index+1,story.length-1);render();narrate();};$('prev').onclick=()=>{stop();index=Math.max(0,index-1);render();narrate();};
$('reset').onclick=()=>{stop();index=0;render();status('Demo reiniciada.');};
$('scenario').onchange=e=>{stop();scenario=e.target.value;story=buildStory(scenario);index=0;updateUrl();render();status('Escenario preparado.');};
$('narrate').onchange=()=>{stopVoice();if(playing){runGeneration++;clearTimeout(timer);run();}else narrate();};$('pace').onchange=()=>{if(playing){runGeneration++;clearTimeout(timer);stopVoice();run();}};
$('share').onclick=async()=>{try{updateUrl();await navigator.clipboard.writeText(location.href);status('Enlace copiado con el perfil y el caso elegidos.');$('share').textContent='Enlace copiado ✓';}catch{status('Puedes copiar la dirección de esta página para compartir la demo.');}};
function comparison(){
 const rows=[['Para qué',p=>p.description],['Naturalidad',p=>p.naturalness],['Capacidad prevista',p=>p.capacity],['Modelo propuesto',p=>p.model],['Audio, USD / millón de tokens',p=>`${p.rates.audioIn} entrada · ${p.rates.audioOut} salida`],['Texto, USD / millón de tokens',p=>`${p.rates.textIn} entrada · ${p.rates.textOut} salida`]];
 for(const [title,get] of rows){const tr=el('tr'),th=el('th',title);th.scope='row';tr.append(th);for(const p of Object.values(PROFILES))tr.append(el('td',get(p)));$('comparison-body').append(tr);}
}
function costs(){
 const keys=['audioIn','audioOut','textIn','textOut'],usage=Object.fromEntries(keys.map(k=>[k,Number($(k).value)])),volume=Number($('volume').value);$('costs').replaceChildren();
 if(!Number.isInteger(volume)||volume<1||volume>100000||keys.some(k=>!$(k).validity.valid||$(k).value==='')){$('costs').append(el('p','Introduce volúmenes válidos para calcular.'));return;}
 for(const [key,p] of Object.entries(PROFILES)){const one=estimateCost(key,usage),row=el('div',undefined,'cost-row'),label=el('div');label.append(el('span',p.name),el('small',new Intl.NumberFormat('es-ES',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(one)+' por incidencia del ejemplo'));row.append(label,el('strong',new Intl.NumberFormat('es-ES',{style:'currency',currency:'USD'}).format(one*volume)));$('costs').append(row);}
}
for(const id of ['volume','audioIn','audioOut','textIn','textOut'])$(id).addEventListener('input',costs);
window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
comparison();costs();render();
