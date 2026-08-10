import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./objetivos.html', import.meta.url), 'utf8');

function functionSource(name) {
  const start=source.indexOf(`function ${name}(`),brace=source.indexOf('{',start);
  assert.notEqual(start,-1,`falta ${name}`);
  let depth=0,quote='',escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char===quote)quote='';
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==='{')depth++;
    else if(char==='}'&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`${name} incompleta`);
}

function renderedObjectiveRow(item) {
  const objectiveRowSource=functionSource('objectiveRow');
  return new Function('i',`
    const STLABEL={nueva:'Nueva'},NEXT={},SEL=new Set(),SEATLABEL={},SEATALIAS={},SEATROLE={};
    const hasDecision=()=>false,isConsejo=()=>false,hasReview=()=>false,hasMedia=()=>false;
    const objectiveProject=()=>({name:'Yokup',slug:'yokup',url:''}),ymd=()=> '2026-08-10';
    const workRef=value=>value.id,voteSummary=()=> 'Sin deliberación',saberBadge=()=>'',seatOpts=()=>'';
    const objectiveDetail=()=>'',fecha=()=> '10/08/2026';
    const esc=value=>String(value==null?'':value).replace(/[<>&"]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[char]));
    ${objectiveRowSource}
    return objectiveRow(i);
  `)(item);
}

const decodeHtml=value=>String(value).replace(/&(lt|gt|amp|quot);/g,(_,entity)=>({lt:'<',gt:'>',amp:'&',quot:'"'}[entity]));
function buttonsByRole(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match=>{
    const attrs=match[1],attribute=name=>new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1]||'';
    return {
      name:decodeHtml(attribute('aria-label')||match[2].replace(/<[^>]+>/g,'')),
      textContent:decodeHtml(match[2].replace(/<[^>]+>/g,'')),
      dataset:{rm:decodeHtml(attribute('data-rm'))},
      tabIndex:/\bdisabled\b/.test(attrs)||attribute('tabindex')==='-1'?-1:0
    };
  });
}
function getByRole(html,role,{name}) {
  assert.equal(role,'button');
  const matches=buttonsByRole(html).filter(button=>button.name===name);
  assert.equal(matches.length,1,`se esperaba un único botón llamado ${name}`);
  return matches[0];
}

test('Objetivos declara una hoja con seis columnas y rowgroup estable', () => {
  assert.match(source, /id="objectivesGrid"[^>]*role="table"/);
  assert.match(source, /class="objective-grid-head"[^>]*role="row"/);
  assert.match(source, /class="objective-grid-body" id="grid" role="rowgroup"/);
  const columns = Array.from(source.matchAll(/data-objective-col="([^"]+)"/g), m => m[1]);
  assert.deepEqual(columns, ['advisor', 'project', 'objective', 'state', 'date', 'actions']);
});

test('el renderer emite una fila estable con seis claves de orden', () => {
  assert.match(source, /function objectiveRow\(i\)\{/);
  assert.match(source, /class="objective-grid-row" role="row" data-row-key=/);
  for (const key of ['advisor', 'project', 'objective', 'state', 'date', 'actions']) {
    assert.match(source, new RegExp(`data-sort-${key}=`));
    assert.match(source, new RegExp(`var\\(--objective-col-${key},`));
  }
  assert.match(source, /node\.innerHTML=list\.map\(objectiveRow\)\.join\(""\)/);
  assert.doesNotMatch(source, /node\.innerHTML=list\.map\(card\)/);
});

test('la fila conserva los quince campos reales del API sin esconder datos operativos', () => {
  for (const field of [
    'i.id', 'workRef(i)', 'i.title', 'i.body', 'i.author', 'i.tag', 'i.seat',
    'i.project', 'i.status', 'i.created_at', 'i.updated_at', 'i.mission_id',
    'i.decision_id', 'i.review', 'i.media'
  ]) assert.ok(source.includes(field), `falta ${field}`);
  assert.match(source, /class="objective-grid-detail"[^>]*aria-label="Detalle de/);
  assert.doesNotMatch(source, /objective-grid-detail"[^>]*role="cell"|aria-colspan/);
  const rowSource=source.slice(source.indexOf('function objectiveRow(i){'),source.indexOf('function render(){'));
  assert.equal((rowSource.match(/role="cell"/g)||[]).length,6,'la fila conserva exactamente seis celdas semánticas');
  assert.match(source, /Descripción["):]|objective-description/);
  assert.match(source, /a favor · ["+]|en contra/);
  assert.match(source, /Kit de venta/);
  assert.match(source, /actualizado <b>'\+esc\(fechaHora\(i\.updated_at\)\)/);
});

test('selección, edición de silla/fecha y acciones siguen cableadas', () => {
  for (const hook of [
    'data-bulk-id=', 'data-seat-for=', 'data-date-for=', 'data-adv=', 'data-mis=',
    'data-del=', 'data-rm=', 'data-guion=', 'data-regen='
  ]) assert.ok(source.includes(hook), `falta ${hook}`);
  assert.match(source, /href="\/tareas\?mission=/);
  assert.match(source, /href="\/decisiones"/);
  assert.match(source, /setSeat\(s\.dataset\.seatFor,s\.value\)/);
  assert.match(source, /setSchedule\(d\.dataset\.dateFor,d\.value\)/);
  assert.match(source, /applyBulk/);
});

test('el borrado irreversible nombra el objetivo sin alterar su botón nativo', () => {
  const title='Cerrar <script> & "final"',html=renderedObjectiveRow({
    id:'OBJ-<&"-7',title,status:'nueva',created_at:Date.now()
  });
  const escaped='Eliminar para siempre «Cerrar &lt;script&gt; &amp; &quot;final&quot;»';
  assert.equal((html.match(new RegExp(`aria-label="${escaped}"`,'g'))||[]).length,1);
  const button=getByRole(html,'button',{name:`Eliminar para siempre «${title}»`});
  assert.equal(button.textContent,'✕');
  assert.equal(button.tabIndex,0,'el botón nativo sigue en el orden de Tab');
  assert.equal(button.dataset.rm,'OBJ-<&"-7');
  assert.match(html,/<button class="del" data-rm=/);
  assert.match(source,/e\.target\.closest\("\[data-rm\]"\)/);
  assert.match(source,/if\(!confirm\('¿Eliminar esta idea\?/);
  assert.match(source,/fetch\(WORKER\+"\/ideas\/delete"/);
});

test('creación, edición, selección, votos, misión y descarte conservan sus endpoints', () => {
  assert.match(source, /const body=\{title,body:\$\("#fBody"\)\.value\.trim\(\),tag,seat:/);
  assert.doesNotMatch(source, /const body=\{[^\n}]*author:/);
  assert.match(source, /wfetch\("\/ideas",\{cache:"no-store"\}\)/);
  assert.match(source, /fetch\(WORKER\+"\/ideas",\{method:"POST"/);
  assert.match(source, /fetch\(WORKER\+"\/ideas\/seat"[\s\S]*body:JSON\.stringify\(\{id,seat\}\)/);
  assert.match(source, /fetch\(WORKER\+"\/ideas\/schedule"[\s\S]*body:JSON\.stringify\(\{id,scheduled_for\}\)/);
  assert.match(source, /fetch\(WORKER\+"\/ideas\/status"[\s\S]*body:JSON\.stringify\(\{id,status\}\)/);
  assert.match(source, /fetch\(WORKER\+"\/ideas\/review"[\s\S]*body:JSON\.stringify\(\{id\}\)/);
  assert.match(source, /fetch\(WORKER\+"\/ideas\/decide"[\s\S]*body:JSON\.stringify\(\{id\}\)/);
  assert.match(source, /setStatus\(d\.dataset\.del,"descartada"\)/);
  assert.match(source, /reviewInner\(i\)/);
  assert.match(source, /data-bulk-id=/);
  assert.match(source, /body:JSON\.stringify\(\{ids,status\}\)/);
});

test('los filtros de fecha y estado conservan eliminada sin falsear Nueva', () => {
  assert.match(source, /data-f="eliminada">Eliminadas/);
  assert.match(source, /eliminada:"Eliminada"/);
  assert.match(source, /const st=STLABEL\[i\.status\]\?i\.status:\(String\(i\.status\|\|""\)\.trim\(\)\|\|"nueva"\)/);
  assert.match(source, /\.filter\(i=>!FILTER\|\|i\.status===FILTER\)/);
  assert.match(source, /id="boardDay"/);
  assert.match(source, /\.objective-state\.descartada,\.objective-state\.eliminada/);
});

test('ambas densidades son spreadsheet y el móvil apila celdas legibles', () => {
  assert.match(source, /density-compact/);
  assert.match(source, /density-comfortable/);
  assert.match(source, /\.objectives-grid-scroll\{[^}]*overflow-x:auto/);
  assert.match(source, /\.objectives-grid\{min-width:1060px/);
  assert.match(source, /@media\(max-width:560px\)[\s\S]*\.objective-grid-head\{display:none\}/);
  assert.match(source, /\.objective-grid-cell:before\{content:attr\(data-label\)/);
});
