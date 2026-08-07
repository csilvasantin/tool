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
//
// Y desde que admira.live forma consejeros solo (busca sus vídeos en YouTube y
// los sube al Stock con `#formacion`), una tercera: el material AUTOMÁTICO no
// puede enterrar el CURADO. La ventana son 8 piezas por fecha; sin cuota, una
// sola tanda de YouTube vaciaba de la cabeza del consejero todo lo que Carlos
// había elegido para él.
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

function constante(nombre) {
  const m = source.match(new RegExp(`var ${nombre} = ([^;]+);`));
  assert.ok(m, `falta ${nombre}`);
  return m[1];
}

const COUNCIL_FIXTURE = {
  ceo: { role: "CEO", alias: "Steve Jobs", tag: "stevejobs" },
  cfo: { role: "CFO", alias: "Warren Buffett", tag: "warrenbuffett" },
  cdo: { role: "CDO", alias: "Dieter Rams", tag: "dieterrams" }
};

function api(items, { falla = false, council = COUNCIL_FIXTURE } = {}) {
  const fetchFake = async () => {
    if (falla) throw new Error("pixeria caída");
    return { ok: true, json: async () => items };
  };
  const code = [functionSource("stockIndex"), functionSource("normalizaEtiqueta"),
    functionSource("dedupePorTitulo"), functionSource("pesoEnPrompt"), functionSource("tomaHasta"),
    functionSource("ventanaReservada"), functionSource("sustituyePorApuntes"),
    functionSource("seatKnowledgeFrom"), functionSource("seatKnowledge"),
    functionSource("seatKnowledgeText"), functionSource("ensureCouncilKnowledgeSchema"),
    functionSource("recordCouncilKnowledge")].join("\n");
  return new Function("fetch", "COUNCIL", "COUNCIL_ORDER", "STOCK_INDEX_URL",
    "COUNCIL_KNOWLEDGE_PROMPT_MAX", "COUNCIL_FORMACION_TAG", "COUNCIL_KNOWLEDGE_DADO_SHARE",
    "COUNCIL_APUNTE_TYPE", "COUNCIL_APUNTE_MAX", "COUNCIL_KNOWLEDGE_PROMPT_CHARS",
    "COUNCIL_VIDEO_MAX_SECS", "__name",
    `${code}
     return { piezas:seatKnowledge, ventana:ventanaReservada, texto:seatKnowledgeText,
              indice:stockIndex, reparto:seatKnowledgeFrom, snapshot:recordCouncilKnowledge };`
  )(fetchFake, council, Object.keys(council), eval(constante("STOCK_INDEX_URL")),
    Number(constante("COUNCIL_KNOWLEDGE_PROMPT_MAX")), eval(constante("COUNCIL_FORMACION_TAG")),
    eval(constante("COUNCIL_KNOWLEDGE_DADO_SHARE")), eval(constante("COUNCIL_APUNTE_TYPE")),
    Number(constante("COUNCIL_APUNTE_MAX")), Number(constante("COUNCIL_KNOWLEDGE_PROMPT_CHARS")),
    Number(constante("COUNCIL_VIDEO_MAX_SECS")), () => {});
}

const VIDEO_JOBS = {
  id: "a1", type: "video", createdAt: "2026-08-06T23:26:04.324Z",
  title: "Steve Jobs on Balancing Thinking and Doing", comment: "#stevejobs",
  tags: ["negocio", "emprendimiento", "motivacional", "good", "stevejobs"],
  url: "https://pub-x.r2.dev/stock/a1/asset.mp4"
};

// `dia` ordena: 01 es la más vieja. `formacion` la marca como traída por admira.live.
function pieza(dia, title, { formacion = false, tag = "stevejobs" } = {}) {
  return { id: title + dia, type: "video", createdAt: `2026-08-${String(dia).padStart(2, "0")}T10:00:00.000Z`,
    title, comment: "", tags: formacion ? [tag, "formacion"] : [tag] };
}

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
  const muchas = Array.from({ length: 12 }, (_, i) => pieza(i + 1, "Pieza " + i));
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

// ── LO QUE DIO CARLOS vs LO QUE TRAJO admira.live ──────────────────────────

test("sin #formacion una pieza sigue siendo DADA: lo de antes no cambia de origen", async () => {
  const a = api([VIDEO_JOBS]);
  const [p] = await a.piezas("ceo");
  assert.equal(p.origin, "dado", "el material que ya estaba no se convierte en formación");
});

test("#formacion marca el origen sin sacar la pieza de su silla", async () => {
  const a = api([pieza(6, "Jobs en Stanford", { formacion: true })]);
  const [p] = await a.piezas("ceo");
  assert.equal(p.origin, "formado");
  assert.equal(p.title, "Jobs en Stanford", "sigue siendo conocimiento suyo, solo que traído");
});

test("una tanda de formación NO entierra lo que Carlos eligió a mano", async () => {
  // Lo de Carlos es viejo; la formación, de hoy. Por fecha pura, las 8 más nuevas
  // serían las 8 automáticas y el consejero perdería todo lo curado.
  const dadas = Array.from({ length: 6 }, (_, i) => pieza(i + 1, "Carlos " + i));
  const formadas = Array.from({ length: 20 }, (_, i) => pieza(10 + (i % 15), "YouTube " + i, { formacion: true }));
  const top = await api([...dadas, ...formadas]).piezas("ceo");
  assert.equal(top.length, 8);
  const mias = top.filter((p) => p.origin === "dado");
  assert.equal(mias.length, 5, "el suelo reservado a lo que dio Carlos son 5 de 8");
  assert.equal(top.length - mias.length, 3, "y la formación se queda con los 3 restantes");
  assert.deepEqual(mias.map((p) => p.title), ["Carlos 5", "Carlos 4", "Carlos 3", "Carlos 2", "Carlos 1"],
    "dentro de su cuota siguen mandando las más nuevas");
});

test("el suelo de lo curado no es un techo para la formación", async () => {
  // Carlos solo dio 2 piezas: reservar 5 huecos que nadie llena sería tirar
  // conocimiento a la basura. La formación ocupa lo que sobra.
  const items = [pieza(1, "Carlos 0"), pieza(2, "Carlos 1"),
    ...Array.from({ length: 9 }, (_, i) => pieza(10 + i, "YouTube " + i, { formacion: true }))];
  const top = await api(items).piezas("ceo");
  assert.equal(top.length, 8, "la ventana se llena entera");
  assert.equal(top.filter((p) => p.origin === "dado").length, 2);
  assert.equal(top.filter((p) => p.origin === "formado").length, 6);
});

test("sin formación ninguna, lo dado se queda con la ventana entera", async () => {
  const top = await api(Array.from({ length: 12 }, (_, i) => pieza(i + 1, "Pieza " + i))).piezas("ceo");
  assert.equal(top.length, 8, "la cuota no puede dejar huecos vacíos");
  assert.ok(top.every((p) => p.origin === "dado"));
});

test("la cuota se mantiene cuando la ventana es más pequeña", async () => {
  // generateDecideOptions pide 4, no 8. Si la proporción no acompaña, ahí sí que
  // una tanda automática se lo llevaba todo.
  const items = [...Array.from({ length: 6 }, (_, i) => pieza(i + 1, "Carlos " + i)),
    ...Array.from({ length: 6 }, (_, i) => pieza(10 + i, "YouTube " + i, { formacion: true }))];
  const top = await api(items).piezas("ceo", 4);
  assert.equal(top.length, 4);
  assert.equal(top.filter((p) => p.origin === "dado").length, 3, "3 de 4 para lo curado");
});

test("la misma charla subida cinco veces es UNA pieza", async () => {
  // YouTube devuelve el mismo vídeo repetido; sin esto la silla «sabía» ocho veces
  // lo mismo y el recuento premiaba el volumen, que es lo que un scraper produce.
  const items = Array.from({ length: 5 }, (_, i) => pieza(i + 1, "Steve Jobs: Stay Hungry", { formacion: true }));
  items.push(pieza(6, "  steve jobs: STAY hungry  ", { formacion: true }));
  const todas = await api(items).piezas("ceo", 0);
  assert.equal(todas.length, 1, "el título normalizado es la identidad de la pieza");
  assert.equal(todas[0].at, "2026-08-06T10:00:00.000Z", "gana la más nueva");
});

test("el prompt distingue lo traído de lo dado y ya no atribuye todo a Carlos", async () => {
  const a = api([pieza(2, "Charla curada"), pieza(3, "Charla traída", { formacion: true })]);
  const t = a.texto(await a.piezas("ceo"));
  assert.match(t, /Charla traída \(formación\)/, "la traída se marca");
  assert.doesNotMatch(t, /Charla curada \(formación\)/, "la de Carlos no");
  assert.doesNotMatch(t, /MATERIAL QUE CARLOS TE HA DADO/,
    "con vídeos que Carlos no ha visto, esa frase era mentira");
});

// ── APUNTES: LO QUE APRENDE, NO EL TÍTULO ──────────────────────────────────

function apunte(dia, title, cuerpo, { fuente = "", tag = "stevejobs" } = {}) {
  return { id: "ap" + dia, type: "apunte", createdAt: `2026-08-${String(dia).padStart(2, "0")}T12:00:00.000Z`,
    title, comment: cuerpo, externalRef: fuente, tags: [tag, "formacion"] };
}

test("de un apunte el consejero lee el CUERPO, no el título", async () => {
  const cuerpo = "Rams no dice «menos»: dice menos PERO MEJOR. Quitar es la mitad del trabajo; "
    + "la otra mitad es que lo que queda sea bello. Aplicado a un panel: cada control que "
    + "sobrevive tiene que justificar su sitio y estar bien hecho.";
  const a = api([apunte(6, "Dieter Rams: Less but Better", cuerpo, { tag: "dieterrams" })]);
  const [p] = await a.piezas("cdo");
  assert.equal(p.apunte, true);
  assert.equal(p.note, cuerpo, "el comentario de un apunte ES el conocimiento, no el mecanismo");
  assert.match(a.texto([p]), /menos PERO MEJOR/, "y llega al prompt entero");
});

test("un vídeo con apunte deja de entrar: su título ya no añade nada", async () => {
  const video = pieza(5, "Dieter Rams: Less but Better", { formacion: true, tag: "dieterrams" });
  const nota = apunte(6, "Apunte de Less but Better", "Quitar hasta que solo quede lo esencial.",
    { fuente: video.id, tag: "dieterrams" });
  const todas = await api([video, nota]).piezas("cdo", 0);
  assert.equal(todas.length, 1, "el vídeo sale de la cabeza…");
  assert.equal(todas[0].apunte, true);
  // …pero el apunte conserva a QUÉ pieza apunta: el vídeo sigue siendo su fuente y
  // su evidencia en el Stock, aunque haya dejado de ser lo que el consejero lee.
  assert.equal(todas[0].fuente, "dieterramslessbutbetter5");
});

test("si el apunte no declara fuente, basta con que se llamen igual", async () => {
  // Es como los sube quien transcribe: mismo título, tipo distinto.
  const video = pieza(5, "Jobs en Stanford", { formacion: true });
  const nota = apunte(6, "Jobs en Stanford", "Los puntos solo se unen mirando atrás.");
  const todas = await api([video, nota]).piezas("ceo", 0);
  assert.equal(todas.length, 1);
  assert.equal(todas[0].apunte, true, "gana el apunte, no el vídeo");
});

test("un apunte no se lleva por delante los vídeos de los que NO habla", async () => {
  const nota = apunte(6, "Jobs en Stanford", "Los puntos solo se unen mirando atrás.");
  const otro = pieza(5, "Jobs en la NeXT", { formacion: true });
  const todas = await api([nota, otro]).piezas("ceo", 0);
  assert.equal(todas.length, 2);
});

test("la ventana cuenta caracteres, no piezas: ocho apuntes no son ocho títulos", async () => {
  // Ocho títulos son ~400 caracteres y caben; ocho apuntes son ~5.000 y no.
  const largos = Array.from({ length: 8 }, (_, i) =>
    apunte(i + 1, "Apunte " + i, "x".repeat(880)));
  const top = await api(largos).piezas("ceo");
  assert.ok(top.length < 8, "el tope de 8 piezas ya no manda solo");
  const gasto = top.reduce((n, p) => n + p.title.length + p.note.length + 4, 0);
  assert.ok(gasto <= 3600, `la ventana cabe en el presupuesto (gastó ${gasto})`);
  assert.ok(top.length >= 1, "y nunca deja al consejero sin nada");
});

test("un apunte enorme entra igual antes que dejar la ventana vacía", async () => {
  // Media idea es peor que una idea larga: un apunte cortado no enseña nada.
  const top = await api([apunte(1, "Único", "y".repeat(5000))]).piezas("ceo");
  assert.equal(top.length, 1);
});

test("con títulos cortos el presupuesto no recorta nada: nada cambia para lo de antes", async () => {
  const top = await api(Array.from({ length: 12 }, (_, i) => pieza(i + 1, "Pieza " + i))).piezas("ceo");
  assert.equal(top.length, 8, "el presupuesto no puede estrechar la ventana que ya existía");
});

test("duración y vistas se leen si están y se marca lo que se pasa de 5 minutos", async () => {
  const corto = { ...pieza(5, "Charla corta", { formacion: true }), duration: 280, views: 120000 };
  const largo = { ...pieza(6, "Documental entero", { formacion: true }), duration: 2400, views: 900 };
  const [doc, charla] = await api([corto, largo]).piezas("ceo", 0);
  assert.equal(doc.largo, true, "40 minutos no es un vídeo de formación");
  assert.equal(doc.duracion, 2400);
  assert.equal(charla.largo, false);
  assert.equal(charla.vistas, 120000);
});

test("sin duración en el índice no se descarta nada en silencio", async () => {
  // Hoy el Stock no trae el campo. Excluir por algo que casi siempre falta borraría
  // material bueno; se enseña que no se sabe y ya decide quien mira.
  const [p] = await api([VIDEO_JOBS]).piezas("ceo", 0);
  assert.equal(p.duracion, 0);
  assert.equal(p.largo, false, "desconocido no es «se pasa»");
});

test("el endpoint publica los apuntes y distingue «ninguno largo» de «no se sabe»", () => {
  const ruta = source.slice(source.indexOf('url.pathname === "/council/knowledge"'),
    source.indexOf('url.pathname === "/ideas/generate"'));
  assert.match(ruta, /apuntes: pieces\.filter\(\(p\) => p\.apunte\)\.length/);
  assert.match(ruta, /largos: pieces\.filter\(\(p\) => p\.largo\)\.length/);
  assert.match(ruta, /duracion_conocida: pieces\.some\(\(p\) => p\.duracion > 0\)/,
    "largos:0 sin este campo haría creer que el criterio se cumple");
  assert.match(ruta, /presupuesto: COUNCIL_KNOWLEDGE_PROMPT_CHARS/);
  assert.match(ruta, /video_max_secs: COUNCIL_VIDEO_MAX_SECS/);
});

test("el material entra en las tres cabezas donde el consejero piensa", () => {
  // 1) cuando propone objetivo
  assert.match(functionSource("generateCouncilIdea"),
    /const saber = seatKnowledgeText\(await seatKnowledge\(seat\)\);[\s\S]*Tu punto fuerte es \$\{c\.fuerte\}\.\$\{saber\}/);
  // 2) cuando delibera — cada uno de los seis con el SUYO, no uno común
  const review = functionSource("generateCouncilReview");
  assert.match(review, /const saberes = new Map\(await Promise\.all\(seats\.map/);
  assert.match(review, /lo marcado «formación» se lo trajo admira\.live, el resto se lo dio Carlos/,
    "también al deliberar sabe qué eligió Carlos para él y qué le trajo un buscador");
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
  assert.ok(!tags.includes(eval(constante("COUNCIL_FORMACION_TAG"))),
    "la etiqueta de origen no puede ser además el alias de una silla");
});

// ── EL NIVEL, NO EL MONTÓN (endpoint) ──────────────────────────────────────

test("el recuento por silla se lee sin sesión, que es la constancia", () => {
  const ruta = source.slice(source.indexOf('url.pathname === "/council/knowledge"'),
    source.indexOf('url.pathname === "/ideas/generate"'));
  assert.match(ruta, /seatKnowledgeFrom\(items, s, 0\)/, "el endpoint cuenta TODAS, no las 8 del prompt");
  assert.match(ruta, /count: pieces\.length/);
  assert.match(ruta, /alias: c\.alias, tag: c\.tag/, "dice con qué etiqueta se le da material");
  assert.doesNotMatch(ruta, /sesion|session|requireAuth/i, "lectura pública, como /fleet/turnos");
});

test("el endpoint dice el NIVEL: lo recibido, lo que le cabe y de dónde vino", () => {
  const ruta = source.slice(source.indexOf('url.pathname === "/council/knowledge"'),
    source.indexOf('url.pathname === "/ideas/generate"'));
  assert.match(ruta, /dado: pieces\.length - formado, formado/);
  // Sin enCabeza, una silla con 60 vídeos parecía saber ocho veces más que otra
  // con 8 y leen exactamente lo mismo: el tope del prompt no se ve por ninguna parte.
  assert.match(ruta, /enCabeza: ventanaReservada\(pieces, COUNCIL_KNOWLEDGE_PROMPT_MAX\)\.length/);
  assert.match(ruta, /ultima: pieces\.length \? pieces\[0\]\.at/, "cuándo estudió por última vez");
  assert.match(ruta, /tope: COUNCIL_KNOWLEDGE_PROMPT_MAX/);
  assert.match(ruta, /formacion_tag: COUNCIL_FORMACION_TAG/, "publica la etiqueta con la que se forma");
});

test("el endpoint baja el índice UNA vez para las ocho sillas", () => {
  const ruta = source.slice(source.indexOf('url.pathname === "/council/knowledge"'),
    source.indexOf('url.pathname === "/ideas/generate"'));
  assert.match(ruta, /const items = await stockIndex\(\);/);
  assert.doesNotMatch(ruta, /Promise\.all/, "ocho lecturas del mismo fichero son ocho subpeticiones");
});

test("el índice del Stock se cachea: un ciclo del Consejo son varias llamadas", () => {
  assert.match(functionSource("stockIndex"), /cf: \{ cacheTtl: 600, cacheEverything: true \}/);
});

// ── LA FORMACIÓN COMO EVENTO ───────────────────────────────────────────────

// D1 de mentira: sólo entiende las cuatro consultas del snapshot. Suficiente para
// comprobar lo único que importa aquí, que es CUÁNDO se emite un evento y cuándo no.
function fakeDB() {
  const estado = new Map(), log = [];
  const db = {
    estado, log,
    exec: async () => {},
    prepare(sql) {
      let args = [];
      const stmt = {
        bind: (...a) => { args = a; return stmt; },
        all: async () => ({ results: [...estado.values()].map((r) => ({ seat: r.seat, total: r.total })) }),
        run: async () => {
          if (sql.startsWith("INSERT INTO council_knowledge (")) {
            const [seat, total, dado, formado, at] = args;
            estado.set(seat, { seat, total, dado, formado, at });
          } else if (sql.startsWith("INSERT INTO council_knowledge_log")) {
            const [seat, delta, total, dado, formado, at] = args;
            log.push({ seat, delta, total, dado, formado, at });
          }
        }
      };
      return stmt;
    }
  };
  return db;
}

test("la primera vuelta es censo, no formación: nadie ha estudiado todavía", async () => {
  const db = fakeDB();
  const nuevos = await api([VIDEO_JOBS]).snapshot({ DB: db });
  assert.deepEqual(nuevos, [], "el día del despliegue no puede cantar ocho formaciones falsas");
  assert.equal(db.estado.get("ceo").total, 1, "pero el estado queda guardado");
  assert.equal(db.log.length, 0);
});

test("cuando una silla crece, sale el delta con su origen", async () => {
  const db = fakeDB();
  await api([VIDEO_JOBS]).snapshot({ DB: db });                    // censo inicial
  const despues = [VIDEO_JOBS, pieza(7, "Jobs en la NeXT"), pieza(8, "Jobs sobre foco", { formacion: true })];
  const nuevos = await api(despues).snapshot({ DB: db });
  assert.equal(nuevos.length, 1);
  assert.equal(nuevos[0].seat, "ceo");
  assert.equal(nuevos[0].delta, 2);
  assert.equal(nuevos[0].total, 3);
  assert.equal(nuevos[0].formado, 1, "distingue qué parte trajo admira.live");
  assert.equal(nuevos[0].alias, "Steve Jobs", "el evento se lee con nombre, no con la clave de silla");
  assert.equal(db.log.length, 1, "y queda en la historia, que es lo que se puede mirar luego");
});

test("sin cambios no hay evento: el tick corre cada 2 min y no es una noticia", async () => {
  const db = fakeDB();
  const a = api([VIDEO_JOBS]);
  await a.snapshot({ DB: db });
  assert.deepEqual(await a.snapshot({ DB: db }), []);
  assert.deepEqual(await a.snapshot({ DB: db }), []);
  assert.equal(db.log.length, 0);
});

test("borrar no es aprender: si el Stock baja, no se anuncia formación", async () => {
  const db = fakeDB();
  await api([VIDEO_JOBS, pieza(7, "Jobs en la NeXT")]).snapshot({ DB: db });
  const nuevos = await api([VIDEO_JOBS]).snapshot({ DB: db });
  assert.deepEqual(nuevos, []);
  assert.equal(db.estado.get("ceo").total, 1, "el estado sí baja; lo que no sale es el aviso");
});

test("pixeria caída no borra a nadie ni inventa una formación al volver", async () => {
  const db = fakeDB();
  await api([VIDEO_JOBS, pieza(7, "Jobs en la NeXT")]).snapshot({ DB: db });
  const caida = await api([], { falla: true }).snapshot({ DB: db });
  assert.deepEqual(caida, []);
  assert.equal(db.estado.get("ceo").total, 2,
    "un índice vacío es una ausencia, no la noticia de que el consejero ha olvidado");
  assert.deepEqual(await api([VIDEO_JOBS, pieza(7, "Jobs en la NeXT")]).snapshot({ DB: db }), [],
    "y al volver no se cuentan como nuevas las que ya estaban");
});

test("el snapshot no puede tumbar el tick del Consejo", async () => {
  const roto = { DB: { exec: async () => { throw new Error("D1 caída"); } } };
  assert.deepEqual(await api([VIDEO_JOBS]).snapshot(roto), [],
    "best-effort absoluto: la bitácora de formación nunca impide generar la idea");
});

test("el tick toma el snapshot aunque el hueco de 3h ya tenga idea", () => {
  const tick = functionSource("runCouncilTick");
  // Va ANTES y FUERA del try: el 99% de los ticks encuentran el hueco cubierto y
  // salen por el `return null`. Dentro, la formación solo se miraría 8 veces al día.
  assert.match(tick, /for \(const f of await recordCouncilKnowledge\(env\)\)[\s\S]*?\n  try \{/,
    "el snapshot precede al try de la idea");
});

test("la historia de formación se lee sin sesión, como la bitácora del tick", () => {
  const ruta = source.slice(source.indexOf('url.pathname === "/council/formacion"'),
    source.indexOf('url.pathname === "/council/ticks"'));
  assert.ok(ruta.length > 0, "falta GET /council/formacion");
  assert.match(ruta, /ORDER BY id DESC LIMIT 40/);
  assert.match(ruta, /delta: Number\(r\.delta\)/);
  assert.match(ruta, /alias: c\.alias \|\| ""/, "el evento se lee con nombre de consejero");
  assert.doesNotMatch(ruta, /requireAuth/i, "lectura pública");
});

test("la historia no crece sin fin: se conservan los 100 últimos crecimientos", () => {
  assert.match(functionSource("recordCouncilKnowledge"),
    /DELETE FROM council_knowledge_log WHERE id NOT IN \(SELECT id FROM council_knowledge_log ORDER BY id DESC LIMIT 100\)/);
});
