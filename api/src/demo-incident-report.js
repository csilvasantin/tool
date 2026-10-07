// Informe PDF de una incidencia DEMO del gemelo (Carlos, 7-oct-2026 · /cerrar incidencia en el modo experto de
// admira.store). r2 (21:16): estética «mission report», datos de proyecto, ubicación y pantalla desde el ITIL de
// Yokup (registro demo del gemelo), historial real de tickets, resumen ejecutivo por IA (Workers AI) y copia del PDF
// al Telegram privado de Carlos.
// Seguridad: el destinatario NO viene del cliente —el correo lo fija el binding send_email (destination_address)
// y aquí también; el chat de Telegram es un secreto del worker (DEMO_REPORT_TELEGRAM_CHAT_ID, chat privado: id
// positivo)—, sólo incidencias demo de la tienda Starbucks abiertas por la CLI (`…:manual:cli-…`) y ya CERRADAS,
// una vez por incidencia y como mucho 10 informes por hora. No es un relay: sin destinatario, asunto ni cuerpo libres.
import {rateLimit,statement} from './installer-portal.js';
import {resolveEquipo,xpacioSite} from './itil.js';
import {renderMissionPdf} from './demo-report-pdf.js';
export const REPORT_TO='csilvasantin@gmail.com',REPORT_FROM='incidencias@admira.live',REPORT_FROM_NAME='Admira · Mission Control';
export const REPORT_ORIGINS=new Set(['https://www.admira.store','https://admira.store','https://www.xpaceos.com','https://xpaceos.com']);
export const REPORT_HOURLY=10;
export const AI_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const STORE_PREFIX='demo:starbucks-alsea-paseo-de-gracia:';
const ID_RE=/^[A-Z]{3}-[A-Z0-9]{4,10}$/;
const DAY=86400000;
function cors(request,body,status=200){const origin=request.headers.get('origin')||'';const h={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};if(REPORT_ORIGINS.has(origin)){h['access-control-allow-origin']=origin;h['access-control-allow-methods']='POST, OPTIONS';h['access-control-allow-headers']='content-type';h['access-control-max-age']='600';}return new Response(JSON.stringify(body),{status,headers:h});}
const fmt=(ms,opt={})=>ms?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',...opt}).format(new Date(ms)):'—';
const fmtDay=(ms)=>ms?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ms)):'—';
const clock=(ms)=>ms?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(ms)):'—';
const isoToMs=(d)=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?Date.parse(d+'T00:00:00Z'):0;
const esDay=(d)=>{const ms=isoToMs(d);return ms?fmtDay(ms):'—';};
export const dur=(ms)=>{if(!(ms>0))return '—';const s=Math.round(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return h?h+' h '+m+' min':(m?m+' min ':'')+r+' s';};
export const tplus=(ms)=>{const s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return 'T+'+(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(r).padStart(2,'0');};
export function equipoOf(resource){const m=/^demo:[^:]+:([^:]+)/.exec(String(resource||''));return m?m[1]:'';}
export function equipoLabel(resource){const e=equipoOf(resource),n=/^pantalla-(\d+)$/.exec(e);return n?'Pantalla '+n[1]+' (vertical del lineal)':e||'—';}
export function causeFromSubject(subject){const parts=String(subject||'').split(' · ');return parts.length>=3?parts.slice(2).join(' · '):String(subject||'');}
export function cleanTimeline(list){return (Array.isArray(list)?list:[]).slice(0,14).map(s=>({at:String(s&&s.at||'').replace(/[^\d:]/g,'').slice(0,8),text:String(s&&s.text||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,160)})).filter(s=>s.text.trim());}
// idIoT (contrato de admira.store/inventario/idiot.mjs): Proyecto_Xpacio_Tipo_n → Starbucks_PaseodeGracia_103_Pantalla_5.
const idPart=t=>{const s=String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'');return s?s[0].toUpperCase()+s.slice(1):'';};
export function idIotFor({project='Starbucks',address='',equipo=''}){const street=String(address).split('·')[0].trim(),m=/^(\D{3,}?)[\s,]+(?:n[ºo°.]?\s*)?(\d{1,4}[A-Za-z]?)(?=$|[\s,])/.exec(street),xp=m?idPart(m[1])+'_'+m[2].toUpperCase():idPart(street);const n=/^pantalla-(\d+)$/.exec(equipo);return idPart(project)+'_'+xp+'_'+(n?'Pantalla_'+n[1]:idPart(equipo));}
async function fetchIncident(env,id){
 const url='https://api.yokup.com/incident/status?ids='+encodeURIComponent(id);
 const r=env.RTC&&typeof env.RTC.fetch==='function'?await env.RTC.fetch(new Request(url)):await (env.REPORT_FETCH||fetch)(url);
 const d=await r.json().catch(()=>({}));return (d.incidents||[]).find(i=>i.id===id)||null;
}
// Historial real del activo y eventos de la incidencia: D1 yokup-tickets (binding TICKETS, sólo lectura aquí).
export async function ticketHistory(env,resource,id){
 const e=equipoOf(resource),store=/^demo:([^:]+):/.exec(String(resource||''))?.[1];if(!env.TICKETS||!e||!store)return {available:false,list:[],events:[]};
 const base=`demo:${store}:${e}`;
 const list=(await env.TICKETS.prepare("SELECT id,screen,subject,status,priority,assignee,created_at,resolved_at FROM tickets WHERE (screen=? OR (screen>=? AND screen<?)) AND status!='cancelled' ORDER BY created_at DESC LIMIT 500").bind(base,base+':',base+':\uffff').all()).results||[];
 const events=(await env.TICKETS.prepare('SELECT ts,kind,author,text FROM events WHERE ticket_id=? ORDER BY ts ASC, id ASC LIMIT 80').bind(id).all()).results||[];
 return {available:true,list,events};
}
async function loadContext(env,inc,now){
 const equipo=equipoOf(inc.resource),ctx={equipo,ci:null,site:null,brand:null,history:{available:false,list:[],events:[]}};
 try{const r=await resolveEquipo(env,{ref:inc.resource},now);if(r?.found)ctx.ci=r.ci;}catch(e){console.error('report_itil_failed',e.message);}
 try{ctx.site=await xpacioSite(env,'alsea-sbux-021');if(ctx.site?.brand_key)ctx.brand=await statement(env,'SELECT name FROM brand_accounts WHERE brand_key=?',ctx.site.brand_key).first();}catch(e){console.error('report_site_failed',e.message);}
 try{ctx.history=await ticketHistory(env,inc.resource,inc.id);}catch(e){console.error('report_history_failed',e.message);}
 return ctx;
}
const SEV={urgente:'URGENTE',alta:'ALTA',normal:'NORMAL',baja:'BAJA'};
const EVENT_LABEL={log:'Registro',accept:'Aceptada',assign:'Asignada',note:'Nota',status:'Estado',close:'Cierre',recover:'Recuperada',evidence:'Evidencia',reopen:'Reabierta'};
// Modelo del informe: todo lo que pinta el PDF, ya en texto. Puro (testeable sin red).
export function buildReportModel(inc,ctx,{ai,timeline=[],now=Date.now()}={}){
 const sla=inc.sla||{},opened=inc.created_at,closed=inc.resolved_at,site=ctx.site||{},ci=ctx.ci||null,lc=ci?.lifecycle||{};
 const brand='Starbucks',client=ctx.brand?.name||'Alsea',address=site.address||'Paseo de Gracia 103 · Barcelona · 08008',city=site.city||'Barcelona';
 const idIoT=idIotFor({project:brand,address,equipo:ctx.equipo});
 const list=ctx.history.list||[],failuresAll=list.length,failures90=list.filter(t=>Number(t.created_at)>=now-90*DAY).length;
 const installedMs=isoToMs(lc.installed_at)||isoToMs(lc.purchase_date);
 const mtbfDays=installedMs&&failuresAll?(now-installedMs)/DAY/failuresAll:0;
 const mtbf=mtbfDays?(mtbfDays>=1?Math.round(mtbfDays)+' d':Math.round(mtbfDays*24)+' h'):'—';
 const warrantyState={valid:'EN GARANTÍA',expiring:'GARANTÍA POR VENCER',expired:'FUERA DE GARANTÍA',none:'SIN DATOS'}[lc.warranty||'none'];
 const warrantyLong=lc.warranty_until?`${warrantyState} · vence ${esDay(lc.warranty_until)}${lc.warranty_days!=null?' ('+(lc.warranty_days>=0?lc.warranty_days+' días restantes':'vencida hace '+(-lc.warranty_days)+' días')+')':''}${lc.warranty_months?' · '+lc.warranty_months+' meses':''}`:'Sin datos de garantía en el ITIL';
 const isDemoInv=/DEMO/i.test(String(lc.notes||''))||/DEMO/i.test(String(lc.serial||''));
 const resMin=sla.resolution_min||0,elapsed=closed&&opened?closed-opened:0,frac=resMin?elapsed/(resMin*60000):0;
 const slaOk=sla.resolution_ok!==false&&sla.response_ok!==false;
 const cause=causeFromSubject(inc.subject),sev=SEV[inc.priority]||String(inc.priority||'').toUpperCase();
 const events=ctx.history.events||[];
 const accept=events.find(e=>e.kind==='accept'||e.kind==='assign'),start=events.find(e=>['note','status','evidence'].includes(e.kind)&&Number(e.ts)>=opened);
 const tl=[Object.assign([tplus(0),clock(opened),'Detectada','Fallo notificado desde el gemelo (CLI) · '+cause],{ms:opened-2}),Object.assign([tplus(0),clock(opened),'Abierta','Ticket '+inc.id+' en Yokup / admira.app · severidad '+sev],{ms:opened-1})];
 if(accept)tl.push(Object.assign([tplus(accept.ts-opened),clock(accept.ts),'Asignada',(accept.author||inc.assignee||'Técnico')+(accept.text?' · '+accept.text:'')],{ms:Number(accept.ts)}));else if(inc.assignee)tl.push(Object.assign(['—','—','Asignada','Técnico asignado: '+inc.assignee],{ms:opened}));
 if(sla.responded_at)tl.push(Object.assign([tplus(sla.responded_at-opened),clock(sla.responded_at),'Iniciada','Primera respuesta registrada · en curso'],{ms:Number(sla.responded_at)+0.5}));else if(start)tl.push(Object.assign([tplus(start.ts-opened),clock(start.ts),'Iniciada',(start.text||'').slice(0,120)],{ms:Number(start.ts)}));
 for(const e of events){if(e===accept||e.kind==='close')continue;if(e.kind==='log'&&/Misión activada/.test(e.text||''))continue;if(tl.length>=22)break;tl.push(Object.assign([tplus(e.ts-opened),clock(e.ts),EVENT_LABEL[e.kind]||e.kind,String(e.author?e.author+': ':'')+String(e.text||'').slice(0,140)],{ms:Number(e.ts)+1}));}
 tl.sort((a,b)=>(a.ms??0)-(b.ms??0));
 tl.push([tplus(elapsed),clock(closed),'Resuelta','Finalizada por '+(inc.closed_by||'—')+' · «'+(inc.resolution||'—')+'»']);
 const statusTone='0.35 0.95 0.55';
 const history=list.filter(t=>t.id!==inc.id).slice(0,8).map(t=>{const row=[t.id,fmt(t.created_at,{second:undefined}),causeFromSubject(t.subject).slice(0,90),t.resolved_at?dur(t.resolved_at-t.created_at):'—',t.status==='resolved'?'Cerrada':t.status==='open'?'Abierta':t.status];return row;});
 const reportNo='MR-'+fmtDay(now).split('/').reverse().join('')+'-'+inc.id.slice(4);
 return {
  id:inc.id,reportNo,classification:'DEMO // USO INTERNO ADMIRA // NO DISTRIBUIR // YOKUP MISSION CONTROL',
  headline:`${brand} Paseo de Gracia 103 · ${equipoLabel(inc.resource)}`,
  status:inc.stage==='cerrada'?'FINALIZADA':String(inc.stage||'').toUpperCase(),statusTone,severity:sev,
  slaVerdict:slaOk?'EN PLAZO':'FUERA DE PLAZO',slaTone:slaOk?statusTone:'1 0.45 0.35',duration:dur(elapsed),
  t0:fmt(opened),tEnd:fmt(closed),generated:fmt(now),
  slaFraction:frac,slaSub:resMin?dur(elapsed)+' de '+(resMin>=60?Math.round(resMin/60)+' h':resMin+' min'):'',
  location:{oneLine:`${site.name||'Starbucks Paseo de Gracia'} · ${address} · alsea-sbux-021`,rows:[
   ['Establecimiento',site.name||'Starbucks Paseo de Gracia'],['Dirección',address],['Ciudad / país',city+' · '+(site.country||'ES')],
   ['Id de Xpacio','alsea-sbux-021 (catálogo Admira) · Yokup '+(site.id||'—')],['Gemelo digital',site.twin_url||'https://www.xpaceos.com/admira-xp/?loc=alsea-sbux-021'],
   ['Recurso del gemelo',String(inc.resource||'').replace(/:manual:.*/,'')]]},
  project:[['Marca',brand],['Cliente',client+' (cuenta de marca '+(site.brand_key||'alsea')+')'],['Proyecto / circuito',(site.circuit_id||'alsea_starbucks')+' · Admira DS'],['Tipo de Xpacio','Cafetería · QSR con pared de pantallas verticales'],['Plataforma','XpaceOS (gemelo) · Yokup (ITIL, incidencias) · admira.app (ficha)']],
  asset:{idIoT,itil:ci?.itil_code||'—',model:[lc.manufacturer,lc.model].filter(Boolean).join(' ')||'modelo sin registrar',
   failuresAll:ctx.history.available?failuresAll:'—',failures90:ctx.history.available?failures90:'—',mtbf,warrantyShort:{valid:'VIGENTE',expiring:'POR VENCER',expired:'VENCIDA',none:'—'}[lc.warranty||'none'],
   source:(ci?'Inventario: Yokup ITIL '+ci.itil_code+(isDemoInv?' (registro DEMO del gemelo)':''):'Inventario: sin ficha ITIL')+' · historial: Yokup tickets',
   rows:[['idIoT',idIoT],['Código ITIL',ci?.itil_code||'—'],['Equipo (CI)',(ci?.name||equipoLabel(inc.resource))+' · '+(ci?.device_id||'—')],['Fabricante / modelo',[lc.manufacturer,lc.model].filter(Boolean).join(' · ')||'—'],
    ['Orientación',ci?.orientation||'vertical'],['Posición en el lineal',[ci?.group_name,ci?.position?'posición '+ci.position:''].filter(Boolean).join(' · ')||'—'],['Función',ci?.role||'—'],
    ['Nº de serie',lc.serial||'—'],['Fecha de compra',esDay(lc.purchase_date)+(lc.supplier?' · '+lc.supplier:'')+(lc.invoice_ref?' · '+lc.invoice_ref:'')],['Instalación',esDay(lc.installed_at)+(lc.installed_by?' · '+lc.installed_by:'')],
    ['Garantía',warrantyLong,lc.warranty==='valid'?'0.1 0.5 0.25':lc.warranty==='expired'?'0.75 0.15 0.1':null],['Mantenimiento',lc.last_maintenance_at?'último '+esDay(lc.last_maintenance_at)+(lc.maintenance_due_on?' · próximo '+esDay(lc.maintenance_due_on):''):'—'],
    ['Fallos registrados',ctx.history.available?`${failuresAll} en total (incluida esta) · ${failures90} en los últimos 90 días`:'historial no disponible'],['MTBF',mtbf==='—'?'—':mtbf+' entre fallos desde la instalación'],
    ['Estado del activo',{operational:'Operativo',degraded:'Degradado',maintenance:'En mantenimiento',retired:'Retirado',planned:'Previsto'}[lc.status]||'Operativo'],...(isDemoInv?[['Nota de inventario','Datos de compra, serie y garantía del registro DEMO del gemelo en Yokup ITIL (no proceden de factura real).']]:[])],
   history},
  incident:[['Incidencia',inc.id+' · '+(inc.stage==='cerrada'?'Finalizada en admira.app':inc.stage)],['Motivo',cause],['Severidad',sev],['Técnico asignado',inc.assignee||'—'],
   ['Abierta',fmt(opened)+' · por admira.store (modo experto, CLI)'],['Primera respuesta',fmt(sla.responded_at)],['Cerrada',fmt(closed)+' · por '+(inc.closed_by||'—')],['Duración',dur(elapsed)],
   ['SLA respuesta',(sla.response_min?'<= '+sla.response_min+' min · ':'')+(sla.response_ok===false?'FUERA de plazo':'en plazo')],['SLA resolución',(resMin?'<= '+(resMin>=60?Math.round(resMin/60)+' h':resMin+' min')+' · ':'')+(sla.resolution_ok===false?'FUERA de plazo':'en plazo')+(frac?' · '+Math.round(frac*100)+'% del plazo':'')],
   ['Nota de resolución',inc.resolution||'—'],['Ficha',`https://www.admira.app/ticket?id=${inc.id}`]],
  timeline:tl,console:cleanTimeline(timeline).map(s=>[s.at,s.text]),
  ai:ai||fallbackSummary(inc,{cause,sev,failuresAll,failures90,warranty:lc.warranty,elapsed,slaOk}),
  signoff:[['PREPARADO POR','Yokup Mission Control · informe automático',fmt(now)],['CERRADO POR',inc.closed_by||'—',fmt(closed)],['VALIDADO EN','admira.app · ficha '+inc.id+' Finalizada',fmt(closed)]],
  disclaimer:'Incidencia de demostración del gemelo digital (recurso demo:). Datos de proyecto, ubicación y activo tomados del ITIL de Yokup; historial de fallos de la bandeja de tickets de Yokup; resumen ejecutivo generado por IA ('+(ai?.model||'plantilla')+') a partir de esos datos. Enviado únicamente a '+REPORT_TO+' y al Telegram privado de Carlos Silva.'
 };
}
export function fallbackSummary(inc,{cause,sev,failuresAll,failures90,warranty,elapsed,slaOk}){
 return {label:'Plantilla',model:'plantilla',summary:`La incidencia ${inc.id} (${sev}) en ${equipoLabel(inc.resource)} del Starbucks de Paseo de Gracia 103 se detectó por «${cause}» y quedó resuelta en ${dur(elapsed)}, ${slaOk?'dentro':'fuera'} del plazo de SLA. Cierre: «${inc.resolution||'—'}».`,
  rootCause:cause,recommendations:[warranty==='valid'?'Tramitar cualquier pieza afectada por la garantía vigente del fabricante.':'Valorar la sustitución o extensión de garantía del equipo.',failures90>2?'Programar una revisión preventiva: el activo acumula '+failures90+' fallos en 90 días.':'Mantener la monitorización remota del reproductor y la alimentación.','Documentar la resolución en la base de conocimiento de Yokup.'],
  risk:failures90>2?'ALTO':failuresAll>1?'MEDIO':'BAJO',note:'resumen de plantilla (IA no disponible)'};
}
// Resumen ejecutivo con Workers AI (el mismo modelo que yokup-rtc). Si falla o tarda, plantilla.
export async function aiSummary(env,model,{timeoutMs=20000}={}){
 if(!env.AI||typeof env.AI.run!=='function')return null;
 const facts={incidencia:model.id,tienda:model.location.oneLine,equipo:model.headline,activo:Object.fromEntries(model.asset.rows.map(([k,v])=>[k,v])),incidencia_datos:Object.fromEntries(model.incident.map(([k,v])=>[k,v])),historial:model.asset.history.slice(0,6)};
 const prompt='Eres el jefe de operaciones de mantenimiento de Admira (digital signage). Con estos datos REALES escribe un informe ejecutivo ultraprofesional en español, sobrio, sin inventar cifras que no estén en los datos. Devuelve SOLO JSON con las claves: "resumen" (3-4 frases), "causa_raiz" (1-2 frases técnicas), "recomendaciones" (array de 3 acciones concretas), "riesgo" (BAJO, MEDIO o ALTO, según fallos y garantía).\nDATOS:\n'+JSON.stringify(facts).slice(0,6000);
 try{
  const run=env.AI.run(AI_MODEL,{messages:[{role:'system',content:'Respondes únicamente con JSON válido.'},{role:'user',content:prompt}],max_tokens:700,temperature:0.3});
  let timer;const out=await Promise.race([run,new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error('timeout')),timeoutMs);})]).finally(()=>clearTimeout(timer));
  const txt=typeof out?.response==='string'?out.response:JSON.stringify(out?.response||'');const j=JSON.parse(txt.slice(txt.indexOf('{'),txt.lastIndexOf('}')+1));
  const recs=(Array.isArray(j.recomendaciones)?j.recomendaciones:[]).map(x=>String(typeof x==='string'?x:x?.accion||x?.descripcion||JSON.stringify(x)).slice(0,300)).filter(Boolean).slice(0,4);
  if(!j.resumen||!recs.length)return null;
  return {label:'IA · Workers AI',model:AI_MODEL.replace('@cf/',''),summary:String(j.resumen).slice(0,1100),rootCause:String(j.causa_raiz||'').slice(0,500)||'—',recommendations:recs,risk:/ALTO/i.test(j.riesgo)?'ALTO':/MEDIO/i.test(j.riesgo)?'MEDIO':'BAJO',note:'generado por IA a partir de los datos de Yokup'};
 }catch(e){console.error('report_ai_failed',e&&e.message);return null;}
}
const b64=(bytes)=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
const b64text=(t)=>b64(new TextEncoder().encode(t));
const encWord=(t)=>'=?UTF-8?B?'+b64text(t)+'?=';
export function buildMime(model,pdf,{now=Date.now(),messageId}={}){
 const boundary='yk-'+crypto.randomUUID();
 const text=`INFORME DE MISIÓN · ${model.id} · ${model.reportNo}\n${model.headline}\n${model.location.oneLine}\n\nEstado: ${model.status} · Severidad: ${model.severity} · SLA: ${model.slaVerdict} · Duración: ${model.duration}\n\nRESUMEN EJECUTIVO (${model.ai.label})\n${model.ai.summary}\n\nCausa raíz: ${model.ai.rootCause}\nRecomendaciones:\n${model.ai.recommendations.map((r,i)=>(i+1)+'. '+r).join('\n')}\n\nActivo: ${model.asset.idIoT} · ${model.asset.itil} · ${model.asset.model}\nFallos: ${model.asset.failuresAll} (90 días: ${model.asset.failures90}) · MTBF ${model.asset.mtbf} · Garantía ${model.asset.warrantyShort}\n\nAdjunto: informe completo en PDF.\n`;
 const lines=['From: '+encWord(REPORT_FROM_NAME)+' <'+REPORT_FROM+'>','To: <'+REPORT_TO+'>','Subject: '+encWord(`Informe de misión ${model.id} · ${model.headline} · ${model.status}`),'Message-ID: '+messageId,'Date: '+new Date(now).toUTCString(),'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64text(text).replace(/.{76}/g,'$&\r\n'),'--'+boundary,'Content-Type: application/pdf; name="informe-'+model.id+'.pdf"','Content-Disposition: attachment; filename="informe-'+model.id+'.pdf"','Content-Transfer-Encoding: base64','',b64(pdf).replace(/.{76}/g,'$&\r\n'),'--'+boundary+'--',''];
 return lines.join('\r\n');
}
async function defaultSend(env,raw){
 if(!env.INCIDENT_MAIL||typeof env.INCIDENT_MAIL.send!=='function'){const e=Error('El envío de correo no está configurado (binding INCIDENT_MAIL).');e.status=503;throw e;}
 const {EmailMessage}=await import('cloudflare:email');
 const out=await env.INCIDENT_MAIL.send(new EmailMessage(REPORT_FROM,REPORT_TO,raw));
 return out&&out.messageId||null;
}
// Telegram: SOLO al chat privado fijado en el secreto del worker (id positivo = persona, nunca un grupo).
export async function defaultTelegram(env,pdf,model){
 const chat=String(env.DEMO_REPORT_TELEGRAM_CHAT_ID||'').trim();
 if(!env.TELEGRAM_BOT_TOKEN||!chat)return {sent:false,reason:'telegram_no_configurado'};
 if(!/^\d{5,15}$/.test(chat))return {sent:false,reason:'chat_no_privado'};
 const fd=new FormData();fd.append('chat_id',chat);fd.append('caption',`🛰 Informe de misión ${model.id} · ${model.headline}\n${model.status} · ${model.severity} · SLA ${model.slaVerdict} · ${model.duration}`.slice(0,1000));
 fd.append('document',new Blob([pdf],{type:'application/pdf'}),'informe-'+model.id+'.pdf');
 const r=await (env.TELEGRAM_FETCH||fetch)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,{method:'POST',body:fd,signal:AbortSignal.timeout(20000)});
 const j=await r.json().catch(()=>({}));
 return j&&j.ok?{sent:true,message_id:j.result?.message_id||null}:{sent:false,reason:String(j?.description||('HTTP '+r.status)).slice(0,120)};
}
export async function handleDemoIncidentReport(request,env,deps={}){
 if(request.method==='OPTIONS')return cors(request,{});
 if(request.method!=='POST')return cors(request,{error:'Método no permitido.'},405);
 if(!REPORT_ORIGINS.has(request.headers.get('origin')||''))return cors(request,{error:'Origen no permitido.'},403);
 const b=await request.json().catch(()=>({}));const id=String(b&&b.id||'').trim().toUpperCase();
 if(!ID_RE.test(id))return cors(request,{error:'Incidencia inválida.'},400);
 const inc=await (deps.fetchIncident||fetchIncident)(env,id);
 if(!inc)return cors(request,{error:'No encuentro esa incidencia.'},404);
 if(!String(inc.resource||'').startsWith(STORE_PREFIX)||!/:manual:cli-/.test(String(inc.resource||'')))return cors(request,{error:'Sólo incidencias demo abiertas por la CLI del gemelo.'},403);
 if(inc.stage!=='cerrada')return cors(request,{error:'La incidencia aún no está cerrada.'},409);
 const now=(deps.now||Date.now)();
 const limiter=deps.rateLimit||rateLimit;
 try{await limiter(env,'demo-incident-report',REPORT_HOURLY,3600000);}catch(e){return cors(request,{error:'Límite de informes alcanzado (10/hora). Prueba más tarde.'},429);}
 const onceKey='demo-incident-report:'+id;
 try{await limiter(env,onceKey,1,7*DAY);}catch(e){return cors(request,{error:'El informe de esta incidencia ya se envió.',already:true,to:REPORT_TO},409);}
 const ctx=await (deps.loadContext||loadContext)(env,inc,now);
 const draft=buildReportModel(inc,ctx,{timeline:b.timeline,now});
 const ai=await (deps.aiSummary||aiSummary)(env,draft);
 const model=ai?buildReportModel(inc,ctx,{ai,timeline:b.timeline,now}):draft;
 const pdf=renderMissionPdf(model);
 const messageId='<informe-'+id.toLowerCase()+'-'+now+'@admira.live>';
 let mail=null,mailErr=null,tg=null;
 try{mail=await (deps.send||defaultSend)(env,buildMime(model,pdf,{now,messageId}));}catch(e){mailErr=e;console.error('demo_incident_report_failed',e&&e.message);}
 try{tg=await (deps.telegram||defaultTelegram)(env,pdf,model);}catch(e){tg={sent:false,reason:String(e&&e.message||e).slice(0,120)};}
 if(mailErr&&!tg?.sent){try{await statement(env,'DELETE FROM installer_rate_limits WHERE key=?',onceKey).run();}catch{}return cors(request,{error:'No se pudo enviar el informe: '+String(mailErr&&mailErr.message||mailErr).slice(0,160),telegram:tg},mailErr&&mailErr.status||502);}
 return cors(request,{ok:true,sent:!mailErr,id,to:REPORT_TO,provider:'cloudflare-email-routing',message_id:mailErr?null:(mail||messageId),mail_error:mailErr?String(mailErr.message).slice(0,160):undefined,
  telegram:tg,ai:model.ai.model,pages:(new TextDecoder('latin1').decode(pdf).match(/\/Type \/Page /g)||[]).length,pdf_bytes:pdf.length,report_no:model.reportNo});
}
