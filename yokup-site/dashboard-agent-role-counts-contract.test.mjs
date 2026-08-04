import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let index = brace; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`función ${name} incompleta`);
}

function countsApi() {
  return new Function(
    `${functionSource("paTeamRoleCounts")}\n${functionSource("paRoleCounts")}\nreturn {paTeamRoleCounts,paRoleCounts};`,
  )();
}

const neo = {
  id:"NeoMacMini", team:"macmini", online:true, surfaces:[{online:true}],
  helpers:[
    {id:"SubNeoMacMini", role:"sub", online:true, assigned:true},
    {id:"InfraNeoMacMini", role:"infra", online:false, assigned:true},
  ],
};
const oraculo = {
  id:"OraculoMacMini", team:"macmini", online:false, assigned:true, surfaces:[{online:false}],
  helpers:[{id:"SubOraculoMacMini", role:"sub", online:false, assigned:true}],
};
const morfeo = {
  id:"MorfeoMBP14", team:"mbp14", online:true, surfaces:[{online:true}],
  helpers:[{id:"InfraMorfeoMBP14", role:"infra", online:true, assigned:false}],
};

test("la cabecera separa principales, Subagentes e Infraagentes", () => {
  assert.match(source, /Agentes principales <span class="pa-count" id="projectAgentAgentsN">/);
  assert.match(source, /Subagentes <span class="pa-count" id="projectAgentSubsN">/);
  assert.match(source, /Infraagentes <span class="pa-count" id="projectAgentInfrasN">/);
  assert.match(source, /projectAgentAgentsN"\)\.textContent=roleCounts\.main\.active\+"\/"\+roleCounts\.main\.total/);
  assert.match(source, /projectAgentSubsN"\)\.textContent=roleCounts\.sub\.active\+"\/"\+roleCounts\.sub\.total/);
  assert.match(source, /projectAgentInfrasN"\)\.textContent=roleCounts\.infra\.active\+"\/"\+roleCounts\.infra\.total/);
});

test("los totales cuentan identidades conocidas y activo significa online, nunca assigned", () => {
  const {paRoleCounts} = countsApi();
  const families = [neo, oraculo, morfeo];
  const visibleTeams = [{key:"macmini", agents:[neo, oraculo]}];
  assert.deepEqual(paRoleCounts(families, visibleTeams), {
    main:{active:1, total:2},
    sub:{active:1, total:2},
    infra:{active:0, total:1},
  });
  const body = functionSource("paRoleCounts") + functionSource("paTeamRoleCounts");
  assert.match(body, /helper\.online===true/);
  assert.doesNotMatch(body, /helper\.assigned[^\n]*active|active[^\n]*helper\.assigned/);
});

test("Sub e Infra no se mezclan aunque pertenezcan a la misma familia", () => {
  const {paRoleCounts} = countsApi();
  const result = paRoleCounts([neo], [{key:"macmini", agents:[neo]}]);
  assert.deepEqual(result.sub, {active:1, total:1});
  assert.deepEqual(result.infra, {active:0, total:1});
  const body = functionSource("paTeamRoleCounts");
  assert.match(body, /role!=="sub"&&role!=="infra"/);
  assert.match(body, /counts\[role\]/);
});

test("un helper online no convierte al principal offline en activo", () => {
  const {paTeamRoleCounts} = countsApi();
  const trinity = {
    id:"TrinityMBP16", team:"mbp16", online:true, surfaces:[{online:false}],
    helpers:[{id:"SubTrinityMBP16", role:"sub", online:true, assigned:true}],
  };
  const result = paTeamRoleCounts({key:"mbp16", agents:[trinity]});
  assert.deepEqual(result.main, {active:0, total:1});
  assert.deepEqual(result.sub, {active:1, total:1});
  const body = functionSource("paTeamRoleCounts");
  assert.match(body, /agent\.surfaces\.some\(slot=>slot\.online===true\)/);
  assert.doesNotMatch(body, /main[^\n]*agent\.online|agent\.online[^\n]*main/);
});

test("cada equipo desglosa sólo las identidades pertenecientes a esa máquina", () => {
  const {paTeamRoleCounts} = countsApi();
  const mini = {key:"macmini", agents:[neo, oraculo]};
  const mbp = {key:"mbp14", agents:[morfeo]};
  assert.deepEqual(paTeamRoleCounts(mini), {
    main:{active:1, total:2},
    sub:{active:1, total:2},
    infra:{active:0, total:1},
  });
  assert.deepEqual(paTeamRoleCounts(mbp), {
    main:{active:1, total:1},
    sub:{active:0, total:0},
    infra:{active:1, total:1},
  });
  assert.match(source, /const teamRoleCounts=paTeamRoleCounts\(team\)/);
  assert.match(source, /teamRoleCounts\.main\.active\+'\/'\+teamRoleCounts\.main\.total\+' principales · '\+teamRoleCounts\.sub\.active\+'\/'\+teamRoleCounts\.sub\.total\+' Subagentes · '\+teamRoleCounts\.infra\.active\+'\/'\+teamRoleCounts\.infra\.total\+' Infraagentes'/);
});

test("el modelo conserva helpers únicos con role, online y assigned separados", () => {
  const familyBody = functionSource("paAgentFamilies");
  assert.match(familyBody, /helperGroups=new Map\(\)/);
  assert.match(familyBody, /helper\.role/);
  assert.match(familyBody, /online:helper\.slots\.some\(item=>item\.online\)/);
  assert.match(familyBody, /assigned:helper\.slots\.some\(item=>item\.assigned\)/);
  assert.doesNotMatch(familyBody, /online:helper\.slots\.some\(item=>item\.online\|\|item\.assigned\)/);
});
