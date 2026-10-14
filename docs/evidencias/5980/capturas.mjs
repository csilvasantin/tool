// Capturas del filtro por proyecto (#5980) contra la demo local. Navegador sin ventana (Playwright).
//   node api/tools/demo-proyecto.mjs &      # en otra terminal
//   node docs/evidencias/5980/capturas.mjs docs/evidencias/5980 && python3 docs/evidencias/5980/franja.py docs/evidencias/5980
// franja.py pega debajo de cada captura la URL, las llamadas a la API y qué se ve (no tapa la página).
import {chromium} from 'playwright';
const OUT=process.argv[2];const B='http://localhost:8788';
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width:1440,height:1300},deviceScaleFactor:1});
let p=await ctx.newPage();
const api=[];p.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/retailer/'))api.push(r.status()+' '+r.request().method()+' '+u.pathname+u.search);});
async function bannerOLD(extra){await p.evaluate(([extra,calls])=>{document.getElementById('cap-url')?.remove();const d=document.createElement('div');d.id='cap-url';d.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#111;color:#e8e8e8;font:13px/1.45 ui-monospace,Menlo,monospace;padding:8px 14px;border-top:3px solid #00704a';const l=document.createElement('div');l.textContent='URL  '+location.href+'   ·   demo local: node api/tools/demo-proyecto.mjs (API real en memoria, datos de prueba)';d.append(l);for(const c of calls){const x=document.createElement('div');x.textContent='API  '+c;x.style.color=/^4/.test(c)?'#ff8a80':'#9be7a8';d.append(x);}if(extra){const e=document.createElement('div');e.textContent=extra;e.style.color='#ffd479';d.append(e);}document.body.append(d);},[extra,api.slice(-3)]);}
async function cli(cmd){if(!await p.evaluate(()=>window.AdmiraExperto?.isOpen?.()))await p.click('.yk-ico-exp, [aria-label="Modo experto"]').catch(()=>p.evaluate(()=>window.AdmiraExperto.open()));
 const i=p.locator('.ax-cli-input').first();await i.click();await i.fill(cmd);await i.press('Enter');await p.waitForTimeout(3500);}
async function shot(name,extra,scrollTo){if(scrollTo)await p.evaluate(s=>{const n=[...document.querySelectorAll('h2')].find(h=>h.textContent.includes(s));n?.scrollIntoView({block:'start'});window.scrollBy(0,-70);},scrollTo);else await p.evaluate(()=>window.scrollTo(0,0));
 await p.waitForTimeout(400);await p.screenshot({path:OUT+'/'+name});const fs=await import('node:fs');fs.writeFileSync(OUT+'/'+name+'.json',JSON.stringify({url:p.url(),api:(()=>{const r=api.filter(a=>/dashboard|\/itil/.test(a));return r.some(a=>a.startsWith('4'))?r.filter(a=>a.startsWith('4')).slice(-2).concat(r.filter(a=>!a.startsWith('4')).slice(-1)):r.slice(-3);})(),nota:extra}));console.log('ok',name);}
// 1 · superusuario en Alsea, sin filtro
await p.goto(B+'/demo/superusuario');await p.waitForTimeout(4500);
await shot('01-superusuario-sin-filtro.png','Superusuario (sesión de prueba) con «Abrir como retailer» en Alsea · sin filtro: Paseo de Gracia + Tijuana, 2 abiertas',null);
await shot('01b-superusuario-sin-filtro-locales.png','Sin filtro: los dos Starbucks de Alsea (España y México)','Mis establecimientos');
// 2 · /proyecto starbucks
await cli('/proyecto starbucks');
await shot('02-proyecto-starbucks.png','⌘ Experto: /proyecto starbucks → solo alsea-sbux-* (Paseo de Gracia), 1 abierta; Tijuana (alsea-mx-sbux-*) fuera',null);
await shot('02b-proyecto-starbucks-locales.png','Con /proyecto starbucks: un solo establecimiento','Mis establecimientos');
await shot('03-itil-proyecto-starbucks.png','Inventario ITIL con el filtro: solo el Xpacio alsea-sbux-021','Inventario ITIL');
// 3 · /marca starbucks
await cli('/marca starbucks');
await shot('04-marca-starbucks.png','⌘ Experto: /marca starbucks aplicado sobre el filtro (look de la marca; el filtro sigue)',null);
// 4 · comercio normal → 403
const ctx2=await b.newContext({viewport:{width:1440,height:1300}});p=await ctx2.newPage();api.length=0;p.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/retailer/'))api.push(r.status()+' '+r.request().method()+' '+u.pathname+u.search);});
await p.goto(B+'/demo/comercio?proyecto=starbucks');await p.waitForTimeout(4500);
await shot('05-comercio-normal-403.png','Comercio normal con ?proyecto=starbucks: el servidor responde 403 superuser-required; ve solo sus datos',null);
await b.close();
