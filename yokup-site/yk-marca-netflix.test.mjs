import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM, ResourceLoader, VirtualConsole} from 'jsdom';
const require = createRequire(import.meta.url);
const M = require('./yk-marca.js');
const source = readFileSync(new URL('./yk-marca.js', import.meta.url), 'utf8');
const tick = () => new Promise(r=>setImmediate(r));
const fixture = `<!doctype html><html lang="es" style="color-scheme: light !important; --mb-existing: keep"><head><title>Admira · Incidencias</title><meta name="theme-color" content="#fff"><link rel="icon" href="/favicon.svg"><style>body {background: white; color: black}</style></head><body><main><h1>Incidencias</h1><a class="primary" href="/incidencia?id=INC-42">Abrir</a><input value="Sin perder el formulario"></main><div id="yk-frame"><div class="yk-bar"><a class="yk-logo" href="/">admira.app</a></div><aside id="yk-rail-left"><div class="yk-hd">Opciones</div></aside></div></body></html>`;
function setup(t, options = {}) {
  const requests = [];
  class Assets extends ResourceLoader {
    fetch(url) {
      requests.push(url);
      if (options.asset) { const p = options.asset(url); if (p) return p; }
      const pathname = new URL(url).pathname;
      if (/^\/yk-marca(?:-netflix)?\.css$/.test(pathname)) return Promise.resolve(readFileSync(new URL('.' + pathname, import.meta.url)));
      return null;
    }
  }
  const dom = new JSDOM(fixture, {url:'https://admira.app/ecommerce' + (options.search || ''), runScripts:'outside-only', resources:new Assets(), virtualConsole:new VirtualConsole()});
  t.after(()=>dom.window.close());
  const w = dom.window;
  w.CSS = {escape:s=>s};
  w.fetch = options.fetch || (async url=>{requests.push(url);return {ok:false,status:404,json:async()=>({})};});
  for (const [k,v] of Object.entries(options.stored || {})) w.sessionStorage.setItem(k,v);
  const baseline = state(w);
  w.eval(source);
  return {w, requests, baseline};
}
function state(w) {
  return JSON.stringify({title:w.document.title, rootStyle:w.document.documentElement.style.cssText,
    brand:w.document.documentElement.getAttribute('data-mb-marca'), theme:w.document.querySelector('meta[name="theme-color"]')?.content,
    icons:[...w.document.querySelectorAll('link[rel~="icon"]')].map(n=>[n.rel,n.getAttribute('href')]),
    main:w.document.querySelector('main').innerHTML, logo:w.document.querySelector('.yk-logo').outerHTML});
}

test('Netflix is opt-in; default loading has no requests or DOM changes', t=>{
  const {w,requests,baseline} = setup(t);
  assert.equal(state(w),baseline);assert.deepEqual(requests,[]);assert.equal(w.AdmiraMarca.actual(),null);
  assert.equal(M.parseArg('Netflix').id,'netflix');
  assert.equal(M.decide('',{getItem:()=>null}).id,null);
});

test('bundled activation and exact rollback preserve content, input, favicon, native styles and title', async t=>{
  const {w,requests,baseline} = setup(t);
  const r = await w.AdmiraMarca.activar('Netflix');
  assert.equal(r.ok,true);assert.equal(r.id,'netflix');
  assert.equal(w.document.documentElement.getAttribute('data-mb-marca'),'netflix');
  assert.equal(w.document.documentElement.style.colorScheme,'dark');
  assert.equal(w.document.querySelector('#mb-bar-logo img').getAttribute('alt'),'Netflix');
  assert.equal(w.document.querySelector('#mb-volver').textContent,'Volver a Admira');
  assert.equal(w.sessionStorage.getItem('mb:marca'),'netflix');
  assert.equal(requests.length,2);assert.ok(requests.every(u=>u.startsWith('https://admira.app/')));
  assert.equal(w.document.querySelector('input').value,'Sin perder el formulario');
  assert.equal(w.document.title,'Netflix · Admira · Incidencias');
  await w.AdmiraMarca.activar('NETFLIX');
  assert.equal(w.document.querySelectorAll('link[data-admira-marca]').length,2);
  assert.equal(w.document.querySelectorAll('#mb-bar-logo').length,1);
  w.document.querySelector('#mb-volver').click();
  assert.equal(state(w),baseline);
  assert.equal(w.document.querySelectorAll('link[data-admira-marca]').length,0);
  assert.equal(w.sessionStorage.getItem('mb:marca'),null);
  assert.equal(w.document.querySelector('#mb-bar-logo'),null);
  await w.AdmiraMarca.activar('netflix');
  await w.AdmiraMarca.activar('admira');
  assert.equal(state(w),baseline);
});

test('session navigation restores Netflix, URL off clears it and preserves unrelated parameters', async t=>{
  const {w} = setup(t,{stored:{'mb:marca':'netflix'}});
  for(let i=0;i<20 && !w.AdmiraMarca.actual();i++) await tick();
  assert.equal(w.AdmiraMarca.actual()?.id,'netflix');
  w.history.replaceState(null,'','?marca=Netflix&modo=claro&incidencia=INC-42#material');
  w.AdmiraMarca.desactivar();
  assert.equal(w.location.href,'https://admira.app/ecommerce?incidencia=INC-42#material');
  const off = setup(t,{stored:{'mb:marca':'netflix','mb:modo':'oscuro'},search:'?marca=off'});
  assert.equal(off.w.sessionStorage.getItem('mb:marca'),null);
  assert.equal(off.w.sessionStorage.getItem('mb:modo'),null);
  assert.deepEqual(off.requests,[]);
  assert.equal(off.w.AdmiraMarca.actual(),null);
});

test('off during a pending stylesheet cancels activation permanently', async t=>{
  let release, arrive;
  const seen = new Promise(r=>{arrive=r;});
  const gate = new Promise(r=>{release=r;});
  const {w,baseline} = setup(t,{asset:url=>url.includes('netflix.css')?(arrive(),gate):null});
  const pending = w.AdmiraMarca.activar('netflix');
  await seen;
  w.AdmiraMarca.desactivar();
  release(Buffer.from(''));
  const r = await pending;
  assert.equal(r.reason,'cancelled');
  assert.equal(state(w),baseline);
  assert.equal(w.sessionStorage.getItem('mb:marca'),null);
  assert.equal(w.document.querySelectorAll('link[data-admira-marca]').length,0);
});

test('asset failure leaves no partial theme or stored activation', async t=>{
  const {w,baseline} = setup(t,{asset:url=>url.includes('netflix.css')?Promise.reject(new Error('offline')):null});
  const r = await w.AdmiraMarca.activar('netflix');
  assert.equal(r.ok,false);assert.equal(r.reason,'network');
  assert.equal(state(w),baseline);
  assert.equal(w.sessionStorage.getItem('mb:marca'),null);
});

test('unknown remote brand preserves active Netflix and the catalog keeps the bundled preset', async t=>{
  const {w} = setup(t,{fetch:async url=>({ok:!url.includes('/missing'),status:url.includes('/missing')?404:200,json:async()=>({clientes:[{id:'lumbre',nombre:'Lumbre'}]})})});
  await w.AdmiraMarca.activar('netflix');
  const active = state(w);
  assert.equal((await w.AdmiraMarca.activar('missing')).reason,'unknown');
  assert.equal(state(w),active);
  assert.equal(w.sessionStorage.getItem('mb:marca'),'netflix');
  assert.ok((await w.AdmiraMarca.listar()).some(x=>x.id==='netflix'));
});

test('Netflix text and primary buttons meet AA contrast on all brand surfaces', ()=>{
  const tokens = M.shellTokens(M.NETFLIX.variables,'oscuro');
  for(const token of ['--mbx-ink','--mbx-mut','--mbx-brand','--mbx-accent','--mbx-ok','--mbx-error','--mbx-warn'])
    for(const bg of ['#141414','#181818','#232323']) assert.ok(M.contrast(tokens[token],bg)>=4.5, token+' on '+bg);
  assert.ok(M.contrast('#ffffff','#e50914')>=4.5);
  assert.ok(M.contrast('#ffffff','#c11119')>=4.5);
});

test('real expert engine resolves /brand Netflix and /brand off through the app adapter', async t=>{
  const {w} = setup(t);
  w.document.getElementById('yk-frame').remove();
  w.matchMedia = ()=>({matches:false,addListener(){},removeListener(){},addEventListener(){}});
  w.eval(readFileSync(new URL('./yk-frame.js',import.meta.url),'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.eval(readFileSync(new URL('./suite/experto.js',import.meta.url),'utf8'));
  const baseline = state(w);
  assert.equal(typeof w.YkFrame.run,'function');
  await w.YkFrame.run('/brand Netflix');
  assert.equal(w.AdmiraMarca.actual()?.id,'netflix');
  await w.YkFrame.run('/brand off');
  assert.equal(w.AdmiraMarca.actual(),null);
  assert.equal(state(w),baseline);
});

test('late remote apply after off restores native styles and cannot overwrite the next Netflix activation', async t=>{
  const {w,baseline} = setup(t,{fetch:async()=>({ok:true,status:200,json:async()=>({id:'lumbre',nombre:'Lumbre'})}),asset:url=>url.endsWith('marcablanca.css')?Promise.resolve(Buffer.from('')):null});
  let release, arrived;
  const seen = new Promise(r=>{arrived=r;});
  w.MarcaBlanca = {version:'test',aplicar:()=>new Promise(resolve=>{
    release=()=>{
      w.document.documentElement.setAttribute('data-mb-marca','lumbre');
      w.document.documentElement.style.setProperty('--mb-fondo','#00ff00');
      resolve({id:'lumbre',marca:{nombre:'Lumbre'},modo:'claro',variables:{}});
    };arrived();
  })};
  const remote = w.AdmiraMarca.activar('lumbre');
  await seen;
  w.AdmiraMarca.desactivar();
  assert.equal(state(w),baseline);
  const netflix = w.AdmiraMarca.activar('netflix');
  release();
  assert.equal((await remote).reason,'cancelled');
  assert.equal((await netflix).ok,true);
  assert.equal(w.AdmiraMarca.actual().id,'netflix');
  w.AdmiraMarca.desactivar();
  assert.equal(state(w),baseline);
});
