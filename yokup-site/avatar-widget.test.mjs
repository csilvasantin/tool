import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./avatar-widget.js', import.meta.url), 'utf8');
function page({ override = null, loaded = true, iframe = false } = {}) {
  const calls = [], scripts = [];
  const bubble = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const avatar = { floatingCharacters: true, setContext: c => calls.push(['context', c]),
    state: () => ({ override }), show: (open, level) => { calls.push(['show', open, level]); return Promise.resolve(); } };
  const window = { console: { warn() {} } };
  window.self = window; window.top = iframe ? {} : window;
  if (loaded) window.AdmiraAvatar = avatar;
  const document = { documentElement: { lang: 'es' },
    getElementById: id => id === 'da-suite-bubble' ? bubble : null,
    querySelector: () => scripts[0] || null,
    createElement: () => ({ attrs: {}, listeners: {}, setAttribute(k,v) { this.attrs[k] = v; }, addEventListener(k,v) { this.listeners[k] = v; } }),
    head: { appendChild(s) { scripts.push(s); window.AdmiraAvatar = avatar; queueMicrotask(() => s.listeners.load()); } } };
  const context = vm.createContext({ window, document, Promise });
  return { window, document, calls, scripts, bubble, run: () => vm.runInContext(source, context) };
}

test('la presencia de ticket reutiliza Admirito cerrado y el contexto Yokup', async () => {
  const p = page(); p.run(); await p.window.YokupAdmiritoReady;
  assert.equal(p.scripts.length, 0, 'reutiliza el cargador ya presente');
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls)), [['context', { site: 'yokup', sector: 'soporte', lang: 'es', tier: 'good' }], ['show', false, 'good']]);
  assert.equal(p.bubble.attrs['aria-label'], 'Admirito');
  assert.equal(p.bubble.title, 'Admirito');
});

test('el apagado explícito se respeta y no se escribe una nueva preferencia', async () => {
  const p = page({ override: 'off' }); p.run(); await p.window.YokupAdmiritoReady;
  assert.equal(p.calls.filter(c => c[0] === 'show').length, 0);
  assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem)/);
});

test('dos arranques comparten una única carga oficial, sin montar el widget de robot', async () => {
  const p = page({ loaded: false }); p.run(); p.run(); await p.window.YokupAdmiritoReady;
  assert.equal(p.scripts.length, 1);
  assert.match(p.scripts[0].src, /^https:\/\/www\.admiranext\.com\/assets\/avatar\.js\?/);
  assert.equal(p.scripts[0].attrs['data-admira-avatar'], '');
  assert.equal(p.calls.filter(c => c[0] === 'show').length, 1);
  assert.doesNotMatch(source, /digitalavatar\.ai\/embed\.js|\bmount\(|🤖|innerHTML/);
});

test('los previos en iframe no reciben una segunda mascota', () => {
  const p = page({ loaded: false, iframe: true }); p.run();
  assert.equal(p.scripts.length, 0);
  assert.equal(p.window.YokupAdmiritoReady, undefined);
});

test('tickets e incidencias renuevan la caché del adaptador de Admirito', () => {
  for (const name of ['ticket.html', 'incidencias.html']) {
    const html = readFileSync(new URL('./' + name, import.meta.url), 'utf8');
    assert.match(html, /\/avatar-widget\.js\?v=20261014-admirito-1/);
  }
});
