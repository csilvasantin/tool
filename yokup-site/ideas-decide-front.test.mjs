import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const objetivos = await readFile(new URL('./objetivos.html', import.meta.url), 'utf8');
const ideas = await readFile(new URL('./ideas.html', import.meta.url), 'utf8');

for (const [name, src] of [['objetivos.html', () => objetivos], ['ideas.html', () => ideas]]) {
  test(name + ': «→ misión» llama a decide() (POST /ideas/decide), no a promote()', () => {
    const s = src();
    assert.match(s, /async function decide\(id\)\{/);
    assert.match(s, /fetch\(WORKER\+"\/ideas\/decide"/);
    assert.match(s, /else if\(m\)\{ decide\(m\.dataset\.mis\); \}/);
  });
  test(name + ': feedback inmediato de ventana abierta + enlace a /decisiones', () => {
    const s = src();
    assert.match(s, /⏳ ventana abierta · 3 min → \/decisiones/);
    assert.match(s, /Abriendo ventana de decisión…/);
  });
  test(name + ': una decisión viva se refleja con ⏳ y no reabre', () => {
    const s = src();
    assert.match(s, /function hasDecision\(i\)\{ return !!\(i&&i\.decision_id\)&&i\.status!=="mision"&&!i\.mission_id; \}/);
    assert.match(s, /if\(it\.mission_id\|\|hasDecision\(it\)\) return;/);
    assert.match(s, /error==="live_decision"/);
    assert.match(s, /⏳ decisión ↗/);
    assert.match(s, /href="\/decisiones"/);
  });
  test(name + ': el chip ⏳ sólo sale cuando hay decisión y aún no es misión', () => {
    const s = src();
    // El botón «→ misión» se oculta cuando pend; en su lugar va el chip a /decisiones.
    assert.match(s, /const pend=hasDecision\(i\);/);
    assert.match(s, /!isMis&&!pend\?'<button class="mis"/);
    assert.match(s, /\.flt\.pend\{color:#e0a63a/);
  });
  test(name + ': promote() y /ideas/promote siguen existiendo (enlace a mano)', () => {
    const s = src();
    assert.match(s, /async function promote\(id\)\{/);
    assert.match(s, /fetch\(WORKER\+"\/ideas\/promote"/);
  });
}
