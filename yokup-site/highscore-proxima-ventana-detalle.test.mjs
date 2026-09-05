import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// En la fila desplegada del highscore, a la DERECHA DE PUNTOS, cuánto le queda
// al agente para poder abrir su siguiente ventana de decisión (Carlos,
// 2026-08-07). La cadena de la izquierda cuenta lo que ya hizo; esto mira hacia
// adelante.
//
// LA REGLA DURA: desde el reparto por turnos, poder abrir son DOS condiciones
// —la hora cumplida Y su franja— y manda la más tardía. Contar aquí sólo el
// cupo diría «AHORA» a un agente que aún tiene que esperar su turno: una cifra
// amable y falsa. Por eso el número sale de /fleet/turnos, que es exactamente
// lo que aplica el worker, y cuando no responde se cae al cupo DICIÉNDOLO.
const source = await readFile(new URL("./highscore.html", import.meta.url), "utf8");
const identitySource = await readFile(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const identityContext = vm.createContext({});
vm.runInContext(identitySource, identityContext);

function cuerpo(nombre) {
  const inicio = source.indexOf(`function ${nombre}(`);
  assert.notEqual(inicio, -1, `falta ${nombre}`);
  const llave = source.indexOf("{", inicio);
  let nivel = 0, comilla = "", escapado = false;
  for (let i = llave; i < source.length; i += 1) {
    const c = source[i];
    if (comilla) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === comilla) comilla = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { comilla = c; continue; }
    if (c === "{") nivel += 1;
    else if (c === "}" && --nivel === 0) return source.slice(inicio, i + 1);
  }
  throw new Error(`${nombre} incompleta`);
}

function api({ decisiones = [], turnos = null } = {}) {
  const cabecera = source.slice(source.indexOf("var TIME_ZONE"), source.indexOf("function claveDia"));
  const ventanaMs = source.match(/var VENTANA_MS = [^;]+;/)[0];
  const codigo = cabecera + ventanaMs + ["comoMs", "mismoAgenteVentana", "ventanaHoraria", "faltaTexto",
    "horaCorta", "tituloVentana", "turnoDeAgente", "proximaVentana", "textoProximaVentana",
    "tituloProximaVentana", "etiquetaProximaVentana", "proximaVentanaHtml"].map(cuerpo).join("\n");
  return new Function("datos", "window", "normaliza", "esc",
    `${codigo}\nreturn { proxima:proximaVentana, texto:textoProximaVentana, titulo:tituloProximaVentana,
      etiqueta:etiquetaProximaVentana, html:proximaVentanaHtml };`
  )({ decisiones, turnos }, { ykAgentIdentity: identityContext.ykAgentIdentity },
    (v) => String(v == null ? "" : v).trim(),
    (v) => String(v == null ? "" : v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"));
}

const NEO = { agente:"NeoMBACrema", base:"Neo", suffix:"MBACrema" };

function reparto(turnos, agentes = 8, pasoMin = 8) {
  return { ok:true, agentes, pasoMin, turnos };
}

test("manda el reparto: con la hora cumplida pero fuera de su franja, sigue esperando", () => {
  const ahora = Date.now();
  // El cupo está cumplido (su última ventana fue hace 70 min) pero su turno no
  // llega hasta dentro de 4 min. Contar sólo el cupo diría AHORA, y mentiría.
  const a = api({
    decisiones:[{ agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora - 70 * 60000, parent_decision:"" }],
    turnos:reparto([{ agent:"NeoMBACrema", turno:4, offsetMin:23, proxima:ahora + 4 * 60000 }])
  });
  const p = a.proxima(NEO);
  assert.equal(p.fuente, "turnos");
  assert.equal(a.texto(p, ahora), "en 4:00");
  assert.match(a.titulo(p, ahora), /Turno 4 de 8 · una ventana cada 8 min · abre dentro de 4:00/);
});

test("cuando tiene la hora Y le toca, dice AHORA", () => {
  const ahora = Date.now();
  const a = api({ turnos:reparto([{ agent:"NeoMBACrema", turno:4, offsetMin:23, proxima:ahora - 1000 }]) });
  const p = a.proxima(NEO);
  assert.equal(a.texto(p, ahora), "AHORA");
  assert.match(a.titulo(p, ahora), /puede abrir AHORA: tiene la hora cumplida y le toca/);
  assert.match(a.html(p), /class="progression-step next-window libre"/);
});

test("sin reparto se cae al cupo local, y el título no finge que sabe más", () => {
  const ahora = Date.now();
  const a = api({
    decisiones:[{ agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora - 15 * 60000, parent_decision:"" }],
    turnos:null
  });
  const p = a.proxima(NEO);
  assert.equal(p.fuente, "cupo");
  assert.equal(a.texto(p, ahora), "en 45:00");
  assert.match(a.titulo(p, ahora), /reparto por turnos no disponible, así que esto sólo cuenta su cupo/);
  // y con la hora cumplida tampoco promete la ventana: no puede confirmar la franja
  const cumplida = api({ decisiones:[], turnos:null });
  assert.match(cumplida.titulo(cumplida.proxima(NEO), ahora),
    /sin el reparto por turnos no se puede confirmar que sea su franja/);
});

test("el reparto de OTRO agente no se le adjudica a éste", () => {
  const ahora = Date.now();
  const a = api({ turnos:reparto([
    { agent:"NeoMacMini", turno:3, offsetMin:15, proxima:ahora + 30 * 60000 },
    { agent:"NeoMBACrema", turno:4, offsetMin:23, proxima:ahora + 2 * 60000 }
  ]) });
  assert.equal(a.texto(a.proxima(NEO), ahora), "en 2:00", "comparten persona, no equipo");
});

test("el bloque lleva su estado en el marcado, no sólo en el color", () => {
  const ahora = Date.now(), cuando = ahora + 20 * 60000;
  const a = api({ turnos:reparto([{ agent:"NeoMBACrema", turno:4, offsetMin:23, proxima:cuando }]) });
  const html = a.html(a.proxima(NEO));
  assert.match(html, /role="listitem"/);
  assert.match(html, /data-stage="proxima"/);
  assert.match(html, /data-yk-nextwindow="1"/, "sin marca el tic no la encuentra");
  assert.match(html, new RegExp(`data-proxima="${cuando}"`), "el tic recuenta desde el instante, no desde un resto");
  assert.match(html, /data-fuente="turnos" data-turno="4" data-agentes="8" data-paso="8"/);
  assert.match(html, /aria-label="Siguiente ventana de decisión · en 20:00\. Turno 4 de 8/);
  assert.match(html, /<span class="progression-label">Siguiente<\/span>/);
});

test("va a la derecha de PUNTOS, después de las cinco etapas", () => {
  assert.match(cuerpo("progresionHtml"), /\}\)\.join\(""\) \+ proximaVentanaHtml\(proxima\) \+ '<\/div>'/);
  assert.match(cuerpo("progresionHtml"), /var proxima = proximaVentana\(a\);/);
  // la rejilla tiene que dejarle sitio: meta + cinco etapas + la siguiente ventana
  assert.match(source, /\.progression\{[^}]*grid-template-columns:minmax\(104px,\.8fr\) repeat\(6,minmax\(82px,1fr\)\)/s);
  assert.match(source, /@media \(max-width:620px\)[\s\S]*\.progression\{grid-template-columns:88px repeat\(6,76px\);min-width:580px/);
  // no es una etapa de la cadena: ni hilo que la una a PUNTOS ni aro macizo
  assert.match(source, /\.progression-step\.next-window::before\{display:none\}/);
  assert.match(source, /\.progression-step\.next-window \.progression-dot\{border-style:dashed\}/);
  assert.match(source, /\.progression-step\.next-window\.libre\{color:var\(--good\)\}/);
});

test("la cuenta atrás corre sola cada segundo y no pide datos ni pinta lo oculto", () => {
  assert.match(source, /window\.setInterval\(ticProximaVentana, 1000\)/,
    "a quince segundos una cuenta atrás parece colgada");
  const tic = cuerpo("ticProximaVentana");
  assert.doesNotMatch(tic, /seguroYokup|fetch\(/, "el tic no puede pedir datos");
  assert.match(tic, /if \(!chips\.length\) return;/);
  assert.match(tic, /if \(fila && fila\.hidden\) return;/, "las filas plegadas no se repintan");
  assert.match(tic, /c\.classList\.toggle\("libre", p\.proxima <= ahora\)/, "al llegarle el turno se pone verde sola");
  assert.match(tic, /valor\.textContent = texto/);
});

test("el reparto se pide al cargar y en cada refresco, y degrada en silencio", () => {
  const peticiones = source.match(/seguroYokup\("\/fleet\/turnos", function \(d\) \{ return d && d\.ok \? d : null; \}\)/g) || [];
  assert.equal(peticiones.length, 2, "carga inicial y refresco");
  assert.match(source, /datos\.turnos = r\[7\] \|\| null;/, "en la carga, ausente es ausente");
  assert.match(source, /if \(r\[7\]\) datos\.turnos = r\[7\];/,
    "en el refresco se conserva el anterior: envejece mejor que caer al cupo");
  assert.match(source, /turnos: null, historial: null, historialFresh: false \}/, "declarado en el estado, no inventado al vuelo");
});
