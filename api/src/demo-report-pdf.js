// Informe de incidencia con estética «mission report» (Carlos, 7-oct-2026: «que el informe parezca de la NASA»).
// PDF 1.4 escrito a mano, sin dependencias: Helvetica/Courier estándar, WinAnsi, varias páginas, banda de
// clasificación, cabecera de misión, tablas monoespaciadas de telemetría, cronología T+, indicador de SLA,
// bloque de firmas y numeración. Todo el contenido llega ya resuelto en `r` (ver buildReportModel).
const WIN={'€':0x80,'‚':0x82,'„':0x84,'…':0x85,'‘':0x91,'’':0x92,'“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'™':0x99};
const SUB={'→':'->','←':'<-','≤':'<=','≥':'>=','✓':'OK','✔':'OK','✗':'X','×':'x','≈':'~','⚠':'!','▸':'>','▶':'>','·':'·'};
export function winAnsi(s){let out='';for(let ch of String(s??'').normalize('NFC')){if(SUB[ch]&&ch!=='·'){out+=winAnsi(SUB[ch]);continue;}let c=WIN[ch]??ch.codePointAt(0);if(c>255)continue;if(c<32){out+=' ';continue;}out+=(c>126||ch==='('||ch===')'||ch==='\\')?'\\'+c.toString(8).padStart(3,'0'):ch;}return out;}
const W=595,H=842,M=42;
const C={navy:'0.043 0.114 0.227',navy2:'0.09 0.18 0.33',red:'0.988 0.239 0.129',white:'1 1 1',ink:'0.08 0.09 0.12',grey:'0.42 0.45 0.5',light:'0.93 0.94 0.96',line:'0.75 0.78 0.83',green:'0.1 0.6 0.32',amber:'0.93 0.6 0.08',cyan:'0.55 0.85 1'};
// Anchura aproximada (Helvetica ~0,53 em; Courier exacto 0,6 em) para partir líneas.
const width=(t,size,mono)=>String(t).length*size*(mono?0.6:0.53);
export function wrapText(text,size,maxW,mono=false){const out=[];for(const para of String(text??'').split(/\n/)){const words=para.split(/\s+/).filter(Boolean);let cur='';for(const w of words){const next=cur?cur+' '+w:w;if(width(next,size,mono)>maxW&&cur){out.push(cur);cur=w;}else cur=next;while(width(cur,size,mono)>maxW){const n=Math.max(1,Math.floor(maxW/(size*(mono?0.6:0.53))));out.push(cur.slice(0,n));cur=cur.slice(n);}}out.push(cur);}return out.length?out:[''];}
class Doc{
 constructor(r){this.r=r;this.pages=[];}
 page(){this.ops=[];this.pages.push(this.ops);return this;}
 text(x,y,size,font,t,rgb=C.ink){this.ops.push(`BT ${rgb} rg /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${winAnsi(t)}) Tj ET`);}
 right(x,y,size,font,t,rgb){this.text(x-width(t,size,font[0]==='C'),y,size,font,t,rgb);}
 center(x,y,size,font,t,rgb){this.text(x-width(t,size,font[0]==='C')/2,y,size,font,t,rgb);}
 rect(x,y,w,h,fill,stroke,lw=0.6){this.ops.push((fill?fill+' rg ':'')+(stroke?stroke+' RG '+lw+' w ':'')+`${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re `+(fill&&stroke?'B':fill?'f':'S'));}
 line(x1,y1,x2,y2,rgb=C.line,lw=0.6){this.ops.push(`${rgb} RG ${lw} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);}
 poly(points,rgb,lw){this.ops.push(`${rgb} RG ${lw} w 1 J `+points.map((p,i)=>`${p[0].toFixed(1)} ${p[1].toFixed(1)} ${i?'l':'m'}`).join(' ')+' S 0 J');}
 circle(cx,cy,r,fill){const k=0.5523*r;this.ops.push(`${fill} rg ${cx+r} ${cy} m ${cx+r} ${cy+k} ${cx+k} ${cy+r} ${cx} ${cy+r} c ${cx-k} ${cy+r} ${cx-r} ${cy+k} ${cx-r} ${cy} c ${cx-r} ${cy-k} ${cx-k} ${cy-r} ${cx} ${cy-r} c ${cx+k} ${cy-r} ${cx+r} ${cy-k} ${cx+r} ${cy} c f`);}
}
// Insignia de misión: disco azul, órbita blanca y estela roja (al estilo «meatball», sin copiar el emblema).
function patch(d,cx,cy,r){d.circle(cx,cy,r,C.navy2);d.circle(cx,cy,r-2.2,C.navy);const orbit=[];for(let a=0;a<=360;a+=12){const t=a*Math.PI/180;orbit.push([cx+Math.cos(t)*r*0.82,cy+Math.sin(t)*r*0.32]);}d.poly(orbit,C.white,1);
 d.poly([[cx-r*0.78,cy-r*0.42],[cx-r*0.2,cy-r*0.05],[cx+r*0.25,cy+r*0.28],[cx+r*0.82,cy+r*0.52]],C.red,2.6);for(const [x,y] of [[-0.45,0.5],[0.5,-0.45],[0.15,0.62],[-0.6,-0.1]])d.circle(cx+x*r,cy+y*r,0.9,C.white);d.center(cx,cy-3,8,'F2','ADMIRA',C.white);}
function band(d,y,label){d.rect(0,y,W,14,C.red);d.center(W/2,y+4,7.5,'F4',label,C.white);}
function sectionTitle(d,y,num,title){d.rect(M,y-4,W-2*M,17,C.navy);d.text(M+6,y+1.5,9,'F4',num,C.cyan);d.text(M+28,y+1.5,9.5,'F2',title.toUpperCase(),C.white);return y-22;}
// Tabla clave/valor monoespaciada; devuelve la nueva y. `ensure` pagina si no cabe.
function kvTable(d,y,rows,ensure,{keyW=150,size=8.2}={}){const valW=W-2*M-keyW-12;for(const [k,v,tone] of rows){const lines=wrapText(v??'—',size,valW,true),h=lines.length*(size+2.6)+5;y=ensure(y,h);d.rect(M,y-h+size+1,W-2*M,h,null,C.line,0.4);d.rect(M,y-h+size+1,keyW,h,C.light);d.text(M+5,y-1,size,'F4',String(k).toUpperCase(),C.grey);lines.forEach((l,i)=>d.text(M+keyW+6,y-1-i*(size+2.6),size,'F3',l,tone||C.ink));y-=h;}return y-6;}
function gridTable(d,y,cols,rows,ensure,size=7.6){const total=W-2*M,widths=cols.map(c=>c.w*total);y=ensure(y,16);d.rect(M,y-4,total,13,C.navy2);let x=M;cols.forEach((c,i)=>{d.text(x+4,y,size,'F4',c.label,C.white);x+=widths[i];});y-=13;
 rows.forEach((row,ri)=>{const cells=row.map((v,i)=>wrapText(v??'—',size,widths[i]-8,true)),n=Math.max(...cells.map(c=>c.length)),h=n*(size+2.4)+4;y=ensure(y,h);if(ri%2===0)d.rect(M,y-h+size+0.5,total,h,C.light);let xx=M;cells.forEach((c,i)=>{c.forEach((l,j)=>d.text(xx+4,y-1-j*(size+2.4),size,'F3',l,row.tone&&i===row.toneCol?row.tone:C.ink));xx+=widths[i];});y-=h;});return y-8;}
// Indicador semicircular: fracción del plazo de resolución consumida.
function gauge(d,cx,cy,r,frac,label,sub){const arc=(a0,a1)=>{const pts=[];for(let a=a0;a<=a1+0.001;a+=(a1-a0)/40||1)pts.push([cx+Math.cos(Math.PI-a*Math.PI)*r,cy+Math.sin(Math.PI-a*Math.PI)*r]);return pts;};
 d.poly(arc(0,1),C.line,9);const f=Math.max(0,Math.min(1,frac||0)),tone=f<=0.6?C.green:f<=1?C.amber:C.red;if(f>0.005)d.poly(arc(0,f),tone,9);
 for(const t of [0,0.25,0.5,0.75,1]){const a=Math.PI-t*Math.PI;d.line(cx+Math.cos(a)*(r+6),cy+Math.sin(a)*(r+6),cx+Math.cos(a)*(r+10),cy+Math.sin(a)*(r+10),C.grey,0.8);}
 const a=Math.PI-Math.min(1.05,f)*Math.PI;d.line(cx,cy,cx+Math.cos(a)*(r-10),cy+Math.sin(a)*(r-10),C.ink,1.6);d.circle(cx,cy,3,C.ink);
 d.center(cx,cy-14,13,'F4',Math.round((frac||0)*100)+'%',tone);d.center(cx,cy-25,6.8,'F4',label,C.grey);if(sub)d.center(cx,cy-34,6.8,'F3',sub,C.grey);}
function footer(d,n,total,r){d.line(M,34,W-M,34,C.line,0.5);d.text(M,23,6.8,'F3','ADMIRA · AdmiraNeXT · Yokup Mission Control · '+r.reportNo,C.grey);d.right(W-M,23,6.8,'F4',`PAG. ${n}/${total}`,C.grey);band(d,0,r.classification);}
function contHeader(d,r){band(d,H-14,r.classification);d.rect(0,H-40,W,26,C.navy);d.text(M,H-31,9,'F4',r.id,C.white);d.text(M+80,H-31,8,'F2','INFORME DE MISIÓN · '+r.headline,C.white);d.right(W-M,H-31,7.5,'F3',r.generated,C.cyan);}
export function renderMissionPdf(r){
 const d=new Doc(r);d.page();
 // ── Página 1: cabecera de misión, estado, SLA y resumen ejecutivo ─────────────────────────
 band(d,H-14,r.classification);d.rect(0,H-178,W,164,C.navy);patch(d,M+34,H-74,32);
 const bx=W-M-150;d.text(M+80,H-44,8,'F4','YOKUP MISSION CONTROL · ADMIRA / ADMIRANEXT',C.cyan);d.text(M+80,H-64,15,'F2','INFORME DE MISIÓN · INCIDENCIA',C.white);
 d.text(M+80,H-96,30,'F4',r.id,C.white);d.text(M+80,H-114,9,'F1',r.headline,C.white);{const maxW=bx-(M+80)-10,l=wrapText(r.location.oneLine,8,maxW,true);d.text(M+80,H-128,8,'F3',l[0]+(l.length>1?'…':''),C.cyan);}
 d.rect(bx,H-150,150,112,C.navy2,C.cyan,0.6);
 [['ESTADO',r.status,r.statusTone],['SEVERIDAD',r.severity,null],['SLA',r.slaVerdict,r.slaTone],['DURACIÓN',r.duration,null],['INFORME',r.reportNo,null]].forEach(([k,v,tone],i)=>{d.text(bx+8,H-54-i*20,6.5,'F4',k,C.cyan);d.text(bx+8,H-63-i*20,8.4,'F4',v,tone||C.white);});
 d.text(M,H-170,7,'F3','T0 '+r.t0+'   ·   T-FIN '+r.tEnd+'   ·   GENERADO '+r.generated,C.white);
 let y=H-200;
 // Telemetría clave + indicador SLA
 d.rect(M,y-96,W-2*M,100,null,C.line,0.5);
 const kpis=[['FALLOS HISTÓRICO',r.asset.failuresAll],['FALLOS 90 DÍAS',r.asset.failures90],['MTBF',r.asset.mtbf],['GARANTÍA',r.asset.warrantyShort]];
 kpis.forEach(([k,v],i)=>{const x=M+10+i*92;d.text(x,y-14,6.5,'F4',k,C.grey);d.text(x,y-32,13,'F4',String(v),C.navy);});
 d.text(M+10,y-56,7,'F3','idIoT '+r.asset.idIoT,C.ink);d.text(M+10,y-68,7,'F3','ITIL  '+r.asset.itil+' · '+r.asset.model,C.ink);d.text(M+10,y-80,6.6,'F3',r.asset.source,C.grey);
 gauge(d,W-M-62,y-52,38,r.slaFraction,'PLAZO DE RESOLUCIÓN USADO',r.slaSub);
 y-=116;
 y=sectionTitle(d,y,'01','Resumen ejecutivo · '+r.ai.label);
 const para=(t,size=9,font='F1',tone=C.ink,indent=0)=>{for(const l of wrapText(t,size,W-2*M-12-indent)){if(y<70)return;d.text(M+6+indent,y,size,font,l,tone);y-=size+3.2;}};
 para(r.ai.summary,9.2);y-=6;d.text(M+6,y,7.5,'F4','CAUSA RAÍZ',C.red);y-=12;para(r.ai.rootCause,8.8);y-=6;d.text(M+6,y,7.5,'F4','RECOMENDACIONES',C.red);y-=12;
 r.ai.recommendations.forEach((rec,i)=>{if(y<70)return;d.text(M+6,y,8.5,'F4',String(i+1).padStart(2,'0'),C.navy);const save=y;para(rec,8.6,'F1',C.ink,18);if(y===save)y-=12;y-=2;});
 if(y>84){y-=4;d.text(M+6,y,7,'F3','Riesgo de recurrencia: '+r.ai.risk+' · '+r.ai.note,C.grey);y-=18;}
 // ── Páginas siguientes: datos con paginación automática ───────────────────────────────────
 const next=()=>{d.page();contHeader(d,r);return H-62;};
 const ensure=(yy,h)=>yy-h<52?next():yy;
 y=ensure(y,90);y=sectionTitle(d,y,'02','Incidencia');y=kvTable(d,y,r.incident,ensure);
 y=next();
 y=sectionTitle(d,y,'03','Proyecto');y=kvTable(d,y,r.project,ensure);
 y=ensure(y,60);y=sectionTitle(d,y,'04','Ubicación');y=kvTable(d,y,r.location.rows,ensure);
 y=ensure(y,60);y=sectionTitle(d,y,'05','Activo · pantalla');y=kvTable(d,y,r.asset.rows,ensure);
 y=ensure(y,60);d.text(M,y,7.5,'F4','ÚLTIMAS INCIDENCIAS DE ESTE ACTIVO (YOKUP)',C.navy);y-=12;
 y=gridTable(d,y,[{label:'ID',w:0.14},{label:'FECHA',w:0.19},{label:'MOTIVO',w:0.41},{label:'DURACIÓN',w:0.14},{label:'ESTADO',w:0.12}],r.asset.history.length?r.asset.history:[['—','—','Sin incidencias previas registradas','—','—']],ensure);
 y=ensure(y,200);y=sectionTitle(d,y,'06','Telemetría · cronología de la misión');
 y=gridTable(d,y,[{label:'T+',w:0.13},{label:'HORA (MADRID)',w:0.2},{label:'EVENTO',w:0.2},{label:'DETALLE',w:0.47}],r.timeline,ensure);
 if(r.console.length){y=ensure(y,40);d.text(M,y,7.5,'F4','REGISTRO DE LA CONSOLA DEL GEMELO (HORA LOCAL)',C.navy);y-=12;y=gridTable(d,y,[{label:'HORA',w:0.13},{label:'PASO',w:0.87}],r.console,ensure,7.2);}
 // Firmas
 y=ensure(y,118);y=sectionTitle(d,y,'07','Validación y firmas');
 const boxW=(W-2*M-16)/3;r.signoff.forEach(([role,who,when],i)=>{const x=M+i*(boxW+8);d.rect(x,y-78,boxW,82,null,C.navy,0.8);d.text(x+6,y-8,6.8,'F4',role,C.grey);wrapText(who,8,boxW-12).slice(0,3).forEach((l,j)=>d.text(x+6,y-22-j*10,8,'F2',l,C.ink));d.line(x+6,y-58,x+boxW-6,y-58,C.grey,0.5);d.text(x+6,y-68,6.6,'F3',when,C.grey);});
 y-=92;y=ensure(y,30);wrapText(r.disclaimer,6.8,W-2*M,true).forEach(l=>{d.text(M,y,6.8,'F3',l,C.grey);y-=9;});
 const total=d.pages.length;d.pages.forEach((ops,i)=>{d.ops=ops;footer(d,i+1,total,r);});
 return pdfBytes(d.pages,r);
}
function pdfBytes(pages,r){
 const fonts='<< /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>',objs=[];
 objs[0]='<< /Type /Catalog /Pages 2 0 R >>';
 const base=8,kids=pages.map((_,i)=>`${base+i*2} 0 R`).join(' ');
 objs[1]=`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
 objs[2]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
 objs[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
 objs[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
 objs[5]='<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>';
 objs[6]=`<< /Title (${winAnsi('Informe de misión '+r.id)}) /Author (Yokup Mission Control) /Producer (Yokup · Admira) /Subject (${winAnsi(r.headline)}) >>`;
 pages.forEach((ops,i)=>{const content=ops.join('\n');objs[base-1+i*2]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font ${fonts} >> /Contents ${base+i*2+1} 0 R >>`;objs[base+i*2]=`<< /Length ${content.length} >>\nstream\n${content}\nendstream`;});
 let pdf='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets=[];objs.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=pdf.length;pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 const bytes=new Uint8Array(pdf.length);for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;return bytes;
}
