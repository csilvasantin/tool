import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./yk-frame.js', import.meta.url), 'utf8');
const bootstrap = source.slice(source.indexOf('    var nativeAppDemo = false;'), source.indexOf('    icoL.setAttribute("aria-controls"'));
assert.ok(bootstrap.includes('var axCfg'), 'exercise the actual frame loader');
const current = 'https://www.admiranext.com/suite/experto.js?v=20261007-native-demo-control-1';
const legacy = 'https://www.admiranext.com/suite/experto.js?v=20261007-pill-1';

function page(url, {fleet = false, existing = null} = {}) {
  const location = new URL(url), nodes = existing ? [existing] : [];
  const document = {
    getElementById: id => nodes.find(n => n.id === id),
    querySelector: () => nodes.find(n => n.tag === 'script' && n.src?.startsWith('https://www.admiranext.com/suite/experto.js')),
    createElement: tag => ({tag, attrs: {}, setAttribute(k, v) {this.attrs[k] = v;}}),
    head: {appendChild: n => nodes.push(n)}
  };
  const context = vm.createContext({document, location, URLSearchParams, FLEET_MODE: fleet,
    fetch() {throw Error('bootstrap must not call APIs');}});
  return {nodes, run: () => vm.runInContext(bootstrap, context), engines: () => nodes.filter(n => n.tag === 'script')};
}

test('App launch uses the fixed engine and retains the real local CLI mount', () => {
  for (const host of ['admira.app', 'www.admira.app', 'yokup.com', 'www.yokup.com']) {
    const p = page(`https://${host}/retailer?marca=starbucks&ax_demo=app`); p.run();
    const [engine] = p.engines(); assert.equal(p.engines().length, 1);
    assert.equal(engine.src, current); assert.equal(engine.attrs['data-pata'], 'admira.app');
    assert.equal(engine.attrs['data-admira-demo-engine'], ''); assert.equal(engine.defer, true);
    assert.equal(engine.attrs['data-panel'], '#yk-rail-bottom');
    assert.equal(engine.attrs['data-input'], '.yk-lcli-input');
    assert.equal(engine.attrs['data-form'], '.yk-lcli-form');
  }
});

test('normal visits, wrong platform and untrusted hosts preserve the legacy pin', () => {
  for (const url of ['https://www.admira.app/', 'https://www.admira.app/?ax_demo=biz',
    'https://www.admira.app/?ax_demo=app-other', 'https://www.yokup.com/?ax_demo=biz',
    'https://admira.app.evil.example/?ax_demo=app', 'https://sub.admira.app/?ax_demo=app',
    'https://localhost/?ax_demo=app']) {
    const p = page(url); p.run(); const [engine] = p.engines();
    assert.equal(engine.src, legacy, url); assert.equal(engine.attrs['data-pata'], undefined);
    assert.equal(engine.attrs['data-admira-demo-engine'], undefined);
  }
});

test('frame remount and existing engine never create a second engine', () => {
  const p = page('https://www.admira.app/?ax_demo=app'); p.run(); p.run();
  assert.equal(p.engines().length, 1);
  const existing = {tag:'script', src:current};
  const reused = page('https://www.admira.app/?ax_demo=app', {existing}); reused.run();
  assert.deepEqual(reused.engines(), [existing]); assert.equal(reused.nodes.length, 1);
});

test('fleet console remains independent and retailer loads the same frame', () => {
  const p = page('https://www.admira.app/retailer?ax_demo=app', {fleet:true}); p.run();
  assert.equal(p.nodes.length, 0);
  const html = readFileSync(new URL('./retailer.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\/yk-frame\.js\?v=/);
  assert.match(html, /id="workspace" hidden/);
});

// These assets are immutable for one year: changed source needs a new browser URL.
test('native entry pages request a fresh frame URL instead of the immutable old pin', () => {
  const expected = '/yk-frame.js?v=20261010-lang-5491';
  for (const file of ['index.html', 'retailer.html']) {
    const html = readFileSync(new URL('./' + file, import.meta.url), 'utf8');
    assert.ok(html.includes(expected), file);
    assert.ok(!html.includes('/yk-frame.js?v=r35'), file);
  }
});
