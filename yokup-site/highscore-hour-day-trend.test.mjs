import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./highscore.html", import.meta.url), "utf8");
const identitySource = await readFile(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const identityContext = vm.createContext({});
vm.runInContext(identitySource, identityContext);
const identity = identityContext.ykAgentIdentity;

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`función ${name} incompleta`);
}

function storage() {
  const values = new Map();
  return {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => values.set(key, String(value)),
    value:key => values.get(key),
  };
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone:"Europe/Madrid", year:"numeric", month:"2-digit", day:"2-digit",
});
const claveDia = epoch => dayFormatter.format(new Date(epoch));
const DAILY_KEY = "yokup.highscore.dailyPointsObserved.v1";

function observationApi() {
  return new Function("window", "claveDia", "DAILY_POINTS_OBSERVED_KEY", [
    functionSource("normaliza"), functionSource("claveHoraria"), functionSource("identidadFamiliaHoraria"),
    functionSource("claveObservacionDiaria"), functionSource("leeObservacionesDiarias"),
    functionSource("observaPuntosDiarios"),
    "return { observe:observaPuntosDiarios, key:claveObservacionDiaria };",
  ].join("\n"))({ ykAgentIdentity:identity }, claveDia, DAILY_KEY);
}

const AUG5 = Date.parse("2026-08-05T12:00:00Z");

test("primera observación es neutra; subir es verde y empatar o bajar es rojo", () => {
  const api = observationApi(), local = storage();
  const row = { agente:"OraculoMacMini", base:"Oraculo", suffix:"MacMini", total:10 };
  assert.equal(api.observe(row, AUG5, local, true).state, "initial");
  assert.equal(api.observe(row, AUG5 + 1000, local, true).state, "down", "igualdad = rojo");
  row.total = 14;
  assert.equal(api.observe(row, AUG5 + 2000, local, true).state, "up");
  row.total = 12;
  assert.equal(api.observe(row, AUG5 + 3000, local, true).state, "down");
});

test("el baseline se aísla por agente, máquina y día de Madrid", () => {
  const api = observationApi(), local = storage();
  const mini = { agente:"OraculoMacMini", base:"Oraculo", suffix:"MacMini", total:30 };
  const mbp = { agente:"OraculoMBP16", base:"Oraculo", suffix:"MBP16", total:30 };
  assert.notEqual(api.key(mini), api.key(mbp));
  assert.equal(api.observe(mini, AUG5, local, true).state, "initial");
  assert.equal(api.observe(mbp, AUG5, local, true).state, "initial");
  mini.total = 31;
  assert.equal(api.observe(mini, AUG5 + 1000, local, true).state, "up");
  assert.equal(api.observe(mbp, AUG5 + 1000, local, true).state, "down");

  // En agosto, las 22:00 UTC ya son medianoche del día siguiente en Madrid.
  const nextMadridDay = Date.parse("2026-08-05T22:01:00Z");
  assert.equal(api.observe(mini, nextMadridDay, local, true).state, "initial");
  assert.equal(JSON.parse(local.value(DAILY_KEY)).day, "2026-08-06");
});

test("main, sub e infra comparten el baseline de su única fila visible por máquina", () => {
  const api = observationApi(), local = storage();
  const main = { agente:"OraculoMacMini", suffix:"MacMini", total:10 };
  const sub = { agente:"SubOraculoMacMini", suffix:"MacMini", total:20 };
  const infra = { agente:"InfraOraculoMacMini", suffix:"MacMini", total:30 };
  assert.equal(new Set([api.key(main), api.key(sub), api.key(infra)]).size, 1);
  assert.equal(api.observe(main, AUG5, local, true).state, "initial");
  assert.equal(api.observe(sub, AUG5 + 1000, local, true).state, "up");
  assert.equal(api.observe(infra, AUG5 + 2000, local, true).state, "up");
});

test("un payload cacheado o fallido no mueve el baseline ni afirma transición", () => {
  const api = observationApi(), local = storage();
  const row = { agente:"NeoMacMini", base:"Neo", suffix:"MacMini", total:20 };
  api.observe(row, AUG5, local, true);
  row.total = 90;
  const stale = api.observe(row, AUG5 + 1000, local, false);
  assert.equal(stale.state, "initial");
  assert.equal(stale.stale, true);
  assert.equal(Object.values(JSON.parse(local.value(DAILY_KEY)).agents)[0], 20);
  row.total = 25;
  assert.equal(api.observe(row, AUG5 + 2000, local, true).state, "up", "compara contra el último render válido");
});

test("el podio usa el periodo elegido y el ranking conserva total diario", () => {
  assert.match(source, /puntosPeriodo = puntosPodioPeriodo\(a\)/);
  assert.match(source, /rotuloPeriodoPodio\(PODIUM_PERIOD\)/);
  assert.match(source, /if \(campo === "puntos"\) return Number\(fila\.total\) \|\| 0/);
  assert.match(source, /f\.total = f\.ptsObjetivos \+ f\.ptsVentanas \+ f\.ptsMisiones \+ f\.ptsTareas/);
  assert.match(source, /var scoringObserved = f\.seenDailyScore \|\| f\.seenTask[\s\S]*observaPuntosDiarios\(f, Date\.now\(\), null, datos\.actividadFresh === true\)[\s\S]*missingScore:true/);
});

test("el aria del podio verbaliza la comparación diaria además de mostrar el color", () => {
  assert.match(source, /var dailyTitle = tituloPuntosDiarios\(estadoPuntosDiarios\(a\)\)/);
  assert.match(source, /aria-label="Ver histórico de '[\s\S]*esc\(scoreLabel \+ "\. " \+ dailyTitle\)/);
});
