import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

// La demo del filtro por proyecto (#5980) arranca y enseña lo mismo que las capturas de docs/evidencias/5980.
test('demo del filtro por proyecto: superusuario filtra, comercio normal recibe 403',async t=>{
 const port=String(18000+Math.floor(Math.random()*1000));
 const child=spawn(process.execPath,['--no-warnings',new URL('./tools/demo-proyecto.mjs',import.meta.url).pathname,'--port',port],{stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 await new Promise((ok,ko)=>{let err='';child.stdout.on('data',d=>{if(String(d).includes('lista'))ok();});child.stderr.on('data',d=>{err+=d;});child.on('exit',c=>ko(new Error('salió '+c+': '+err)));});
 const B='http://127.0.0.1:'+port,get=(path,role)=>fetch(B+path,{headers:role?{Cookie:'yk_demo='+role}:{}});
 assert.equal((await get('/api/retailer/dashboard')).status,401,'sin rol de demo no hay datos');
 const todo=await (await get('/api/retailer/dashboard','superusuario')).json();
 assert.deepEqual(todo.sites.map(s=>s.xpacio_id).sort(),['alsea-mx-sbux-01-tijuana','alsea-sbux-021']);
 const sb=await (await get('/api/retailer/dashboard?proyecto=starbucks','superusuario')).json();
 assert.equal(sb.proyecto,'starbucks');assert.deepEqual(sb.sites.map(s=>s.xpacio_id),['alsea-sbux-021']);assert.equal(sb.incidents.length,1);
 const normal=await get('/api/retailer/dashboard?proyecto=starbucks','comercio');
 assert.equal(normal.status,403);assert.equal((await normal.json()).error,'superuser-required');
 const page=await (await get('/retailer')).text();
 assert.match(page,/retailer-proyecto\.js/);
 const js=await (await get('/retailer-portal.js')).text();
 assert.ok(!js.includes('https://data.yokup.com/api')&&js.includes("'/api/retailer'"),'la página habla con la demo, no con producción');
 const entra=await fetch(B+'/demo/comercio?proyecto=starbucks',{redirect:'manual'});
 assert.equal(entra.status,302);assert.equal(entra.headers.get('location'),'/retailer?proyecto=starbucks');assert.match(entra.headers.get('set-cookie'),/^yk_demo=comercio;/);
});
