import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=f=>readFileSync(new URL('./'+f,import.meta.url),'utf8');
function nextTarget(search,origin='https://www.yokup.com'){
 const source=/function nextTarget\(\)\{.*?\}catch\{return null;\}\}/.exec(read('retailer-portal.js'))[0];
 const context=vm.createContext({URL,URLSearchParams,location:{search,origin}});vm.runInContext(source,context);return context.nextTarget();
}
test('incident page carries portal look and versioned assets; data is inserted only as text',()=>{
 const html=read('retailer-incidencia.html'),js=read('retailer-incidencia.js');
 for(const asset of ['/installer-portal.css?v=','/retailer-portal.css?v=','/retailer-incidencia.css?v=','/retailer-incidencia.js?v='])assert.ok(html.includes(asset),asset);
 assert.match(html,/PORTAL DEL COMERCIO/);assert.match(html,/href="\/retailer#incidencias">← Mis incidencias/);assert.match(html,/<em>/);
 assert.doesNotMatch(js,/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
 assert.match(js,/'\/incidents\/'\+encodeURIComponent\(id\)/);assert.match(js,/request_key:requestKey/);assert.match(js,/crypto\.randomUUID\(\)/);
 assert.match(js,/'\/retailer\?next='\+encodeURIComponent\('\/retailer\/incidencia'\+location\.search\)/);
 assert.match(read('retailer.html'),/retailer-portal\.js\?v=20261010-idioma-5532/);
 assert.match(read('retailer.html'),/yk-idioma\.js\?v=20261010-idioma-5532/);
});
test('login returns only to relative commerce routes, never to another origin or back to the portal root',()=>{
 assert.equal(nextTarget('?next='+encodeURIComponent('/retailer/incidencia?origen=xpaceos&equipo=Pantalla')),'/retailer/incidencia?origen=xpaceos&equipo=Pantalla');
 assert.equal(nextTarget('?next=%2Fcomercio%2Fincidencia%3Fid%3Dretail-1'),'/comercio/incidencia?id=retail-1');
 for(const bad of ['https://evil.example/retailer/x','//evil.example/retailer/x','/\\evil.example','/\t/evil.example/retailer/x','javascript:alert(1)','/retailer','/retailer/','/instalador/x','/retailer/../instalador','/retailerx/y',''])assert.equal(nextTarget('?next='+encodeURIComponent(bad)),null,bad);
 assert.equal(nextTarget(''),null);
});
