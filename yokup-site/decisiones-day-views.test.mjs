import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('./yk-decisions.js',import.meta.url),'utf8');
const page=await readFile(new URL('./decisiones.html',import.meta.url),'utf8');
const viewSource=await readFile(new URL('./yk-informes-view.js',import.meta.url),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(`${source}\nglobalThis.DV=window.YkDecisions._test;`,context);
const viewContext=vm.createContext({});
vm.runInContext(`${viewSource}\nglobalThis.View=globalThis.YkInformesView;`,viewContext);

const now=Date.UTC(2026,8,3,10,0);
function row(id,hour,status='expired'){
  const created=Date.UTC(2026,8,3,hour,15);
  return {id,display_ref:id,status,created_at:created,deadline:created+300000,
    machine:'Mac Mini',agent:'OraculoMacMini',surface:'cli',project:'Yokup',
    project_id:'yokup',project_slug:'YOKUP',question:`Pregunta ${id}`,
    options:['Uno','Dos','Tres','Volver atrás','Custom'],recommended:0,chosen:1};
}

test('Decisiones replica los filtros temporales y el selector de tres vistas de Informes',()=>{
  for(const value of ['today','yesterday','7days','all'])assert.match(page,new RegExp(`data-decision-range="${value}"`));
  assert.match(page,/id="decisionDay"[^>]*type="date"|type="date"[^>]*id="decisionDay"/);
  assert.match(page,/YkInformesView\.mount\(document\.getElementById\("decisionView"\)/);
  assert.match(page,/storageKey:"yokup\.decisiones\.view\.v1"/);
  const html=viewContext.View.selectorMarkup('detail','decsHist','decisiones');
  assert.match(html,/aria-label="Vista de decisiones"/);
  assert.match(html,/>Detalle<\/button>[\s\S]*>Cuadrícula<\/button>[\s\S]*>Lista<\/button>/);
});

test('Hoy es el periodo por defecto y los presets respetan el día de Madrid',()=>{
  const today=row('hoy',8),yesterday={...row('ayer',8),created_at:Date.UTC(2026,8,2,8,15)};
  assert.equal(context.DV.decisionInRange(today,'today','',now),true);
  assert.equal(context.DV.decisionInRange(yesterday,'today','',now),false);
  assert.equal(context.DV.decisionInRange(yesterday,'yesterday','',now),true);
  assert.equal(context.DV.decisionInRange(yesterday,'7days','',now),true);
  assert.equal(context.DV.decisionInRange(yesterday,'all','',now),true);
  assert.equal(context.DV.decisionRangeLabel('today','',now),'Hoy');
});

test('las decisiones se separan por hora de apertura en Madrid y se ordenan de reciente a antigua',()=>{
  const groups=context.DV.decisionHourGroups([row('seis',6),row('ocho-a',8),row('ocho-b',8)]);
  assert.equal(groups.length,2);
  assert.equal(groups[0].hour,'10');
  assert.deepEqual(Array.from(groups[0].items,item=>item.id),['ocho-a','ocho-b']);
  assert.equal(groups[1].hour,'08');
});

test('Detalle, Cuadrícula y Lista conservan las mismas decisiones dentro de cada hora',()=>{
  const rows=[row('DEC-8',8),row('DEC-6',6)];
  const detail=context.DV.decisionHistoryByHour(rows,'detail');
  const grid=context.DV.decisionHistoryByHour(rows,'grid');
  const list=context.DV.decisionHistoryByHour(rows,'list');
  assert.match(detail,/10:00–10:59[\s\S]*08:00–08:59/);
  assert.match(detail,/decision-hour-detail/);
  assert.equal((detail.match(/class="dec dec-fold" open/g)||[]).length,2);
  assert.match(grid,/decision-hour-grid/);
  assert.equal((grid.match(/class="dec dec-fold"/g)||[]).length,2);
  assert.equal((list.match(/class="decision-grid-hour" role="rowgroup"/g)||[]).length,2);
  assert.equal((list.match(/class="decision-grid-row"/g)||[]).length,2);
  for(const id of ['DEC-8','DEC-6'])for(const html of [detail,grid,list])assert.match(html,new RegExp(id));
});

test('los relojes vivos también se dibujan bajo su hora sin perder botones ni cuenta atrás',()=>{
  const live={...row('DEC-live',8,'pending'),secondsLeft:240};
  const html=context.DV.decisionHistoryByHour([live],'detail');
  assert.match(html,/10:00–10:59/);
  assert.match(html,/data-clock="DEC-live"/);
  assert.equal((html.match(/data-dec="DEC-live"/g)||[]).length,5);
});
