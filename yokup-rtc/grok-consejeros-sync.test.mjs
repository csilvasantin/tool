// Las sillas GrokBot viven en GROK_CONSEJEROS. El navegador, la regex de
// atribuciones, el agrupado de consumos y CONSEJEROS del MCP no pueden
// importar esa lista (script clásico, función eval-ada, HTML, módulo sin
// dependencias). Este test es el que obliga a copiarlas igual.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GROK_CONSEJEROS, parseAgentIdentity, scopedAgentIdentity } from "./src/agent-identity.js";
import { CONSEJEROS, PERSONAS, RUNTIME_POR_DEFECTO } from "../yokup-site-gate/src/identidad-flota.mjs";
import "../yokup-site/yk-agent-identity.js";

const nombres = GROK_CONSEJEROS.map(([nombre]) => nombre);
const id = globalThis.ykAgentIdentity;

test("Musk resuelve como el resto de sillas GrokBot y «elon» a secas no", () => {
  assert.equal(scopedAgentIdentity("Musk", "GrokBot"), "MuskGrokBot");
  assert.equal(scopedAgentIdentity("Elon Musk", "grok bot"), "MuskGrokBot");
  assert.equal(parseAgentIdentity("MuskGrokBot").suffix, "GrokBot");
  assert.equal(parseAgentIdentity("MuskGrokBot").legacy, false);
  assert.equal(parseAgentIdentity("Elon").persona, "Elon");
  assert.equal(parseAgentIdentity("Elon").legacy, true);
  assert.ok(nombres.includes("Musk"));
});

test("el navegador reconoce los mismos alias, sin «elon» suelto", () => {
  for (const [nombre, aliases] of GROK_CONSEJEROS) {
    assert.equal(id.base(nombre), nombre);
    assert.equal(id.base(`${nombre}GrokBot`), nombre);
    assert.equal(id.parse(`${nombre}GrokBot`).suffix, "GrokBot");
    for (const alias of aliases) assert.equal(id.scoped(alias, "GrokBot"), `${nombre}GrokBot`, alias);
  }
  assert.equal(id.base("Elon"), "Elon");
  assert.equal(id.same("MuskGrokBot", "WozniakGrokBot"), false);
});

test("CONSEJEROS del MCP nombra las mismas sillas", () => {
  // El array del MCP conserva el orden histórico (Lucas antes que Disney).
  // Lo que no puede desviarse es el conjunto de apellidos.
  assert.deepEqual([...CONSEJEROS].sort(), [...nombres].sort());
});

test("la regex de atribuciones nombra cada silla GrokBot", async () => {
  const src = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
  const linea = src.split("\n").find((l) => l.includes("Seraph|Wozniak|"));
  assert.ok(linea, "cleanMissionAttributions declara la regex de agente");
  const grupo = linea.match(/Seraph\|([^)]+)\)/);
  assert.ok(grupo, linea);
  assert.equal(grupo[1], nombres.join("|"));
  assert.match(linea, /Persefone\|Merovingio\|Seraph\|/);
});

test("Merovingio es deepagent de flota, no una silla GrokBot", () => {
  for (const alias of ["Merovingio", "merovingian", "El Merovingio"]) {
    assert.equal(id.base(alias), "Merovingio");
    assert.equal(id.scoped(alias, "GrokBotBox"), "MerovingioGrokBotBox");
  }
  assert.equal(id.same("MerovingioGrokBotBox", "MuskGrokBot"), false);
  assert.equal(PERSONAS.includes("Merovingio"), true);
  assert.equal(CONSEJEROS.includes("Merovingio"), false);
  assert.equal(RUNTIME_POR_DEFECTO.Merovingio, "Grok CLI");
  assert.equal(RUNTIME_POR_DEFECTO.Smith, "Grok CLI");
});

test("consumos agrupa Musk con Consejeros y no usa el alias suelto elon", async () => {
  const html = await readFile(new URL("../yokup-site/consumos.html", import.meta.url), "utf8");
  const fuente = html.match(/if\(\/([^/]+)\/\.test\(key\)\) return "Consejeros"/);
  assert.ok(fuente, "falta la regex de Consejeros en consumos.html");
  const re = new RegExp(fuente[1]);
  const clave = (owner) => String(owner).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  assert.equal(re.test(clave("Musk")), true);
  assert.equal(re.test(clave("Elon Musk")), true);
  assert.equal(re.test(clave("MuskGrokBot")), true);
  assert.equal(re.test(clave("Elon")), false);
  assert.equal(re.test(clave("JobsGrokBot")), true);
  assert.match(html, /Wozniak · Musk/);
  const inicio = html.indexOf("function mapOwnerToDeepAgent");
  const fin = html.indexOf("function projectHasActivity");
  const mapOwnerToDeepAgent = eval(`(${html.slice(inicio, fin)})`);
  assert.equal(mapOwnerToDeepAgent("MerovingioGrokBotBox"), "Merovingio");
  assert.equal(mapOwnerToDeepAgent("El Merovingio"), "Merovingio");
  assert.equal(mapOwnerToDeepAgent("merovingian"), "Merovingio");
  assert.equal(mapOwnerToDeepAgent("MuskGrokBot"), "Consejeros");
});
