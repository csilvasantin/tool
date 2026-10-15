import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = readFileSync(new URL('./ticket.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('const RE_IMG='), html.indexOf('// FLT-101298', html.indexOf('const RE_IMG=')));
const context = vm.createContext({ esc: s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;') });
vm.runInContext(readFileSync(new URL('./yk-foto-marca.js', import.meta.url), 'utf8'), context);
vm.runInContext(source, context);
const render = text => context.cuerpoEvento(text);

test('fotos del Supervisor en frases no incluyen el punto final ni paréntesis', () => {
  const antes = 'https://api.yokup.com/media/fleet/561360052565f8f7.jpeg';
  const negra = 'https://api.yokup.com/media/fleet/da43625b540714fa.jpeg';
  const out = render(`Antes: ${antes}. Apagada: (${negra}). Solo pantalla, sin personas.`);
  assert.ok(out.includes(`src="${antes}"`));
  assert.ok(out.includes(`src="${negra}"`));
  assert.ok(!out.includes('.jpeg.'));
  assert.equal((out.match(/<img /g) || []).length, 2);
  assert.ok(out.includes('Solo pantalla, sin personas.'));
});

test('conserva consultas de adjuntos, deduplica y escapa el texto', () => {
  const url = 'https://api.yokup.com/media/m/prueba.png?sig=a%2Fb.c&size=2';
  const out = render(`<script>alert(1)</script>\n- ${url}\n- ${url}`);
  assert.ok(out.includes('prueba.png?sig=a%2Fb.c&amp;size=2'));
  assert.equal((out.match(/<img /g) || []).length, 1);
  assert.ok(out.includes('&lt;script>'));
  assert.ok(!out.includes('<script>'));
});

test('una nota sin fotos mantiene su texto', () => {
  assert.equal(render('Pantalla recuperada.'), '<div class="et">Pantalla recuperada.</div>');
});

test('el informe de la incidencia muestra las mismas imágenes sin puntuación final', () => {
  const report = readFileSync(new URL('./informe-incidencia.html', import.meta.url), 'utf8');
  const code = report.slice(report.indexOf('const RE_IMG='), report.indexOf('function iniciales', report.indexOf('const RE_IMG=')));
  const ctx = vm.createContext({ esc: context.esc, textoEvento: e => String(e.text || '') });
  ctx.YkFotoMarca = context.YkFotoMarca;
  vm.runInContext(code, ctx);
  const url = 'https://api.yokup.com/media/fleet/da43625b540714fa.jpeg';
  assert.ok(ctx.cuerpo({text:`Apagada: ${url}.`}).includes(`src="${url}"`));
});
