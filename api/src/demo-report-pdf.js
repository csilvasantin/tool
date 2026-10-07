// Informe de incidencia con estética «mission report» (Carlos, 7-oct-2026: «que el informe parezca de la NASA»).
// PDF 1.4 escrito a mano, sin dependencias: Helvetica/Courier estándar, WinAnsi, varias páginas, banda de
// clasificación, cabecera de misión, tablas monoespaciadas de telemetría, cronología T+, indicador de SLA,
// bloque de firmas y numeración. Todo el contenido llega ya resuelto en `r` (ver buildReportModel).
// r3 (Carlos 21:39): vestido con la marca blanca del cliente (catálogo admiranext.com/marcablanca: colores, logo y
// tipografía; ninguna marca escrita aquí) y con fotos JPEG de la pantalla del gemelo (abierta / cerrada).
const WIN={'€':0x80,'‚':0x82,'„':0x84,'…':0x85,'‘':0x91,'’':0x92,'“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'™':0x99};
const SUB={'→':'->','←':'<-','≤':'<=','≥':'>=','✓':'OK','✔':'OK','✗':'X','×':'x','≈':'~','⚠':'!','▸':'>','▶':'>','·':'·'};
export function winAnsi(s){let out='';for(let ch of String(s??'').normalize('NFC')){if(SUB[ch]&&ch!=='·'){out+=winAnsi(SUB[ch]);continue;}let c=WIN[ch]??ch.codePointAt(0);if(c>255)continue;if(c<32){out+=' ';continue;}out+=(c>126||ch==='('||ch===')'||ch==='\\')?'\\'+c.toString(8).padStart(3,'0'):ch;}return out;}
const W=595,H=842,M=42;
// ── Color: 'r g b' (0-1) para el PDF, contraste WCAG para elegir textos legibles ─────────────────────────────
export const rgbOf=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(String(h||'').trim());if(!m)return null;const n=parseInt(m[1],16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255].map(v=>+v.toFixed(3)).join(' ');};
const nums=c=>String(c).split(' ').map(Number);
const lum=c=>{const [r,g,b]=nums(c).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*r+0.7152*g+0.0722*b;};
export const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
const mix=(a,b,k)=>{const p=nums(a),q=nums(b);return p.map((v,i)=>+(v+(q[i]-v)*k).toFixed(3)).join(' ');};
const pick=(bg,cands,min=4.5)=>{const list=cands.filter(Boolean);return list.find(c=>contrast(c,bg)>=min)||list.reduce((a,c)=>contrast(c,bg)>contrast(a,bg)?c:a,list[0]||'0 0 0');};
const WHITE='1 1 1',BLACK='0 0 0';
// Tema por defecto (Admira, «NASA»): el de r2.
const C={navy:'0.043 0.114 0.227',navy2:'0.09 0.18 0.33',red:'0.988 0.239 0.129',white:WHITE,ink:'0.08 0.09 0.12',grey:'0.42 0.45 0.5',light:'0.93 0.94 0.96',line:'0.75 0.78 0.83',green:'0.1 0.6 0.32',amber:'0.93 0.6 0.08',cyan:'0.55 0.85 1'};
export const ADMIRA_THEME=Object.freeze({id:'admira',name:'Admira',isAdmira:true,head:C.navy,head2:C.navy2,onHead:WHITE,onHead2:WHITE,headAccent:C.cyan,band:C.red,bandText:WHITE,sec:C.navy,secText:WHITE,secNum:C.cyan,tableHead:C.navy2,tableHeadText:WHITE,ink:C.ink,grey:C.grey,light:C.light,line:C.line,primary:C.navy,label:C.red,ok:C.green,warn:C.amber,err:C.red,okOnHead2:'0.35 0.95 0.55',errOnHead2:'1 0.45 0.35',titleFont:'F2',bodyFont:'F1',fonts:'Helvetica / Courier'});
// Familia CSS de la marca → fuente estándar del PDF más cercana (sin incrustar: Helvetica, Times o Courier).
export function pdfFontFor(family,weight=400){const f=String(family||'').toLowerCase(),bold=Number(weight)>=600;if(/\bmono|courier/.test(f)&&!/sans|serif/.test(f.replace(/monospace/,'')))return bold?'F4':'F3';if(/(^|[\s,'"])serif|georgia|times|garamond|fraunces|playfair|merriweather|lora/.test(f)&&!/^[^,]*sans/.test(f))return bold?'F5':'F6';return bold?'F2':'F1';}
const FONT_NAME={F1:'Helvetica',F2:'Helvetica-Bold',F3:'Courier',F4:'Courier-Bold',F5:'Times-Bold',F6:'Times-Roman'};
// Marca del catálogo (JSON de admiranext.com/marcablanca/api/marcas/<id>) → tema del informe. Paleta clara (papel).
export function themeFromBrand(b){
 const c=b&&b.colores&&(b.colores.claro||b.colores[b.modo]);const P=c&&rgbOf(c.primario);if(!P)return ADMIRA_THEME;
 const g=(k,d)=>rgbOf(c[k])||d;const bg=g('fondo',WHITE),head=g('secundario',P),onHead=g('secundarioTexto',pick(head,[WHITE,BLACK])),onHead2=g('primarioTexto',pick(P,[WHITE,BLACK])),acc=g('acento',null);
 const ok=g('ok',C.green),warn=g('aviso',C.amber),err=g('error',C.red),ink=g('texto',C.ink);
 const tf=b.tipografia||{};const titleFont=pdfFontFor(tf.titulos,tf.pesoTitulos||700),bodyFont=pdfFontFor(tf.texto,400);
 return {id:String(b.id||''),name:String(b.nombre||b.id||''),isAdmira:false,head,head2:P,onHead,onHead2,headAccent:pick(head,[acc,onHead],3),band:P,bandText:onHead2,sec:P,secText:onHead2,secNum:pick(P,[acc,onHead2],3),tableHead:head,tableHeadText:onHead,
  ink,grey:g('textoSuave',C.grey),light:g('fondoAlt',null)||g('superficieAlt',C.light),line:g('borde',C.line),primary:pick(bg,[P,ink],3),label:pick(bg,[P,ink],3),ok,warn,err,
  okOnHead2:pick(P,[ok,mix(ok,WHITE,0.55),WHITE],3),errOnHead2:pick(P,[err,mix(err,WHITE,0.55),WHITE],3),titleFont,bodyFont,fonts:[FONT_NAME[titleFont],FONT_NAME[bodyFont],'Courier'].join(' / ')+' (aprox. de '+String(tf.titulos||'').split(',')[0].replace(/['"]/g,'')+')'};
}
// JPEG: dimensiones y canales (SOF0-SOF15 salvo DHT/JPG/DAC). null si no es un JPEG utilizable.
export function jpegInfo(b){if(!(b instanceof Uint8Array)||b.length<4||b[0]!==0xFF||b[1]!==0xD8)return null;let i=2;while(i+9<b.length){if(b[i]!==0xFF){i++;continue;}const m=b[i+1];if(m===0xD8||m===0x01||(m>=0xD0&&m<=0xD7)){i+=2;continue;}const len=b[i+2]<<8|b[i+3];if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){const h=b[i+5]<<8|b[i+6],w=b[i+7]<<8|b[i+8],n=b[i+9];return w&&h&&(n===1||n===3)?{w,h,comps:n}:null;}if(m===0xDA)return null;i+=2+len;}return null;}
// Anchura aproximada (Helvetica ~0,53 em; Courier exacto 0,6 em) para partir líneas.
const width=(t,size,mono)=>String(t).length*size*(mono?0.6:0.53);
export function wrapText(text,size,maxW,mono=false){const out=[];for(const para of String(text??'').split(/\n/)){const words=para.split(/\s+/).filter(Boolean);let cur='';for(const w of words){const next=cur?cur+' '+w:w;if(width(next,size,mono)>maxW&&cur){out.push(cur);cur=w;}else cur=next;while(width(cur,size,mono)>maxW){const n=Math.max(1,Math.floor(maxW/(size*(mono?0.6:0.53))));out.push(cur.slice(0,n));cur=cur.slice(n);}}out.push(cur);}return out.length?out:[''];}
const isMono=f=>f==='F3'||f==='F4';
class Doc{
 constructor(r,T){this.r=r;this.T=T;this.pages=[];this.images=[];}
 page(){this.ops=[];this.pages.push(this.ops);return this;}
 text(x,y,size,font,t,rgb){this.ops.push(`BT ${rgb||this.T.ink} rg /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${winAnsi(t)}) Tj ET`);}
 right(x,y,size,font,t,rgb){this.text(x-width(t,size,isMono(font)),y,size,font,t,rgb);}
 center(x,y,size,font,t,rgb){this.text(x-width(t,size,isMono(font))/2,y,size,font,t,rgb);}
 rect(x,y,w,h,fill,stroke,lw=0.6){this.ops.push((fill?fill+' rg ':'')+(stroke?stroke+' RG '+lw+' w ':'')+`${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re `+(fill&&stroke?'B':fill?'f':'S'));}
 line(x1,y1,x2,y2,rgb,lw=0.6){this.ops.push(`${rgb||this.T.line} RG ${lw} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);}
 poly(points,rgb,lw){this.ops.push(`${rgb} RG ${lw} w 1 J `+points.map((p,i)=>`${p[0].toFixed(1)} ${p[1].toFixed(1)} ${i?'l':'m'}`).join(' ')+' S 0 J');}
 circle(cx,cy,r,fill){const k=0.5523*r;this.ops.push(`${fill} rg ${cx+r} ${cy} m ${cx+r} ${cy+k} ${cx+k} ${cy+r} ${cx} ${cy+r} c ${cx-k} ${cy+r} ${cx-r} ${cy+k} ${cx-r} ${cy} c ${cx-r} ${cy-k} ${cx-k} ${cy-r} ${cx} ${cy-r} c ${cx+k} ${cy-r} ${cx+r} ${cy-k} ${cx+r} ${cy} c f`);}
 // Imagen JPEG encajada (sin deformar) en la caja x,y,w,h; devuelve la caja real.
 image(img,x,y,w,h){if(!img)return null;let k=this.images.indexOf(img);if(k<0){this.images.push(img);k=this.images.length-1;}const s=Math.min(w/img.w,h/img.h),iw=img.w*s,ih=img.h*s,ix=x+(w-iw)/2,iy=y+(h-ih)/2;this.ops.push(`q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im${k} Do Q`);return {x:ix,y:iy,w:iw,h:ih};}
}
// Insignia de misión de Admira (sin marca blanca): disco, órbita y estela (al estilo «meatball», sin copiar el emblema).
function patch(d,cx,cy,r){d.circle(cx,cy,r,C.navy2);d.circle(cx,cy,r-2.2,C.navy);const orbit=[];for(let a=0;a<=360;a+=12){const t=a*Math.PI/180;orbit.push([cx+Math.cos(t)*r*0.82,cy+Math.sin(t)*r*0.32]);}d.poly(orbit,C.white,1);
 d.poly([[cx-r*0.78,cy-r*0.42],[cx-r*0.2,cy-r*0.05],[cx+r*0.25,cy+r*0.28],[cx+r*0.82,cy+r*0.52]],C.red,2.6);for(const [x,y] of [[-0.45,0.5],[0.5,-0.45],[0.15,0.62],[-0.6,-0.1]])d.circle(cx+x*r,cy+y*r,0.9,C.white);d.center(cx,cy-3,Math.max(5,r/4),'F2','ADMIRA',C.white);}
function band(d,y,label){d.rect(0,y,W,14,d.T.band);d.center(W/2,y+4,7.5,'F4',label,d.T.bandText);}
function sectionTitle(d,y,num,title){const T=d.T;d.rect(M,y-4,W-2*M,17,T.sec);d.text(M+6,y+1.5,9,'F4',num,T.secNum);d.text(M+28,y+1.5,9.5,T.titleFont,title.toUpperCase(),T.secText);return y-22;}
const tone=(T,t)=>t==='ok'?T.ok:t==='err'?T.err:t==='warn'?T.warn:t||T.ink;
// Tabla clave/valor monoespaciada; devuelve la nueva y. `ensure` pagina si no cabe.
function kvTable(d,y,rows,ensure,{keyW=150,size=8.2}={}){const T=d.T,valW=W-2*M-keyW-12;for(const [k,v,tn] of rows){const lines=wrapText(v??'—',size,valW,true),h=lines.length*(size+2.6)+5;y=ensure(y,h);d.rect(M,y-h+size+1,W-2*M,h,null,T.line,0.4);d.rect(M,y-h+size+1,keyW,h,T.light);d.text(M+5,y-1,size,'F4',String(k).toUpperCase(),T.grey);lines.forEach((l,i)=>d.text(M+keyW+6,y-1-i*(size+2.6),size,'F3',l,tone(T,tn)));y-=h;}return y-6;}
function gridTable(d,y,cols,rows,ensure,size=7.6){const T=d.T,total=W-2*M,widths=cols.map(c=>c.w*total);y=ensure(y,16);d.rect(M,y-4,total,13,T.tableHead);let x=M;cols.forEach((c,i)=>{d.text(x+4,y,size,'F4',c.label,T.tableHeadText);x+=widths[i];});y-=13;
 rows.forEach((row,ri)=>{const cells=row.map((v,i)=>wrapText(v??'—',size,widths[i]-8,true)),n=Math.max(...cells.map(c=>c.length)),h=n*(size+2.4)+4;y=ensure(y,h);if(ri%2===0)d.rect(M,y-h+size+0.5,total,h,T.light);let xx=M;cells.forEach((c,i)=>{c.forEach((l,j)=>d.text(xx+4,y-1-j*(size+2.4),size,'F3',l,row.tone&&i===row.toneCol?tone(T,row.tone):T.ink));xx+=widths[i];});y-=h;});return y-8;}
// Indicador semicircular: fracción del plazo de resolución consumida.
function gauge(d,cx,cy,r,frac,label,sub){const T=d.T,arc=(a0,a1)=>{const pts=[];for(let a=a0;a<=a1+0.001;a+=(a1-a0)/40||1)pts.push([cx+Math.cos(Math.PI-a*Math.PI)*r,cy+Math.sin(Math.PI-a*Math.PI)*r]);return pts;};
 d.poly(arc(0,1),T.line,9);const f=Math.max(0,Math.min(1,frac||0)),tn=f<=0.6?T.ok:f<=1?T.warn:T.err;if(f>0.005)d.poly(arc(0,f),tn,9);
 for(const t of [0,0.25,0.5,0.75,1]){const a=Math.PI-t*Math.PI;d.line(cx+Math.cos(a)*(r+6),cy+Math.sin(a)*(r+6),cx+Math.cos(a)*(r+10),cy+Math.sin(a)*(r+10),T.grey,0.8);}
 const a=Math.PI-Math.min(1.05,f)*Math.PI;d.line(cx,cy,cx+Math.cos(a)*(r-10),cy+Math.sin(a)*(r-10),T.ink,1.6);d.circle(cx,cy,3,T.ink);
 d.center(cx,cy-14,13,'F4',Math.round((frac||0)*100)+'%',tn);d.center(cx,cy-25,6.8,'F4',label,T.grey);if(sub)d.center(cx,cy-34,6.8,'F3',sub,T.grey);}
function footer(d,n,total,r){const T=d.T;d.line(M,34,W-M,34,T.line,0.5);d.text(M,23,6.8,'F3',(T.isAdmira?'ADMIRA · AdmiraNeXT':T.name+' · powered by Admira')+' · Yokup Mission Control · '+r.reportNo,T.grey);d.right(W-M,23,6.8,'F4',`PAG. ${n}/${total}`,T.grey);band(d,0,r.classification);}
function contHeader(d,r){const T=d.T;band(d,H-14,r.classification);d.rect(0,H-40,W,26,T.head);let x=M;if(d.r.images?.logo){d.rect(M,H-37,62,20,WHITE);d.image(d.r.images.logo,M+3,H-35,56,16);x=M+70;}d.text(x,H-31,9,'F4',r.id,T.onHead);d.text(x+80,H-31,8,T.titleFont,'INFORME DE MISIÓN · '+r.headline,T.onHead);d.right(W-M,H-31,7.5,'F3',r.generated,T.headAccent);}
// Tarjeta de marca en la cabecera: logo del catálogo (rasterizado a JPEG por el gemelo) o el nombre; Admira: insignia.
function brandCard(d,x,y,w,h){const T=d.T,img=d.r.images?.logo;d.rect(x,y,w,h,WHITE);d.rect(x,y,w,2.2,T.head2);if(img){d.image(img,x+6,y+5,w-12,h-10);return;}if(T.isAdmira){patch(d,x+h/2,y+h/2,h/2-4);d.text(x+h+2,y+h/2-4,12,'F2','ADMIRA',C.navy);return;}d.center(x+w/2,y+h/2-5,14,T.titleFont,(T.name||'').toUpperCase().slice(0,16),T.primary);}
// Evidencia visual: fotos de la pantalla en el gemelo (abierta / cerrada), con marco y rótulo de telemetría.
function photos(d,y,list,ensure){const T=d.T,n=list.length,gap=12,bw=n>1?(W-2*M-gap)/2:(W-2*M)*0.62,bh=Math.min(230,bw*1.05);y=ensure(y,bh+40);const top=y+4;
 list.forEach((p,i)=>{const x=n>1?M+i*(bw+gap):M+(W-2*M-bw)/2,by=top-bh;d.rect(x,by,bw,bh,BLACK);const box=d.image(p.img,x+2,by+2,bw-4,bh-4);d.rect(x,by,bw,bh,null,T.head,1);
  const tag=p.tag||'';d.rect(x,top-14,Math.min(bw,width(tag,7,true)+12),14,p.tone==='ok'?T.ok:T.err);d.text(x+6,top-10,7,'F4',tag,WHITE);
  wrapText(p.caption||'',6.8,bw,true).slice(0,4).forEach((l,j)=>d.text(x,by-10-j*8.5,6.8,'F3',l,T.grey));});
 return top-bh-62;}
export function renderMissionPdf(r){
 const T=r.theme||ADMIRA_THEME,d=new Doc(r,T);d.page();let sec=0;const num=()=>String(++sec).padStart(2,'0');
 // ── Página 1: cabecera de misión con la marca, estado, SLA y resumen ejecutivo ──────────────────────
 band(d,H-14,r.classification);d.rect(0,H-178,W,164,T.head);d.rect(0,H-178,W,3,T.head2);
 const bx=W-M-150;brandCard(d,M,H-66,140,40);
 d.text(M+152,H-38,6.8,'F4','YOKUP MISSION CONTROL',T.headAccent);d.text(M+152,H-48,6.8,'F3',T.isAdmira?'ADMIRA / ADMIRANEXT':'MARCA '+T.name.toUpperCase()+' · POWERED BY ADMIRA',T.onHead);d.text(M+152,H-58,6.8,'F3',T.isAdmira?'':'Tema de marca blanca · '+T.id,T.headAccent);
 d.text(M,H-86,14,T.titleFont,'INFORME DE MISIÓN · INCIDENCIA',T.onHead);
 d.text(M,H-116,30,'F4',r.id,T.onHead);{const maxW=bx-M-10;const h=wrapText(r.headline,9,maxW);d.text(M,H-133,9,T.bodyFont,h[0]+(h.length>1?'…':''),T.onHead);const l=wrapText(r.location.oneLine,7.6,maxW,true);d.text(M,H-146,7.6,'F3',l[0]+(l.length>1?'…':''),T.headAccent);}
 d.rect(bx,H-150,150,112,T.head2,T.headAccent,0.6);
 const onTone=t=>t==='ok'?T.okOnHead2:t==='err'?T.errOnHead2:T.onHead2;
 [['ESTADO',r.status,r.statusTone],['SEVERIDAD',r.severity,null],['SLA',r.slaVerdict,r.slaTone],['DURACIÓN',r.duration,null],['INFORME',r.reportNo,null]].forEach(([k,v,tn],i)=>{d.text(bx+8,H-54-i*20,6.5,'F4',k,pick(T.head2,[T.secNum,T.onHead2],3));d.text(bx+8,H-63-i*20,8.4,'F4',v,onTone(tn));});
 d.text(M,H-170,7,'F3','T0 '+r.t0+'   ·   T-FIN '+r.tEnd+'   ·   GENERADO '+r.generated,T.onHead);
 let y=H-200;
 d.rect(M,y-96,W-2*M,100,null,T.line,0.5);
 const kpis=[['FALLOS HISTÓRICO',r.asset.failuresAll],['FALLOS 90 DÍAS',r.asset.failures90],['MTBF',r.asset.mtbf],['GARANTÍA',r.asset.warrantyShort]];
 kpis.forEach(([k,v],i)=>{const x=M+10+i*92;d.text(x,y-14,6.5,'F4',k,T.grey);d.text(x,y-32,13,'F4',String(v),T.primary);});
 d.text(M+10,y-56,7,'F3','idIoT '+r.asset.idIoT,T.ink);d.text(M+10,y-68,7,'F3','ITIL  '+r.asset.itil+' · '+r.asset.model,T.ink);d.text(M+10,y-80,6.6,'F3',r.asset.source,T.grey);
 gauge(d,W-M-62,y-52,38,r.slaFraction,'PLAZO DE RESOLUCIÓN USADO',r.slaSub);
 y-=116;
 y=sectionTitle(d,y,num(),'Resumen ejecutivo · '+r.ai.label);
 const para=(t,size=9,font=T.bodyFont,tn=T.ink,indent=0)=>{for(const l of wrapText(t,size,W-2*M-12-indent)){if(y<70)return;d.text(M+6+indent,y,size,font,l,tn);y-=size+3.2;}};
 para(r.ai.summary,9.2);y-=6;d.text(M+6,y,7.5,'F4','CAUSA RAÍZ',T.label);y-=12;para(r.ai.rootCause,8.8);y-=6;d.text(M+6,y,7.5,'F4','RECOMENDACIONES',T.label);y-=12;
 r.ai.recommendations.forEach((rec,i)=>{if(y<70)return;d.text(M+6,y,8.5,'F4',String(i+1).padStart(2,'0'),T.primary);const save=y;para(rec,8.6,T.bodyFont,T.ink,18);if(y===save)y-=12;y-=2;});
 if(y>84){y-=4;d.text(M+6,y,7,'F3','Riesgo de recurrencia: '+r.ai.risk+' · '+r.ai.note,T.grey);y-=18;}
 // ── Páginas siguientes: datos con paginación automática ───────────────────────────────────
 const next=()=>{d.page();contHeader(d,r);return H-62;};
 const ensure=(yy,h)=>yy-h<52?next():yy;
 y=ensure(y,90);y=sectionTitle(d,y,num(),'Incidencia');y=kvTable(d,y,r.incident,ensure);
 y=next();
 const shots=(r.photos||[]).filter(p=>p&&p.img);
 if(shots.length){y=sectionTitle(d,y,num(),'Evidencia visual · pantalla en el gemelo digital');y=photos(d,y,shots,ensure);}
 y=ensure(y,60);y=sectionTitle(d,y,num(),'Proyecto');y=kvTable(d,y,r.project,ensure);
 y=ensure(y,60);y=sectionTitle(d,y,num(),'Ubicación');y=kvTable(d,y,r.location.rows,ensure);
 y=ensure(y,60);y=sectionTitle(d,y,num(),'Activo · pantalla');y=kvTable(d,y,r.asset.rows,ensure);
 y=ensure(y,60);d.text(M,y,7.5,'F4','ÚLTIMAS INCIDENCIAS DE ESTE ACTIVO (YOKUP)',T.primary);y-=12;
 y=gridTable(d,y,[{label:'ID',w:0.14},{label:'FECHA',w:0.19},{label:'MOTIVO',w:0.41},{label:'DURACIÓN',w:0.14},{label:'ESTADO',w:0.12}],r.asset.history.length?r.asset.history:[['—','—','Sin incidencias previas registradas','—','—']],ensure);
 y=ensure(y,200);y=sectionTitle(d,y,num(),'Telemetría · cronología de la misión');
 y=gridTable(d,y,[{label:'T+',w:0.13},{label:'HORA (MADRID)',w:0.2},{label:'EVENTO',w:0.2},{label:'DETALLE',w:0.47}],r.timeline,ensure);
 if(r.console.length){y=ensure(y,40);d.text(M,y,7.5,'F4','REGISTRO DE LA CONSOLA DEL GEMELO (HORA LOCAL)',T.primary);y-=12;y=gridTable(d,y,[{label:'HORA',w:0.13},{label:'PASO',w:0.87}],r.console,ensure,7.2);}
 y=ensure(y,118);y=sectionTitle(d,y,num(),'Validación y firmas');
 const boxW=(W-2*M-16)/3;r.signoff.forEach(([role,who,when],i)=>{const x=M+i*(boxW+8);d.rect(x,y-78,boxW,82,null,T.head,0.8);d.text(x+6,y-8,6.8,'F4',role,T.grey);wrapText(who,8,boxW-12).slice(0,3).forEach((l,j)=>d.text(x+6,y-22-j*10,8,T.titleFont,l,T.ink));d.line(x+6,y-58,x+boxW-6,y-58,T.grey,0.5);d.text(x+6,y-68,6.6,'F3',when,T.grey);});
 y-=92;y=ensure(y,30);wrapText(r.disclaimer,6.8,W-2*M,true).forEach(l=>{d.text(M,y,6.8,'F3',l,T.grey);y-=9;});
 const total=d.pages.length;d.pages.forEach((ops,i)=>{d.ops=ops;footer(d,i+1,total,r);});
 return pdfBytes(d,r);
}
const bin=b=>{let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return s;};
function pdfBytes(d,r){
 const pages=d.pages,imgs=d.images,fonts='<< '+Object.keys(FONT_NAME).map((k,i)=>`/${k} ${3+i} 0 R`).join(' ')+' >>',objs=[];
 objs[0]='<< /Type /Catalog /Pages 2 0 R >>';
 const base=10,kids=pages.map((_,i)=>`${base+i*2} 0 R`).join(' '),imgBase=base+pages.length*2;
 objs[1]=`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
 Object.values(FONT_NAME).forEach((n,i)=>{objs[2+i]=`<< /Type /Font /Subtype /Type1 /BaseFont /${n} /Encoding /WinAnsiEncoding >>`;});
 objs[8]=`<< /Title (${winAnsi('Informe de misión '+r.id)}) /Author (Yokup Mission Control) /Producer (Yokup · Admira) /Subject (${winAnsi(r.headline)}) >>`;
 const xo=imgs.length?' /XObject << '+imgs.map((_,k)=>`/Im${k} ${imgBase+k} 0 R`).join(' ')+' >>':'';
 pages.forEach((ops,i)=>{const content=ops.join('\n');objs[base-1+i*2]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font ${fonts}${xo} >> /Contents ${base+i*2+1} 0 R >>`;objs[base+i*2]=`<< /Length ${content.length} >>\nstream\n${content}\nendstream`;});
 imgs.forEach((im,k)=>{objs[imgBase-1+k]=`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /${im.comps===1?'DeviceGray':'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n${bin(im.data)}\nendstream`;});
 let pdf='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets=[];objs.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=pdf.length;pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 const bytes=new Uint8Array(pdf.length);for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;return bytes;
}
