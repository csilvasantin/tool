import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import identity from './yk-agent-identity.js';
import {htmlFunction} from './highscore-race-test-support.mjs';
const html=readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
const ctx=vm.createContext({window:{ykAgentIdentity:identity},normaliza:v=>String(v||'').trim(),esc:v=>String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
vm.runInContext(['identidadVisualCorredor','contextoVisualCorredor','nombreCorredorHtml'].map(n=>htmlFunction(html,n)).join('\n'),ctx);
test('nombre visible sólo persona base, conserva ordenador exacto y no cambia identidad canónica',()=>{
 for(const name of ['OraculoMacMini','SubMorfeoMBP14','TrinityMBP14']){
  const before=identity.key(name),value=ctx.identidadVisualCorredor(name,{});
  assert.equal(value.nombre,identity.parse(name).persona);assert.equal(value.machine,identity.parse(name).suffix);assert.equal(identity.key(name),before);
 }
 assert.equal(ctx.identidadVisualCorredor('MorfeoMacMini',{}).nombre,ctx.identidadVisualCorredor('MorfeoMBP14',{}).nombre);
 assert.notEqual(identity.key('MorfeoMacMini'),identity.key('MorfeoMBP14'));
});
test('equipo e interfaz se revelan en hover/foco con descripción accesible sin badges permanentes',()=>{
 const value=ctx.identidadVisualCorredor('OraculoMacMini',{}),context=ctx.contextoVisualCorredor(value,{sessionSurface:'app'},{interfaces:['cli']});
 assert.equal(context,'MacMini · APP');
 const result=ctx.nombreCorredorHtml(value,context,'race-agent-context-1');
 assert.match(result,/data-race-role="agent" tabindex="0" title="MacMini · APP"[^>]*>Oraculo<\/span>/);
 assert.match(result,/aria-describedby="race-agent-context-1"/);assert.match(result,/role="tooltip" id="race-agent-context-1">MacMini · APP/);
 assert.doesNotMatch(result,/refresh-agent-machine|>OraculoMacMini</);
 assert.match(html,/\.refresh-agent-identity:hover \.refresh-agent-tooltip,\.refresh-agent-identity:focus-within \.refresh-agent-tooltip\{visibility:visible/);
});
test('interfaces conocidas se distinguen de la sesión real; desconocida no inventa CLI ni APP',()=>{
 const value=ctx.identidadVisualCorredor('MorfeoMBP14',{});
 assert.match(ctx.contextoVisualCorredor(value,{}, {interfaces:['cli','app','cli']}),/MBP14 · interfaces conocidas: APP \/ CLI · sesión sin vincular/);
 assert.equal(ctx.contextoVisualCorredor(value,{},{}),'MBP14 · interfaz sin verificar');
});
test('observaciones cierran el contenido principal después de ranking y fórmula, plegadas',()=>{
 assert.ok(html.indexOf('id="workObservations"')>html.indexOf('id="formulaBody"'));
 assert.ok(html.indexOf('id="formulaBody"')>html.indexOf('id="rankingTable"'));
 const tag=html.match(/<details[^>]+id="workObservations"[^>]*>/)[0];assert.doesNotMatch(tag,/\bopen\b/);
 assert.equal((html.match(/id="workObservations"/g)||[]).length,1);
});
