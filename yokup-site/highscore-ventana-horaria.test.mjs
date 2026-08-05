import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Bajo cada agente hay una línea que avanza con la hora natural de Madrid: al
// entrar la hora en punto vuelve a poder abrir su ventana de decisión autónoma
// si Carlos no le ha dicho nada (Carlos, 2026-08-05).
//
// La trampa que hay que evitar: NO son «60 minutos desde la última ventana». La
// norma 10 y el worker limitan a UNA POR HORA NATURAL (madridHourKey), así que
// quien abre a las 11:05 vuelve a poder a las 12:00, no a las 12:05. Pintar una
// cuenta atrás de 60 min sería mentir con una barra bonita.
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

function api(decisiones) {
  const cabecera = source.slice(source.indexOf("var TIME_ZONE"), source.indexOf("function claveDia"));
  const codigo = cabecera + ["comoMs", "mismoAgenteVentana", "ventanaHoraria", "tonoVentana",
    "faltaTexto", "horaCorta", "tituloVentana"].map(cuerpo).join("\n");
  return new Function("datos", "window", "normaliza", "esc",
    `${codigo}\n${cuerpo("relojVentanaHtml")}\nreturn { ventana:ventanaHoraria, tono:tonoVentana, titulo:tituloVentana, clave:claveHora, dentro:dentroDeLaHora, html:relojVentanaHtml };`
  )({ decisiones }, { ykAgentIdentity: identityContext.ykAgentIdentity },
    (v) => String(v == null ? "" : v).trim(),
    (v) => String(v == null ? "" : v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"));
}

const NEO = { agente:"NeoMBACrema", base:"Neo", suffix:"MBACrema" };
const TRINITY = { agente:"TrinityMBAAzul", base:"Trinity", suffix:"MBAAzul" };

test("la clave es la HORA NATURAL de Madrid, no una ventana móvil de 60 min", () => {
  const a = api([]);
  // 2026-08-05 11:05 y 11:59 UTC+2 caen en la MISMA hora; 12:00 ya no
  const once05 = Date.UTC(2026, 7, 5, 9, 5), once59 = Date.UTC(2026, 7, 5, 9, 59);
  const doce00 = Date.UTC(2026, 7, 5, 10, 0);
  assert.equal(a.clave(once05), a.clave(once59), "11:05 y 11:59 son la misma hora natural");
  assert.notEqual(a.clave(once59), a.clave(doce00), "a las 12:00 empieza otra hora");
  assert.equal(a.clave(once05), "2026-08-05T11");
});

test("los minutos se leen en Madrid, no en el reloj local", () => {
  const a = api([]);
  assert.equal(a.dentro(Date.UTC(2026, 7, 5, 9, 0, 0)), 0, "las 11:00 en punto: hora recién empezada");
  assert.equal(a.dentro(Date.UTC(2026, 7, 5, 9, 30, 0)), 30 * 60000);
  assert.equal(a.dentro(Date.UTC(2026, 7, 5, 9, 59, 30)), 59 * 60000 + 30000);
});

test("una ventana abierta esta hora marca al agente; la de otra hora no", () => {
  const ahora = Date.now();
  const a = api([
    { agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora, parent_decision:"" },
    { agent:"TrinityMBAAzul", machine:"MacBookAirAzul", created_at:ahora - 7200000, parent_decision:"" },
  ]);
  assert.equal(a.ventana(NEO).abierta, true);
  assert.equal(a.ventana(TRINITY).abierta, false, "la de hace dos horas no consume la hora actual");
});

test("una CONTINUACIÓN no consume la hora — sólo las raíces", () => {
  const ahora = Date.now();
  const a = api([{ agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora, parent_decision:"DEC-abc" }]);
  assert.equal(a.ventana(NEO).abierta, false,
    "el worker sólo cuenta parent_decision vacío; la línea tiene que decir lo mismo");
});

test("la ventana de un agente no se le atribuye a otro de la misma persona", () => {
  const ahora = Date.now();
  const a = api([{ agent:"NeoMBP16", machine:"MacBook Pro 16", created_at:ahora, parent_decision:"" }]);
  assert.equal(a.ventana(NEO).abierta, false, "NeoMBP16 no es NeoMBACrema");
});

test("el tono evoluciona de cian a ámbar con el progreso", () => {
  const a = api([]);
  assert.equal(a.tono(0), 186, "cian al empezar la hora");
  assert.equal(a.tono(1), 38, "ámbar al filo de las en punto");
  assert.ok(a.tono(0.5) < a.tono(0) && a.tono(0.5) > a.tono(1), "y evoluciona, no salta");
  // fuera de rango no se sale de la escala
  assert.equal(a.tono(-5), 186);
  assert.equal(a.tono(9), 38);
});

test("el título dice la verdad en cada estado", () => {
  const a = api([]);
  assert.match(a.titulo({ abierta:false, at:0, restante:0 }),
    /Puede abrir su ventana autónoma AHORA/);
  assert.match(a.titulo({ abierta:true, at:Date.UTC(2026, 7, 5, 9, 5), restante:55 * 60000 }),
    /Abrió su ventana a las 11:05 · la siguiente al entrar la hora en punto, dentro de 55:00/);
});

test("el marcado lleva estado accesible y el degradado en el relleno", () => {
  const ahora = Date.now();
  const abierta = api([{ agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora, parent_decision:"" }]).html(NEO);
  assert.match(abierta, /class="hourbar"/);
  assert.match(abierta, /data-abierta="1"/);
  assert.match(abierta, /role="img"/);
  assert.match(abierta, /aria-label="Abrió su ventana/);
  assert.match(abierta, /background:linear-gradient\(90deg,hsl\(186 92% 64%\),hsl\(\d+ 92% 64%\)\)/);

  const libre = api([]).html(NEO);
  assert.match(libre, /class="hourbar libre"/);
  assert.match(libre, /data-abierta="0"/);
  assert.match(libre, /aria-label="Puede abrir su ventana autónoma AHORA/);
});

test("la línea vive bajo el agente y se refresca sola sin volver a pedir datos", () => {
  assert.match(source, /relojVentanaHtml\(a\) \+ '<\/td>'/, "va dentro de la celda del agente");
  assert.match(source, /window\.setInterval\(ticVentanas, 15000\)/);
  const tic = cuerpo("ticVentanas");
  assert.doesNotMatch(tic, /seguroYokup|fetch\(/, "el tic no puede pedir datos");
  assert.match(tic, /i\.style\.width/);
  assert.match(source, /\.hourbar\.libre>i\{width:100%!important/);
  assert.match(source, /@media \(prefers-reduced-motion:reduce\)\{\n\s*\.hourbar>i\{transition:none\}/);
});
