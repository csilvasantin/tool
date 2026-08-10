import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./objetivos.html', import.meta.url), 'utf8');

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
