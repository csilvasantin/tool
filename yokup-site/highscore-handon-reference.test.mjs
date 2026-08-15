import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

// La referencia nació (9b44c8d, 13-ago-2026) para distinguir dos handON: todos
// se llaman igual, así que el título solo no bastaba para saber cuál era cuál.
// El DATO sigue viajando y por eso estas dos comprobaciones no se tocan.
test("la carrera conserva la referencia inequívoca del handON en el modelo",()=>{
  assert.match(html,/reference:item\.reference \|\| ""/);
  assert.match(html,/reference:trabajo\.reference \|\| ""/);
});

// Lo que cambió (Carlos, 15-ago-2026) es que se PINTABA. La calle abría con
// «DCL-msunkvpfosjw:a · » delante del título: clave primaria de la misión más
// código de tarea, ruido para quien mira el marcador y justo en el arranque de
// la única línea que se lee de un vistazo.
//
// Y no era el dato que resolvía el problema que vino a resolver: dos handON
// simultáneos se distinguen por el AGENTE, que cada calle ya pinta a su
// izquierda. El id crudo nunca ayudó a un humano a separarlos; para eso está la
// referencia legible de la norma 5, que vive en la ficha de la misión.
test("la calle de la carrera NO pinta el id interno, ni en el texto ni al pasar el ratón",()=>{
  const raceStart=html.indexOf("function actualizaCarreraPodio(");
  const raceSource=html.slice(raceStart,html.indexOf("\n\n  function pintaFormula",raceStart));
  const rotulo=raceSource.slice(raceSource.indexOf('class="refresh-mission"'));
  const hastaLaMeta=rotulo.slice(0,rotulo.indexOf("refresh-finish"));
  assert.doesNotMatch(hastaLaMeta,/resumen\.reference/,
    "ni el rótulo visible ni su tooltip pueden pintar resumen.reference");
  assert.match(hastaLaMeta,/resumen\.title/,"el rótulo conserva el título del trabajo");
  assert.match(hastaLaMeta,/resumen\.project/,"y el proyecto, que sí dice algo a quien mira");
});

// Quitar el id de la vista solo es gratis mientras la calle siga siendo un
// enlace: ahí es donde queda la trazabilidad. Si alguien la convirtiera en texto
// plano, la referencia sí haría falta — y este test lo cantaría antes.
test("la calle sigue enlazando a la ficha, que es donde vive la referencia",()=>{
  assert.match(html,/resumen\.detailUrl \? '<a class="refresh-mission"/);
});
