import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const identitySource = fs.readFileSync(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const detailSource = fs.readFileSync(new URL("./highscore-detail.js", import.meta.url), "utf8");
const detailHtml = fs.readFileSync(new URL("./highscoreDetail.html", import.meta.url), "utf8");
const context = vm.createContext({ Intl, Date, sessionStorage:{ getItem:()=>null } });
vm.runInContext(identitySource, context); vm.runInContext(detailSource, context);
const D = context.YkHighscoreDetail, ID = context.ykAgentIdentity;
test("el detalle cuenta CUÁNTAS ventanas y misiones lleva el agente, no sólo sus puntos", () => {
  const daily={scores:[
    {agent:"Neo",machine:"macbookpronegro14",objective_points:0,window_points:60,windows:6,mission_points:400,missions:10},
    {agent:"Morfeo",machine:"macmini",objective_points:0,window_points:160,windows:16,mission_points:280,missions:7},
  ]};
  const neo=D.scoreFor("NeoMBP14",daily,[],ID);
  assert.equal(neo.windowCount,6); assert.equal(neo.missionCount,10); assert.equal(neo.windows,60);
  const morfeo=D.scoreFor("MorfeoMacMini",daily,[],ID);
  assert.equal(morfeo.windowCount,16);
});
test("la página del detalle pinta la ficha «Ventanas de decisión hoy»", () => {
  assert.match(detailHtml, /stat\(windowCount,"Ventanas de decisión hoy"\)/);
  assert.match(detailHtml, /snap\.ventanas/);
});
