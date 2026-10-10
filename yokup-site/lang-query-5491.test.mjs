import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const frame = readFileSync(new URL("./yk-frame.js", import.meta.url), "utf8");
const retailer = readFileSync(new URL("./retailer.html", import.meta.url), "utf8");
const home = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function grab(name) {
  const start = frame.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name);
  const brace = frame.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < frame.length; i++) {
    if (frame[i] === "{") depth += 1;
    else if (frame[i] === "}") {
      depth -= 1;
      if (!depth) return frame.slice(start, i + 1);
    }
  }
  throw new Error(name);
}

function pedir(search) {
  const context = vm.createContext({ URLSearchParams, location: { search } });
  vm.runInContext(grab("tokenIdioma") + "\n" + grab("idiomaDeToken") + "\n" + grab("langDeQuery") + "\nthis.out = langDeQuery();", context);
  return context.out;
}

test("?lang= en admira.app se lee como en admiranext y /lang no se come a /language", () => {
  assert.equal(pedir("?lang=en"), "en");
  assert.equal(pedir("?lang=ENG"), "en");
  assert.equal(pedir("?lang=es"), "es");
  assert.equal(pedir("?lang=español"), "es");
  assert.equal(pedir("?marca=84"), "");
  assert.equal(pedir(""), "");
  const re = /^(idioma|language|languague|lang)(?:[\s_-]*(.*))?$/i;
  assert.equal("language".match(re)[1], "language");
  assert.equal("languague".match(re)[1], "languague");
  assert.equal("lang".match(re)[1], "lang");
  assert.equal("languageENG".match(re)[1], "language");
  assert.equal("lang ENG".match(re)[2].trim(), "ENG");
  assert.match(frame, /"language", "languague", "lang"/);
  assert.match(frame, /aplicarIdioma\(pedido\)/);
  assert.match(retailer, /yk-idioma\.js\?v=20261010-idioma-5491/);
  assert.match(retailer, /yk-frame\.js\?v=20261010-lang-5491/);
  assert.match(home, /yk-frame\.js\?v=20261010-lang-5491/);
  assert.match(retailer, /Tus equipos\./);
  assert.match(retailer, /Crear cuenta de comercio/);
});
