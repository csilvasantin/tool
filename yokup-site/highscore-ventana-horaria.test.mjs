import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Bajo cada agente hay una línea que representa el tiempo hasta su próxima
// ventana de decisión autónoma, si Carlos no le dice nada.
//
// El reloj se pone a CERO en cada ventana y corre 60 MINUTOS ENTEROS (Carlos,
// 2026-08-05). Antes era «una por hora natural de Madrid», que tenía un filo
// feo: abrir a las 11:55 dejaba abrir otra a las 12:00, cinco minutos después.
// Lo que NO puede pasar es que la línea y la guarda del worker cuenten cosas
// distintas: si discrepan, la barra miente con buena letra.
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
  // VENTANA_MS se declara justo antes de ventanaHoraria, fuera del corte de
  // cabecera: hay que traerlo o las funciones se evalúan sin él.
  const ventanaMs = source.match(/var VENTANA_MS = [^;]+;/)[0];
  const codigo = cabecera + ventanaMs + ["comoMs", "mismoAgenteVentana", "ventanaHoraria", "tonoVentana",
    "faltaTexto", "horaCorta", "tituloVentana"].map(cuerpo).join("\n");
  return new Function("datos", "window", "normaliza", "esc",
    `${codigo}\n${cuerpo("relojVentanaHtml")}\nreturn { ventana:ventanaHoraria, tono:tonoVentana, titulo:tituloVentana, clave:claveHora, dentro:dentroDeLaHora, html:relojVentanaHtml };`
  )({ decisiones }, { ykAgentIdentity: identityContext.ykAgentIdentity },
    (v) => String(v == null ? "" : v).trim(),
    (v) => String(v == null ? "" : v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"));
}

const NEO = { agente:"NeoMBACrema", base:"Neo", suffix:"MBACrema" };
const TRINITY = { agente:"TrinityMBAAzul", base:"Trinity", suffix:"MBAAzul" };

test("el reloj arranca en la ventana y dura 60 minutos exactos", () => {
  const ahora = Date.now();
  const a = api([{ agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora - 15 * 60000, parent_decision:"" }]);
  const v = a.ventana(NEO);
  assert.equal(v.abierta, true);
  assert.ok(Math.abs(v.progreso - 0.25) < 0.01, "15 de 60 min = 25%");
  assert.ok(Math.abs(v.restante - 45 * 60000) < 2000, "quedan 45 min");
});

test("al cumplirse los 60 minutos la puerta vuelve a estar abierta", () => {
  const ahora = Date.now();
  const justo = api([{ agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora - 59 * 60000, parent_decision:"" }]);
  assert.equal(justo.ventana(NEO).abierta, true, "a los 59 min todavía espera");
  const cumplida = api([{ agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora - 61 * 60000, parent_decision:"" }]);
  assert.equal(cumplida.ventana(NEO).abierta, false, "a los 61 min ya puede abrir");
});

test("abrir otra ventana pone el reloj a CERO", () => {
  const ahora = Date.now();
  const a = api([
    { agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora - 50 * 60000, parent_decision:"" },
    { agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora - 30000, parent_decision:"" },
  ]);
  const v = a.ventana(NEO);
  assert.ok(v.progreso < 0.02, "manda la MÁS RECIENTE: el reloj vuelve a empezar");
  assert.ok(v.restante > 59 * 60000, "y quedan casi 60 min otra vez");
});

test("una ventana reciente marca al agente; la de hace dos horas no", () => {
  const ahora = Date.now();
  const a = api([
    { agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora, parent_decision:"" },
    { agent:"TrinityMBAAzul", machine:"MacBookAirAzul", created_at:ahora - 7200000, parent_decision:"" },
  ]);
  assert.equal(a.ventana(NEO).abierta, true);
  assert.equal(a.ventana(TRINITY).abierta, false, "pasados los 60 min ya no cuenta");
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
    /Puede tomar una decisión AHORA/);
  assert.match(a.titulo({ abierta:true, at:Date.UTC(2026, 7, 5, 9, 5), restante:55 * 60000 }),
    /Próxima toma de decisión en 55:00 \(a las 12:05\) · la última fue a las 11:05/);
});

test("el marcado lleva estado accesible y el degradado en el relleno", () => {
  const ahora = Date.now();
  const abierta = api([{ agent:"NeoMBACrema", machine:"MacBookAirCrema", created_at:ahora, parent_decision:"" }]).html(NEO);
  assert.match(abierta, /class="hourbar"/);
  assert.match(abierta, /data-abierta="1"/);
  assert.match(abierta, /role="img"/);
  assert.match(abierta, /aria-label="Próxima toma de decisión en/);
  assert.match(abierta, /background:linear-gradient\(90deg,hsl\(186 92% 64%\),hsl\(\d+ 92% 64%\)\)/);

  const libre = api([]).html(NEO);
  assert.match(libre, /class="hourbar libre"/);
  assert.match(libre, /data-abierta="0"/);
  assert.match(libre, /aria-label="Puede tomar una decisión AHORA/);
});

test("la línea vive bajo el agente y se refresca sola sin volver a pedir datos", () => {
  assert.match(source, /relojVentanaHtml\(a\) \+ '<\/td>'/, "va dentro de la celda del agente");
  assert.match(source, /window\.setInterval\(ticVentanas, 15000\)/);
  assert.match(source, /var VENTANA_MS = 60 \* 60 \* 1000;/);
  const tic = cuerpo("ticVentanas");
  assert.doesNotMatch(tic, /seguroYokup|fetch\(/, "el tic no puede pedir datos");
  assert.match(tic, /i\.style\.width/);
  assert.match(source, /\.hourbar\.libre>i\{width:100%!important/);
  assert.match(source, /@media \(prefers-reduced-motion:reduce\)\{\n\s*\.hourbar>i\{transition:none\}/);
});

// ── Clic en el agente → ventana sobre su proyecto (Carlos, 2026-08-05) ─────

test("el nombre del agente es el gatillo, y sólo si hay proyecto de censo", () => {
  const visible = cuerpo("nombreAgenteVisible"), nombre = cuerpo("agentNameHtml");
  const f = new Function("esc", "normaliza", "window", `${visible}\n${nombre}\nreturn agentNameHtml;`)(
    (v) => String(v == null ? "" : v).replaceAll("&", "&amp;").replaceAll('"', "&quot;"),
    (v) => String(v == null ? "" : v).trim(),
    { ykAgentIdentity:{ parse:raw => ({ persona:raw === "NeoMBACrema" ? "Neo" : raw }) } });
  const conCenso = f({ agente:"NeoMBACrema", proyecto:"admiranext.com/webmaster",
    proyectoOrigen:"principal", proyectoId:"webmaster-admiranext", maquinas:["MacBookAirCrema"] });
  assert.match(conCenso, /data-yk-launch="1"/);
  assert.match(conCenso, /data-proyecto="webmaster-admiranext"/);
  assert.match(conCenso, /data-maquina="MacBookAirCrema"/);
  assert.match(conCenso, /data-agente="NeoMBACrema"/);
  assert.match(conCenso, />NeoMBACrema<\/button>/);
  assert.doesNotMatch(conCenso, />Neo<\/button>/);
  // el default no abre ventana de mejora: Galaxia Admira es paraguas, no faena
  assert.doesNotMatch(f({ agente:"X", proyecto:"Galaxia Admira", proyectoOrigen:"defecto", proyectoId:"galaxia-admira" }),
    /data-yk-launch/);
  // sin id canónico tampoco: la ruta lo rechazaría, mejor no pintar el botón
  assert.doesNotMatch(f({ agente:"X", proyecto:"algo.com", proyectoOrigen:"trabajo", proyectoId:"" }),
    /data-yk-launch/);
});

test("el clic va por la sesión del perímetro y dice el motivo del rechazo", () => {
  const bloque = source.slice(source.indexOf('closest("[data-yk-launch]")'),
    source.indexOf('closest("[data-yk-launch]")') + 1800);
  assert.match(bloque, /ykFetch\("\/projects\/decision"/, "sin ykFetch no viaja la sesión");
  assert.match(bloque, /hourly_limit/);
  assert.match(bloque, /Cupo agotado/);
  assert.match(bloque, /b\.disabled = true/, "no se puede disparar dos veces seguidas");
  assert.match(bloque, /yk:decisions-changed/, "la barra y la línea se enteran");
});
