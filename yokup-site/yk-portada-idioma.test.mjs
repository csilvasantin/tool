// Portada de admira.app / yokup.com sin modo Experto (Carlos, 15-oct-2026): en el sitio de ⌘ la pastilla
// de idioma ENG/ESP con su misma caja; las demás páginas conservan ⌘.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frame = readFileSync(new URL('./yk-frame.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./yk-frame.css', import.meta.url), 'utf8');

test('only the home page swaps ⌘ for the language pill; other pages keep ⌘', () => {
  assert.match(frame, /bar\.appendChild\(icoR\);\s+if \(esPortadaYk\(\)\) bar\.appendChild\(pastillaIdioma\(\)\);\s+else bar\.appendChild\(icoB\);/);
  const fn = frame.slice(frame.indexOf('function esPortadaYk()'), frame.indexOf('function pastillaIdioma()'));
  assert.match(fn, /window\.top !== window\.self\) return false/);
  assert.match(fn, /\(embed\|ax_demo\)=/, 'embeds and the demo walkthrough keep Expert');
  assert.match(fn, /location\.pathname === "\/" \|\| location\.pathname === "\/index\.html"/);
});

test('the pill is a same-box .yk-ico with the compact zoom, not a panel toggle nor the Expert hook', () => {
  const fn = frame.slice(frame.indexOf('function pastillaIdioma()'), frame.indexOf('function demoIdiomaPortada()'));
  assert.match(fn, /b\.className = "yk-ico yk-ico-lang"/);
  assert.match(fn, /setAttribute\("data-admira-compact-control", ""\)/);
  assert.doesNotMatch(fn, /data-yk-panel|yk-ico-exp/);
  assert.match(fn, /b\.textContent = en \? "ESP" : "ENG"/);
  assert.match(fn, /window\.AdmiraSetLanguage\(destino\)/);
  assert.match(fn, /window\.YkIdioma\.aplicar\(destino\)/);
  assert.match(css, /\.yk-ico-lang\{ box-sizing: border-box; width: 35px; padding: 0; justify-content: center;/);
});

test('admira.app home places the protected DMZ entry immediately beside language',()=>{
 assert.match(frame,/login\.href = "\/conversar"/);
 assert.match(frame,/bar\.appendChild\(login\);\s+bar\.appendChild\(pastillaIdioma\(\)\)/);
 assert.match(frame,/login\.textContent = localEn\(\) \? "Sign in" : "Entrar"/);
});
