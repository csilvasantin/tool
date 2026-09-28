const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'../yokup-site')+'/';
const actual={id:'DEC-test-4593',agent:'JobsGrokBot',machine:'GrokBot',project:'Admira Live',project_id:'admira-live',project_slug:'ADMIRA-LIVE',status:'decided',chosen:0,chosen_by:'Jobs',recommended:0,options:['Primera','Segunda','Tercera','Volver atrás','Custom'],created_at:Date.now(),decided_at:Date.now(),deadline:Date.now()+300000,question:'Regression test'};
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
for(const zone of ['Europe/Madrid','America/Los_Angeles']) {
 const context=await b.newContext({timezoneId:zone});const p=await context.newPage();
 let row={...actual,status:'pending',chosen:null,chosen_by:null,secondsLeft:300};let fail=false;
 await p.route('http://decision.test/**',async r=>{
 if(new URL(r.request().url()).pathname==='/decisions')return r.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify({ok:!fail,items:[row]})});
 const html=fs.readFileSync(root+'decisiones.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
 await r.fulfill({contentType:'text/html',body:html});
 });
 await p.goto('http://decision.test/decisiones?decision_id='+actual.id+'&agent=JobsGrokBot&project_id=admira-live');
 await p.evaluate(()=>{window.testIntervals={};window.setInterval=(fn,ms)=>(window.testIntervals[ms]=fn,ms)});
 await p.addScriptTag({path:root+'yk-decisions.js'});
 await p.evaluate(()=>window.app=YkDecisions.mount({worker:'http://decision.test',mode:'full'}));
 await p.waitForFunction(()=>document.querySelector('[data-dec-count="pending"]').textContent==='1');
 assert.equal(await p.locator('.dec-opt:not([disabled])').count(),5);
 row={...actual};await p.evaluate(()=>testIntervals[15000]());
 assert.equal(await p.locator('[data-dec-count="decided"]').textContent(),'1');
 assert.equal(await p.locator('[data-dec-count="pending"]').textContent(),'0');
 assert.equal(await p.locator('#decsHist .dec-opt.effective').count(),1);
 for(const status of ['expired','cancelled','decided']){row={...actual,status};await p.evaluate(()=>testIntervals[15000]());assert.equal(await p.locator(`[data-dec-count="${status}"]`).textContent(),'1');assert.equal(await p.locator('#decsHist').isVisible(),true)}
 fail=true;await p.evaluate(()=>testIntervals[15000]());assert.match(await p.locator('[role="alert"]').innerText(),/No se pudo cargar/);
 fail=false;await p.evaluate(()=>testIntervals[15000]());assert.equal(await p.locator('#decsHist .dec').count(),1);
 row={...actual,agent:'Neo'};await p.evaluate(()=>testIntervals[15000]());assert.match(await p.locator('[role="alert"]').innerText(),/otro agente/);assert.equal(await p.locator('[data-dec-count="decided"]').textContent(),'0');
 row={...actual};await p.evaluate(()=>testIntervals[15000]());assert.equal(await p.locator('#decsHist .dec').count(),1);
 console.log(zone+': pending→decided chosen=0, expired/cancelled, error recovery and identity isolation PASS');await context.close();
}
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
