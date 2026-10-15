import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('./yk-foto-marca.js', import.meta.url), 'utf8'), ctx);
const marca = ctx.YkFotoMarca;
const url = 'https://api.yokup.com/media/fleet/abcdef123456.jpeg?size=2&key=a%2Fb';

test('hora de captura individual tiene prioridad y conserva el original y la consulta', () => {
  const out = marca.foto(url + '#captura=' + Date.parse('2026-10-15T06:18:58Z'), Date.parse('2026-10-15T09:00:00Z'));
  assert.ok(out.includes('15/10/2026<br>08:18:58'));
  assert.ok(out.includes('data-origen="captura"'));
  assert.ok(out.includes('href="' + url.replaceAll('&', '&amp;') + '"'));
  assert.ok(!out.includes('#captura='));
});
test('sin captura usa registro identificado, segundos o milisegundos; respeta horario de Madrid', () => {
  const winter = Date.parse('2026-12-15T23:30:04Z');
  assert.equal(marca.foto(url, winter), marca.foto(url, winter / 1000));
  assert.ok(marca.foto(url, winter).includes('<small>Registro</small>16/12/2026<br>00:30:04'));
});
test('sin fecha fiable no inventa la fecha de hoy, ni admite enlaces ejecutables', () => {
  for (const value of [undefined, '', 'incorrecta', Infinity]) assert.ok(!marca.foto(url, value).includes('<time'));
  assert.equal(marca.foto('javascript:alert(1)', Date.now()), '');
});
test('un adjunto con fecha atraviesa los renderizadores de ficha e informe', () => {
  const dated = url + '#captura=' + Date.parse('2026-10-15T06:18:58Z');
  for (const [file, end, call] of [['ticket.html', '// FLT-101298', 'cuerpoEvento(text, ts)'], ['informe-incidencia.html', 'function iniciales', 'cuerpo({text, ts})']]) {
    const html = readFileSync(new URL('./' + file, import.meta.url), 'utf8');
    const start = html.indexOf('const RE_IMG=');
    const sandbox = vm.createContext({ YkFotoMarca: marca, esc: x => x, textoEvento: e => e.text, text: 'Recuperada: ' + dated + '.', ts: Date.now() });
    vm.runInContext(html.slice(start, html.indexOf(end, start)), sandbox);
    const out = vm.runInContext(call, sandbox);
    assert.ok(out.includes('15/10/2026<br>08:18:58'));
    assert.ok(!out.includes('#captura='));
  }
});
