import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleRequest} from '../yokup-site-gate/src/index.js';
const read=f=>readFileSync(new URL('./'+f,import.meta.url),'utf8');
function target(file,name,value){
 const source=read(file),start=source.indexOf('function '+name+'(){'),end=source.indexOf('catch{return null;}}',start)+'catch{return null;}}'.length;
 const context=vm.createContext({URL,URLSearchParams,location:{origin:'https://www.admira.app',search:'?next='+encodeURIComponent(value)}});
 vm.runInContext(source.slice(start,end),context);return context[name]();
}
test('login returns to the same ecommerce incident, blocks external and normalized bypass paths',()=>{
 for(const [file,name] of [['installer-portal.js','ecommerceReturnTarget'],['retailer-portal.js','nextTarget']]){
  assert.equal(target(file,name,'/ecommerce?role=installer&incident=test-1'),'/ecommerce?role=installer&incident=test-1');
  assert.equal(target(file,name,'/ecommerce/'),'/ecommerce/');
  for(const bad of ['//evil.test/ecommerce','https://evil.test/ecommerce','/\\evil.test/ecommerce','/ecommerce/../auth','/ecommerce-other','/ecommerce/child','/\t/evil.test/ecommerce'])assert.equal(target(file,name,bad),null,bad);
 }
});
test('the public gate serves ecommerce and trailing slash as the dedicated page preserving query',async()=>{
 const release={version:'test',gitShort:'123abcd'},seen=[];
 const env={RELEASE_JSON:JSON.stringify(release),ASSETS:{fetch:async req=>{seen.push(new URL(req.url).pathname+new URL(req.url).search);return new Response('ecommerce page');}}};
 for(const path of ['/ecommerce','/ecommerce/']){
  const r=await handleRequest(new Request('https://www.yokup.com'+path+'?incident=test-1'),env,{});assert.equal(await r.text(),'ecommerce page');
 }
 assert.deepEqual(seen,['/ecommerce.html?incident=test-1','/ecommerce.html?incident=test-1']);
});
test('every queried static element exists and cards do not interpolate untrusted HTML',()=>{
 const html=read('ecommerce.html'),js=read('ecommerce.js');
 for(const [,id] of js.matchAll(/\$\('#([a-z][a-z-]+)'\)/g))assert.ok(html.includes('id="'+id+'"'),id);
 assert.equal((js.match(/innerHTML/g)||[]).length,1);assert.ok(js.includes('icons[c.id]||icons.other'));
 assert.doesNotMatch(js,/localStorage|document\.write|insertAdjacentHTML|eval\(/);
 assert.match(html,/aria-live="polite"/);assert.match(html,/role="tabpanel"/);
});
test('all portal entry points link material to the incident',()=>{
 assert.match(read('installer-portal.js'),/\/ecommerce\?role=installer&incident='\+encodeURIComponent\(i.id\)/);
 assert.match(read('retailer-incidencia.js'),/\/ecommerce\?role=retailer&incident='\+encodeURIComponent\(i.id\)/);
 assert.match(read('retailer-incidencia.html'),/id="ecommerce-link"/);
 assert.match(read('_redirects'),/^\/ecommerce\/\s+\/ecommerce.html\s+200$/m);
});
