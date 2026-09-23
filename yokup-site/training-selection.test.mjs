import test from 'node:test';
import assert from 'node:assert/strict';
import {capsulesFrom,filterCapsules,selection} from './training-selection.mjs';
const capsule=(extra={})=>({id:'1786368553979-dz99j2',type:'capsula',title:'Diagnóstico de una incidencia',comment:'Confirmar la conexión antes de cerrar.',tags:['formacion','yokup'],...extra});
test('training shows only explicitly tagged text capsules and deduplicates IDs',()=>{
 const list=capsulesFrom([capsule(),capsule(),capsule({id:'video',type:'video'}),capsule({id:'untagged',tags:['tech']}),capsule({id:'empty',comment:''})]);assert.equal(list.length,1);assert.equal(list[0].category,'diagnostico');assert.equal(list[0].technical,false);
});
test('a new tag never claims technical approval and unknown content has no invented application',()=>{
 const [c]=capsulesFrom({items:[capsule({id:'new-capsule',tags:['#Yokup','yokup-procedimiento-validado']})]});assert.equal(c.category,'general');assert.equal(c.technical,false);assert.match(c.use,/pendiente de revisión/);
});
test('source links cannot be supplied by a capsule, and markup remains inert data',()=>{
 const [c]=capsulesFrom([capsule({title:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)'})]);assert.equal(c.source,'https://www.pixeria.com/stock.html?highlight=1786368553979-dz99j2');assert.equal(c.title,'<img src=x onerror=alert(1)>');assert.equal(capsulesFrom([capsule({id:'../bad?x=1'})]).length,0);
});
test('search matches accents, application and category without dropping other filters',()=>{
 const list=capsulesFrom([capsule(),capsule({id:'other',title:'Privacidad',comment:'Datos personales'})]);assert.equal(filterCapsules(list,'diagnostico','diagnostico').length,1);assert.equal(filterCapsules(list,'privacidad','diagnostico').length,0);assert.equal(filterCapsules(list,'sintoma','diagnostico').length,1);
});
test('invalid catalogs fail clearly and the duplicate capsule was not selected',()=>{
 assert.throws(()=>capsulesFrom({error:'no data'}),/catálogo válido/);assert.equal(Object.keys(selection).length,9);assert.equal(selection['1786551354307-i76bys'],undefined);
});
