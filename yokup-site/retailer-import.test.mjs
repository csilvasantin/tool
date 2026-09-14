import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as schema from './retailer-import-schema.mjs';
function harness(){
 const context=vm.createContext({schema,ArrayBuffer,Uint8Array,console,importScripts:()=>{}});context.self=context;
 vm.runInContext(readFileSync(new URL('./vendor/xlsx-0.20.3.full.min.js',import.meta.url),'utf8'),context);
 const worker=readFileSync(new URL('./retailer-import-worker.js',import.meta.url),'utf8');assert.ok(worker.includes("await import('/retailer-import-schema.mjs')"));
 vm.runInContext(worker.replace("await import('/retailer-import-schema.mjs')",'schema'),context);
 return {XLSX:context.XLSX,run:async(data)=>{let result;context.postMessage=x=>result=x;await context.onmessage({data});return result;}};
}
test('actual XLSX and XLS files parse; Spanish headers, comma coordinates and formatted codes survive',async()=>{
 const {XLSX,run}=harness();for(const bookType of ['xlsx','xls']){
  const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([schema.HEADERS,[1,'Mi comercio','estanco','es','Barcelona','Calle Ejemplo 12','41,4','2,1']]);sheet.A2.z='0000';XLSX.utils.book_append_sheet(book,sheet,'Tiendas');
  const parsed=await run({buffer:XLSX.write(book,{bookType,type:'array'})});assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].external_ref,'0001');assert.equal(schema.normalizeSite(parsed.rows[0]).latitude,41.4);
 }
});
test('template is a real workbook with blank locations and instructions; errors retain sheet choice',async()=>{
 const {XLSX,run}=harness(),template=await run({action:'template'}),book=XLSX.read(template.buffer,{type:'array'});
 assert.deepEqual(Array.from(book.SheetNames),['Ubicaciones','Instrucciones']);
 const parsed=await run({buffer:template.buffer});assert.match(parsed.error,/vacía/);assert.equal(parsed.sheets.length,2);
});
test('formula cells, missing and duplicate headers are rejected; preview keeps original row numbers',async()=>{
 const {XLSX,run}=harness(),book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([schema.HEADERS,[],['A','Mi tienda','otro','ES','Madrid','Calle Prueba 1',40,-3]]);XLSX.utils.book_append_sheet(book,sheet,'Hoja');
 let parsed=await run({buffer:XLSX.write(book,{bookType:'xlsx',type:'array'})});assert.equal(parsed.rows[0].source_row,3);
 sheet.G3.f='20+20';parsed=await run({buffer:XLSX.write(book,{bookType:'xlsx',type:'array'})});assert.match(parsed.error,/fórmulas/);
 assert.throws(()=>schema.headerFields(['nombre','nombre']),/repetidas/);assert.throws(()=>schema.headerFields(['nombre']),/Falta/);
});

test('published template matches the reader headers and contains no sample establishments',()=>{
 const {XLSX}=harness();const bytes=readFileSync(new URL('./templates/ubicaciones-retailer.xlsx',import.meta.url));const book=XLSX.read(bytes,{type:'array'});const grid=XLSX.utils.sheet_to_json(book.Sheets.Ubicaciones,{header:1});assert.equal(grid.length,1);assert.deepEqual(Array.from(grid[0]),schema.HEADERS);assert.ok(book.Sheets.Instrucciones);
});
