import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerPlanExplicito, palabrasDeContenido, subtareaRespaldada, flattenSteps } from './src/index.js';

// ── El encargo que ya trae su plan se OBEDECE, no se reinventa ───────────────
test('lee el plan a·b·c que el propio encargo escribe', () => {
  const enc = "Mejorar la comunicacion por Telegram. a) Auditar el canal: medir el bot-inbox. " +
              "b) Diagnosticar por que un mensaje no llega. c) Entregar mejoras y reportar.";
  const p = extraerPlanExplicito(enc);
  assert.equal(p.length, 3);
  assert.match(p[0].title, /Auditar el canal/);
  assert.match(p[1].title, /Diagnosticar/);
});

test('un encargo en prosa no finge tener plan: pasa a la IA', () => {
  assert.equal(extraerPlanExplicito(
    "Migrar el agente principal de Claude de Neo a Link y hacerlo canonico en el censo."), null);
});

test('una sola marca no es un plan (una frase puede empezar por «a)»)', () => {
  assert.equal(extraerPlanExplicito("Arreglar el worker. a) empezar por el webhook."), null);
});

test('marcas desordenadas no cuelan como plan', () => {
  assert.equal(extraerPlanExplicito("Mira el punto c) y luego el a) si eso."), null);
});

// ── No se rellena el arbol con trabajo inventado ─────────────────────────────
const MOLDE = [{ title: "Preparar: alcance y punto de partida" },
               { title: "Ejecutar el encargo" },
               { title: "Verificar y reportar" }];

test('un plan corto NO se rellena con el molde: solo se garantiza la c', () => {
  const t = flattenSteps([{ title: "Cambiar la identidad canonica" }], MOLDE, "cambiar la identidad canonica");
  assert.deepEqual(t.map((x) => x.code), ["a", "b"]);
  assert.equal(t[0].title, "Cambiar la identidad canonica");
  assert.match(t[1].title, /Verificar y reportar/);
  // lo que NO puede aparecer: trabajo de molde que nadie pidio
  assert.ok(!t.some((x) => /Ejecutar el encargo|alcance y punto de partida/.test(x.title)));
});

test('cero subtareas es una respuesta valida: el plan no se ensancha', () => {
  const t = flattenSteps([{ title: "Renombrar al agente", subtasks: [] }], MOLDE, "renombrar al agente");
  assert.equal(t.filter((x) => x.code.length === 2).length, 0);
});

// ── El filtro de respaldo, medido contra las misiones que se envenenaron ─────
test('caza las subtareas inventadas de FLT-1487', () => {
  const enc = "Migrar el agente principal de Claude con la cuenta csilva@admira.com de Neo a " +
              "Link (miembro de The Matrix) y hacerlo canonico en todo el censo de agentes y maquinas.";
  const V = palabrasDeContenido(enc);
  for (const inventada of ["Conectar con Neo", "Descargar configuracion", "Subir configuracion", "Asignar permisos"]) {
    assert.equal(subtareaRespaldada(inventada, V, false), false, `deberia caerse: ${inventada}`);
  }
  assert.equal(subtareaRespaldada("Identificar cuenta csilva", V, false), true);
});

test('caza el procedimiento generico de FLT-1490 sin perder lo real', () => {
  const V = palabrasDeContenido(
    "El apellido de maquina deja de ser parte del identificador del agente y pasa a ser un dato aparte.");
  for (const inventada of ["Recompilar software", "Actualizar base de datos", "Crear campo para alt de informacion"]) {
    assert.equal(subtareaRespaldada(inventada, V, false), false, `deberia caerse: ${inventada}`);
  }
  assert.equal(subtareaRespaldada("Eliminar apellido de maquina", V, false), true);
  // «identificacion» vs «identificador»: misma raiz, no puede perderse por una letra
  assert.equal(subtareaRespaldada("Actualizar codigo de identificacion", V, false), true);
});

test('el paso c queda exento: verificar y reportar es doctrina, no encargo', () => {
  const V = palabrasDeContenido("Migrar el agente principal de Neo a Link.");
  for (const cierre of ["Verificar funcionalidad", "Publicar resultado en URL", "Notificar a Carlos"]) {
    assert.equal(subtareaRespaldada(cierre, V, true), true, `el cierre no se filtra: ${cierre}`);
    // ...pero fuera del paso c, sin respaldo, si se cae
    assert.equal(subtareaRespaldada(cierre, V, false), false);
  }
});
