import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Hasta hoy el «skill» de un consejero era UNA frase codificada en COUNCIL
// (`fuerte`), igual para siempre: mejorarla exigía un deploy. Esto lo abre
// (Carlos, 2026-08-07): sube al Stock de pixeria un vídeo, lo etiqueta con el
// nombre del consejero —#stevejobs— y esa pieza está en su cabeza la próxima vez
// que opine.
//
// Dos reglas que no se pueden romper:
//  · SOLO el alias manda. Nada de recoger #negocio «porque es del CFO»: quien
//    decide qué lee cada consejero es quien etiqueta, no una heurística.
//  · Degrada en silencio. Si pixeria no responde, el consejero opina como
//    siempre. El material suma; su ausencia no puede restar.
const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function functionSource(name) {
  let start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `falta ${name}`);
  // sin arrastrar el `async` que va delante, el cuerpo extraído no puede usar await
  if (source.slice(start - 6, start) === "async ") start -= 6;
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} sin cierre`);
}

function api(items, { falla = false } = {}) {
  const fetchFake = async () => {
    if (falla) throw new Error("pixeria caída");
    return { ok: true, json: async () => items };
  };
  const council = {
    ceo: { role: "CEO", alias: "Steve Jobs", tag: "stevejobs" },
    cfo: { role: "CFO", alias: "Warren Buffett", tag: "warrenbuffett" },
    cdo: { role: "CDO", alias: "Dieter Rams", tag: "dieterrams" }
  };
  const url = source.match(/var STOCK_INDEX_URL = "([^"]+)"/)[1];
  const max = source.match(/var COUNCIL_KNOWLEDGE_PROMPT_MAX = (\d+)/)[1];
  const code = [functionSource("stockIndex"), functionSource("normalizaEtiqueta"),
    functionSource("seatKnowledge"), functionSource("seatKnowledgeText")].join("\n");
  return new Function("fetch", "COUNCIL", "STOCK_INDEX_URL", "COUNCIL_KNOWLEDGE_PROMPT_MAX", "__name",
    `${code}\nreturn { piezas:seatKnowledge, texto:seatKnowledgeText, indice:stockIndex };`
  )(fetchFake, council, url, Number(max), () => {});
}

const VIDEO_JOBS = {
  id: "a1", type: "video", createdAt: "2026-08-06T23:26:04.324Z",
  title: "Steve Jobs on Balancing Thinking and Doing", comment: "#stevejobs",
  tags: ["negocio", "emprendimiento", "motivacional", "good", "stevejobs"],
  url: "https://pub-x.r2.dev/stock/a1/asset.mp4"
};

test("una pieza etiquetada con el alias es conocimiento de ESA silla", async () => {
  const a = api([VIDEO_JOBS]);
  const mias = await a.piezas("ceo");
  assert.equal(mias.length, 1);
  assert.equal(mias[0].title, "Steve Jobs on Balancing Thinking and Doing");
  assert.equal(mias[0].type, "video");
  assert.equal((await a.piezas("cfo")).length, 0, "y de ninguna otra");
});

test("solo manda el alias: las etiquetas del terreno no reparten material", async () => {
  // El vídeo lleva #negocio, que es el terreno del CFO. No basta: no es suyo.
  const a = api([VIDEO_JOBS]);
  assert.equal((await a.piezas("cfo")).length, 0,
    "#negocio no le da al CFO una pieza que Carlos etiquetó para Jobs");
});

test("el comentario que solo repite la etiqueta no entra como conocimiento", async () => {
  const a = api([VIDEO_JOBS]);
  const [p] = await a.piezas("ceo");
  assert.equal(p.note, "", "«#stevejobs» es el mecanismo, no lo que enseña");
  assert.match(a.texto([p]), /Steve Jobs on Balancing Thinking and Doing/);
  assert.doesNotMatch(a.texto([p]), /#stevejobs/);
});

test("manda lo más nuevo y el prompt se recorta al tope", async () => {
  const muchas = Array.from({ length: 12 }, (_, i) => ({
    id: "x" + i, type: "video", createdAt: `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
    title: "Pieza " + i, comment: "", tags: ["stevejobs"]
  }));
  const a = api(muchas);
  const top = await a.piezas("ceo");
  assert.equal(top.length, 8, "COUNCIL_KNOWLEDGE_PROMPT_MAX");
  assert.equal(top[0].title, "Pieza 11", "la más reciente primero");
  assert.equal((await a.piezas("ceo", 0)).length, 12, "limit 0 = todas (para el endpoint)");
});

test("una silla sin material no ensucia el prompt con un bloque vacío", async () => {
  const a = api([VIDEO_JOBS]);
  assert.equal(a.texto(await a.piezas("cdo")), "");
  assert.equal(a.texto([]), "");
  assert.equal(a.texto(null), "");
});

test("si pixeria no responde, el consejero opina igual", async () => {
  const a = api([], { falla: true });
  assert.deepEqual(await a.indice(), [], "el fallo se traga, no se propaga");
  assert.deepEqual(await a.piezas("ceo"), []);
  assert.equal(a.texto(await a.piezas("ceo")), "", "sin material el prompt queda como estaba");
});

test("el material entra en las tres cabezas donde el consejero piensa", () => {
  // 1) cuando propone objetivo
  assert.match(functionSource("generateCouncilIdea"),
    /const saber = seatKnowledgeText\(await seatKnowledge\(seat\)\);[\s\S]*Tu punto fuerte es \$\{c\.fuerte\}\.\$\{saber\}/);
  // 2) cuando delibera — cada uno de los seis con el SUYO, no uno común
  const review = functionSource("generateCouncilReview");
  assert.match(review, /const saberes = new Map\(await Promise\.all\(seats\.map/);
  assert.match(review, /material que le dio Carlos/);
  // 3) cuando salen las 3 opciones de la ventana, con el de la silla que propuso
  assert.match(functionSource("generateDecideOptions"),
    /const saber = seatKnowledgeText\(await seatKnowledge\(idea\.seat, 4\)\);/);
});

test("las ocho sillas tienen etiqueta, distinta y sin acentos ni espacios", () => {
  const tags = [...source.matchAll(/^\s{2}(?:ceo|cto|coo|cfo|cco|cdo|cxo|cso): \{ role: "[A-Z]+", alias: "[^"]+", tag: "([^"]+)"/gm)]
    .map((m) => m[1]);
  assert.equal(tags.length, 8, "las ocho sillas declaran su etiqueta de pixeria");
  assert.equal(new Set(tags).size, 8, "sin colisiones: dos sillas no comparten material");
  for (const t of tags) assert.match(t, /^[a-z0-9]+$/, `«${t}» tiene que poder escribirse como #etiqueta`);
});

test("el recuento por silla se lee sin sesión, que es la constancia", () => {
  const ruta = source.slice(source.indexOf('url.pathname === "/council/knowledge"'),
    source.indexOf('url.pathname === "/ideas/generate"'));
  assert.match(ruta, /seatKnowledge\(s, 0\)/, "el endpoint cuenta TODAS, no las 8 del prompt");
  assert.match(ruta, /count: pieces\.length/);
  assert.match(ruta, /alias: c\.alias, tag: c\.tag/, "dice con qué etiqueta se le da material");
  assert.doesNotMatch(ruta, /sesion|session|requireAuth/i, "lectura pública, como /fleet/turnos");
});

test("el índice del Stock se cachea: un ciclo del Consejo son varias llamadas", () => {
  assert.match(functionSource("stockIndex"), /cf: \{ cacheTtl: 600, cacheEverything: true \}/);
});
