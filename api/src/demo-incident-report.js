// Informe PDF de una incidencia DEMO del gemelo (Carlos, 7-oct-2026 · /cerrar incidencia en el modo
// experto de admira.store). Seguridad: el destinatario NO viene del cliente —lo fija el binding
// send_email de wrangler.toml (destination_address) y aquí también—, sólo incidencias demo de la
// tienda Starbucks abiertas por la CLI (`…:manual:cli-…`) y ya CERRADAS, una vez por incidencia y
// como mucho 10 informes por hora en total. No es un relay: sin destinatario, asunto ni cuerpo libres.
import {rateLimit,statement} from './installer-portal.js';
export const REPORT_TO='csilvasantin@gmail.com',REPORT_FROM='incidencias@admira.live',REPORT_FROM_NAME='Admira · Incidencias demo';
export const REPORT_ORIGINS=new Set(['https://www.admira.store','https://admira.store','https://www.xpaceos.com','https://xpaceos.com']);
export const REPORT_HOURLY=10;
const STORE_PREFIX='demo:starbucks-alsea-paseo-de-gracia:';
const ID_RE=/^[A-Z]{3}-[A-Z0-9]{4,10}$/;
function cors(request,body,status=200){const origin=request.headers.get('origin')||'';const h={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};if(REPORT_ORIGINS.has(origin)){h['access-control-allow-origin']=origin;h['access-control-allow-methods']='POST, OPTIONS';h['access-control-allow-headers']='content-type';h['access-control-max-age']='600';}return new Response(JSON.stringify(body),{status,headers:h});}
const fmt=(ms)=>ms?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(ms)):'—';
const dur=(ms)=>{if(!(ms>0))return '—';const s=Math.round(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return (h?h+' h ':'')+(h||m?m+' min ':'')+r+' s';};
export function equipoLabel(resource){const m=/^demo:[^:]+:(pantalla-(\d)|tpv|PDG103-IPAD-01)/.exec(String(resource||''));return !m?'—':m[2]?'Pantalla '+m[2]+' (vertical del lineal)':m[1];}
export function causeFromSubject(subject){const parts=String(subject||'').split(' · ');return parts.length>=3?parts.slice(2).join(' · '):String(subject||'');}
export function reportRows(inc,now=Date.now()){
 const sla=inc.sla||{},opened=inc.created_at,closed=inc.resolved_at;
 return [['Incidencia',inc.id],['Tienda','Starbucks Alsea · Paseo de Gracia 103 (Barcelona)'],['Equipo',equipoLabel(inc.resource)],['Recurso',inc.resource],['Motivo',causeFromSubject(inc.subject)],['Prioridad',String(inc.priority||'').toUpperCase()],['Técnico asignado',inc.assignee||'—'],['Abierta',fmt(opened)],['Primera respuesta',fmt(sla.responded_at)],['Cerrada',fmt(closed)],['Duración',dur(closed-opened)],['SLA respuesta',(sla.response_min?'≤ '+sla.response_min+' min · ':'')+(sla.response_ok===false?'FUERA de SLA':'en SLA ✓')],['SLA resolución',(sla.resolution_min?'≤ '+Math.round(sla.resolution_min/60)+' h · ':'')+(sla.resolution_ok===false?'FUERA de SLA':'en SLA ✓')],['Cerrada por',inc.closed_by||'—'],['Nota de resolución',inc.resolution||'—'],['Estado en admira.app','Finalizada'],['Ficha','https://www.admira.app/ticket?id='+inc.id],['Informe generado',fmt(now)]];
}
// ── PDF mínimo (Helvetica, WinAnsi), sin dependencias ─────────────────────────────────
const WIN={'€':0x80,'‚':0x82,'„':0x84,'…':0x85,'‘':0x91,'’':0x92,'“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'™':0x99};
function winAnsi(s){let out='';for(const ch of String(s).normalize('NFC')){let c=ch.codePointAt(0);if(WIN[ch])c=WIN[ch];else if(ch==='✓'){continue;}else if(ch==='≤')c=null;if(c===null){out+='<=';continue;}if(c>255){out+='?';continue;}out+=(c<32||c>126||ch==='('||ch===')'||ch==='\\')?'\\'+c.toString(8).padStart(3,'0'):ch;}return out;}
function wrap(text,max){const words=String(text).split(/\s+/),lines=[];let cur='';for(const w of words){if((cur+' '+w).trim().length>max){if(cur)lines.push(cur);cur=w.length>max?w.slice(0,max):w;}else cur=(cur+' '+w).trim();}if(cur)lines.push(cur);return lines.length?lines:[''];}
export function buildReportPdf(inc,{timeline=[],now=Date.now()}={}){
 const ops=[];let y=800;const T=(x,yy,size,font,txt,rgb='0 0 0')=>ops.push(`BT ${rgb} rg /${font} ${size} Tf ${x} ${yy} Td (${winAnsi(txt)}) Tj ET`);
 ops.push('0.05 0.3 0.17 rg 0 770 595 72 re f');T(40,812,18,'F2','Informe de incidencia · '+inc.id,'1 1 1');T(40,790,10,'F1','Admira · gemelo digital Starbucks · cierre desde admira.store (modo experto) y admira.app','0.85 1 0.9');
 y=745;T(40,y,12,'F2',inc.stage==='cerrada'?'CERRADA · Finalizada en admira.app':'Estado: '+inc.stage,'0.05 0.45 0.2');y-=22;
 for(const [k,v] of reportRows(inc,now)){const lines=wrap(v,62);T(40,y,10,'F2',k);lines.forEach((l,i)=>T(175,y-i*13,10,'F1',l));y-=13*lines.length+5;}
 const steps=(Array.isArray(timeline)?timeline:[]).slice(0,12);
 if(steps.length){y-=8;T(40,y,12,'F2','Cronología de la demo');y-=18;for(const s of steps){const lines=wrap(String(s.text||'').slice(0,160),78);T(40,y,9,'F2',String(s.at||'').slice(0,8));lines.forEach((l,i)=>T(95,y-i*12,9,'F1',l));y-=12*lines.length+3;if(y<70)break;}}
 ops.push('0.6 0.6 0.6 RG 40 50 m 555 50 l S');T(40,36,8,'F1','Incidencia de demostración (recurso demo:) · enviado sólo a '+REPORT_TO+' · Yokup / admira.app','0.4 0.4 0.4');
 const content=ops.join('\n');
 const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,`<< /Title (${winAnsi('Informe '+inc.id)}) /Producer (Yokup) >>`];
 let pdf='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets=[];objs.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=pdf.length;pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 const bytes=new Uint8Array(pdf.length);for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;return bytes;
}
const b64=(bytes)=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
const b64text=(t)=>b64(new TextEncoder().encode(t));
const encWord=(t)=>'=?UTF-8?B?'+b64text(t)+'?=';
export function buildMime(inc,pdf,{now=Date.now(),messageId}={}){
 const boundary='yk-'+crypto.randomUUID(),rows=reportRows(inc,now);
 const text='Informe de la incidencia demo '+inc.id+' (cerrada desde el modo experto de admira.store).\n\n'+rows.map(([k,v])=>k+': '+v).join('\n')+'\n\nAdjunto: informe en PDF.\n';
 const lines=['From: '+encWord(REPORT_FROM_NAME)+' <'+REPORT_FROM+'>','To: <'+REPORT_TO+'>','Subject: '+encWord('Informe incidencia '+inc.id+' · '+equipoLabel(inc.resource)+' · cerrada'),'Message-ID: '+messageId,'Date: '+new Date(now).toUTCString(),'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64text(text).replace(/.{76}/g,'$&\r\n'),'--'+boundary,'Content-Type: application/pdf; name="informe-'+inc.id+'.pdf"','Content-Disposition: attachment; filename="informe-'+inc.id+'.pdf"','Content-Transfer-Encoding: base64','',b64(pdf).replace(/.{76}/g,'$&\r\n'),'--'+boundary+'--',''];
 return lines.join('\r\n');
}
async function defaultSend(env,raw){
 if(!env.INCIDENT_MAIL||typeof env.INCIDENT_MAIL.send!=='function'){const e=Error('El envío de correo no está configurado (binding INCIDENT_MAIL).');e.status=503;throw e;}
 const {EmailMessage}=await import('cloudflare:email');
 const out=await env.INCIDENT_MAIL.send(new EmailMessage(REPORT_FROM,REPORT_TO,raw));
 return out&&out.messageId||null;
}
async function fetchIncident(env,id){
 const url='https://api.yokup.com/incident/status?ids='+encodeURIComponent(id);
 const r=env.RTC&&typeof env.RTC.fetch==='function'?await env.RTC.fetch(new Request(url)):await (env.REPORT_FETCH||fetch)(url);
 const d=await r.json().catch(()=>({}));return (d.incidents||[]).find(i=>i.id===id)||null;
}
export function cleanTimeline(list){return (Array.isArray(list)?list:[]).slice(0,12).map(s=>({at:String(s&&s.at||'').replace(/[^\d:]/g,'').slice(0,8),text:String(s&&s.text||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,160)})).filter(s=>s.text.trim());}
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
 try{await limiter(env,onceKey,1,7*86400000);}catch(e){return cors(request,{error:'El informe de esta incidencia ya se envió.',already:true,to:REPORT_TO},409);}
 const pdf=buildReportPdf(inc,{timeline:cleanTimeline(b.timeline),now});
 const messageId='<informe-'+id.toLowerCase()+'-'+now+'@admira.live>';
 try{const providerId=await (deps.send||defaultSend)(env,buildMime(inc,pdf,{now,messageId}));
  return cors(request,{ok:true,sent:true,id,to:REPORT_TO,provider:'cloudflare-email-routing',message_id:providerId||messageId,pdf_bytes:pdf.length});}
 catch(e){try{await statement(env,'DELETE FROM installer_rate_limits WHERE key=?',onceKey).run();}catch{}console.error('demo_incident_report_failed',e&&e.message);return cors(request,{error:'No se pudo enviar el informe: '+String(e&&e.message||e).slice(0,160)},e&&e.status||502);}
}
