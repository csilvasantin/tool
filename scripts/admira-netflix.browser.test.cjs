// Run: node --test scripts/admira-netflix.browser.test.cjs
// Requires Playwright + Chromium. All requests are local fixtures; no production writes.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {readFile, mkdir} = require('node:fs/promises');
const {resolve, extname} = require('node:path');
const site = resolve(__dirname, '../yokup-site');
const {chromium} = require('node:module').createRequire(resolve(site,'package.json'))('playwright');
let browser;
before(async () => { browser = await chromium.launch({headless:true, channel:process.env.NETFLIX_BROWSER_CHANNEL || undefined}); });
after(async () => { await browser?.close(); });
const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.ico':'image/x-icon'};
async function setup(t, viewport = {width:1440,height:1000}, hooks = {}) {
  const context = await browser.newContext({viewport, reducedMotion:'reduce', serviceWorkers:'block'});
  t.after(() => context.close());
  const requests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    if (await hooks.route?.(route, url)) return;
    if (url.origin === 'https://www.admiranext.com' && /^\/suite\/experto\.(js|css)$/.test(url.pathname)) {
      return route.fulfill({status:200,body:await readFile(resolve(site,'.'+url.pathname)),contentType:types[extname(url.pathname)]});
    }
    if (url.origin !== 'https://admira.app') return route.abort();
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    else if (!extname(path)) path += '.html';
    const file = resolve(site, '.' + path);
    if (!file.startsWith(site + '/')) return route.abort();
    try {
      let body = await readFile(file);
      // The existing /brand alias selects English in the shared command engine.
      // Start in English so content equality isolates the brand change.
      if (path.endsWith('.html')) body = Buffer.from(body.toString().replace('<html lang="es"','<html lang="en"').replace('<head>', '<head><script src="/yk-casa.js"></script>'));
      await route.fulfill({status:200, body, contentType:types[extname(path)] || 'application/octet-stream'});
    } catch { await route.fulfill({status:404, body:'{}', contentType:'application/json'}); }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  return {page, context, requests};
}
async function visit(page, path) {
  await page.goto('https://admira.app' + path);
  await page.waitForFunction(() => window.YkFrame?.ready);
  await page.waitForFunction(() => !!window.AdmiraExperto);
}
async function command(page, text) { await page.evaluate(text => window.YkFrame.run(text), text); }
async function state(page) {
  return page.evaluate(() => ({
    brand:document.documentElement.getAttribute('data-mb-marca'),
    title:document.title,
    theme:document.querySelector('meta[name="theme-color"]')?.content || null,
    icons:[...document.querySelectorAll('link[rel~="icon"]')].map(x=>[x.rel,x.getAttribute('href')]),
    scheme:document.documentElement.style.getPropertyValue('color-scheme'),
    styles:['body','.yk-bar','h1','.primary','.secondary','.offer-grid article','.access-card','.flow-card','input','.join-section']
      .map(s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return [s,c.color,c.backgroundColor,c.fontFamily,c.fontWeight,c.borderRadius];}),
    content:document.querySelector('main')?.textContent,
    links:[...document.querySelectorAll('main a')].map(a=>a.getAttribute('href')),
  }));
}

test('expert command activates Netflix locally, survives navigation, restores the exact baseline', async t => {
  const {page, requests, context} = await setup(t);
  await visit(page, '/ecommerce?incidencia=INC-42#contenido');
  const initial = await state(page);
  assert.equal(initial.brand, null);
  assert.equal(requests.some(x=>/yk-marca|brand-assets|\/marcablanca\//.test(x)), false);
  await page.locator('.yk-ico[data-yk-panel="bottom"]').click();
  await page.locator('.yk-lcli-input').fill('/brand Netflix');
  await page.locator('.yk-lcli-input').press('Enter');
  await page.waitForFunction(() => window.AdmiraMarca?.actual()?.id === 'netflix');
  assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor), 'rgb(20, 20, 20)');
  assert.equal(await page.locator('#mb-bar-logo img').getAttribute('alt'), 'Netflix');
  assert.equal(await page.locator('#mb-bar-logo img').evaluate(e=>e.complete && e.naturalWidth > 0), true);
  assert.equal(requests.some(x=>x.includes('/marcablanca/')), false);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('mb:marca')), 'netflix');
  const active = await state(page);
  assert.deepEqual(active.links, initial.links);
  assert.equal(active.content, initial.content);
  await command(page, '/brand off');
  assert.deepEqual(await state(page), initial);
  assert.equal(await page.locator('link[data-admira-marca]').count(), 0);
  await command(page, '/brand Netflix');
  await command(page, '/brand Netflix');
  assert.equal(await page.locator('link[href*="yk-marca-netflix.css"]').count(), 1);
  await visit(page, '/instalador');
  await page.waitForFunction(() => window.AdmiraMarca?.actual()?.id === 'netflix');
  await page.reload();
  await page.waitForFunction(() => window.AdmiraMarca?.actual()?.id === 'netflix');
  await command(page, '/brand admira');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-mb-marca'), null);
  // A separate visitor remains on the default brand.
  const other = await context.newPage();
  await visit(other, '/ecommerce');
  assert.equal(await other.locator('html').getAttribute('data-mb-marca'), null);
});

for (const width of [1440, 390]) test(`home + ecommerce at ${width}px: scoped style, no overflow, rollback`, async t => {
  const {page} = await setup(t, {width,height:1000});
  for (const path of ['/', '/ecommerce']) {
    await visit(page, path);
    const initial = await state(page);
    await command(page, '/brand Netflix');
    assert.equal(await page.locator('html').getAttribute('data-mb-marca'), 'netflix');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.primary').first().evaluate(e=>getComputedStyle(e).backgroundColor), 'rgb(229, 9, 20)');
    if (process.env.NETFLIX_SCREENSHOTS) {
      await mkdir(process.env.NETFLIX_SCREENSHOTS, {recursive:true});
      await page.screenshot({path:resolve(process.env.NETFLIX_SCREENSHOTS, `netflix-${path === '/'?'home':'ecommerce'}-${width}.png`),fullPage:true});
    }
    await page.evaluate(()=>window.YkFrame.open('left'));
    await page.locator('#mb-volver').click();
    assert.deepEqual(await state(page), initial);
  }
});

test('off cancels pending CSS; a failed asset never remembers or partially applies Netflix', async t => {
  let release, seen;
  const gate = new Promise(r=>{release=r;});
  const arrived = new Promise(r=>{seen=r;});
  const {page} = await setup(t, undefined, {route:async (route,url)=>{
    if (!url.pathname.endsWith('yk-marca-netflix.css')) return false;
    seen(); await gate; await route.fulfill({status:200,contentType:'text/css',body:await readFile(resolve(site,'yk-marca-netflix.css'))});return true;
  }});
  await visit(page, '/ecommerce');
  const initial = await state(page);
  await page.evaluate(()=>{window.pendingBrand = window.YkFrame.run('/brand Netflix');});
  await arrived;
  await command(page, '/brand off');
  release();
  await page.evaluate(()=>window.pendingBrand);
  assert.deepEqual(await state(page), initial);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('mb:marca')), null);
  await page.route('**/yk-marca-netflix.css*', r=>r.abort());
  await command(page, '/brand Netflix');
  assert.deepEqual(await state(page), initial);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('mb:marca')), null);
});

test('query rollback preserves incident/hash, native inline style and favicon; unknown brand preserves Netflix', async t => {
  const {page} = await setup(t);
  await visit(page, '/ecommerce');
  await page.evaluate(()=>document.documentElement.style.setProperty('color-scheme','light','important'));
  const initial = await state(page);
  await command(page, '/brand Netflix');
  const active = await state(page);
  await page.route('**/marcablanca/api/marcas/missing-brand', r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));
  await command(page, '/brand missing-brand');
  assert.deepEqual(await state(page), active);
  await page.evaluate(()=>history.replaceState(null,'','?marca=netflix&modo=oscuro&incidencia=INC-42#material'));
  await command(page, '/brand off');
  assert.deepEqual(await state(page), initial);
  assert.equal(page.url(), 'https://admira.app/ecommerce?incidencia=INC-42#material');
  assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyPriority('color-scheme')), 'important');
});
