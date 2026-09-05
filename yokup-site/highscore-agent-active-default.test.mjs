import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const identitySource=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const desktopSource=fs.readFileSync(new URL("./highscore-desktop-app.js",import.meta.url),"utf8");
const sandbox={module:{exports:{}},exports:{}};
vm.runInNewContext(identitySource,sandbox);
vm.runInNewContext(desktopSource,sandbox);
const identity=sandbox.ykAgentIdentity,desktop=sandbox.module.exports;

function functionSource(name){
  const start=html.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=html.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let index=brace;index<html.length;index++){
    const char=html[index];
    if(quote){
      if(escaped)escaped=false;
      else if(char==="\\")escaped=true;
      else if(char===quote)quote="";
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0)return html.slice(start,index+1);
  }
  throw new Error(`función ${name} incompleta`);
}

function api(){
  const functions=["hsAgentKey","hsCoversAgentKeys","hsActiveAgentKeys","hsAgentScopeMigration",
    "hsEffectiveAgentScope","hsAgentScopeAllows","aplicaAgentScope"].map(functionSource).join("\n");
  return new Function("identity",`
    var window={ykAgentIdentity:identity};
    var AGENT_SCOPE=null,AGENT_SCOPE_MODE="legacy";
    function normaliza(value){return String(value==null?"":value).trim();}
    function hsDesktopApps(){return [];}
    ${functions}
    return {
      active:hsActiveAgentKeys,
      migrate:hsAgentScopeMigration,
      effective:function(scope,mode){AGENT_SCOPE=scope;AGENT_SCOPE_MODE=mode;return hsEffectiveAgentScope();},
      apply:function(rows,scope){return aplicaAgentScope(rows,scope);}
    };
  `)(identity);
}

function fleet(updated=995){
  const personas=["Morfeo","Neo","Nio","Oraculo","Smith","Trinity"];
  return {
    control_machines:[{machine:"MacMini",updated:995,slots:personas.map(persona=>({
      persona,runtime:persona==="Oraculo"?"Codex":"Claude",host:"app",session_id:`desktop:${persona.toLowerCase()}`
    }))}],
    presence:[
      {persona:"Morfeo",machine:"MacMini",runtime:"Claude",host:"app",session_id:"desktop:morfeo",pid:41,updated,online:1,verified:1,source:"process_snapshot"},
      {persona:"Oraculo",machine:"MacMini",runtime:"Codex",host:"app",session_id:"desktop:oraculo",pid:42,updated,online:1,verified:1,source:"process_snapshot"},
      {persona:"Neo",machine:"MacMini",runtime:"Claude",host:"cli",session_id:"neo",pid:43,updated,online:1,verified:1,source:"process_snapshot"},
    ]
  };
}

test("Activos nace de presencia operativa canónica app o cli, nunca del catálogo",()=>{
  const payload=fleet(),apps=desktop.items(payload,identity,1000),keys=api().active(payload.presence,identity,1000);
  assert.equal(apps.length,6,"las seis ranuras siguen disponibles como opt-in");
  assert.deepEqual([...keys].sort(),["morfeomacmini","neomacmini","oraculomacmini"]);
  assert.equal(apps.filter(item=>item.active).length,2);
});

test("presencia caducada no entra en el default aunque conserve ranura",()=>{
  const payload=fleet(969),apps=desktop.items(payload,identity,1000),keys=api().active(payload.presence,identity,1000);
  assert.equal(keys.size,0);
  assert.equal(apps.length,6);
  assert.ok(apps.every(item=>item.active===false));
});

test("Activos exige snapshot verificado, PID, online, host operativo y reloj canónico",()=>{
  const base={persona:"Neo",machine:"MacMini",source:"process_snapshot",verified:1,online:1,pid:44,updated:995};
  const rows=[base,{...base,persona:"Morfeo",host:"web"},{...base,persona:"Nio",verified:0,host:"app"},
    {...base,persona:"Smith",pid:0,host:"cli"},{...base,persona:"Trinity",online:0,host:"app"},
    {...base,persona:"Oraculo",host:"cli"}];
  rows[0].host="app";
  assert.deepEqual([...api().active(rows,identity,1000)].sort(),["neomacmini","oraculomacmini"]);
  assert.equal(api().active(rows,identity,0),null,"sin reloj de servidor no se fabrica una selección vacía");
});

test("dos turnos Desktop APP verificados entran juntos aunque presencia llegue tarde; CLI no entra",()=>{
  const works=[
    {key:"neombp14",agente:"NeoMBP14",state:"running",sessionSurface:"app",cliPaused:false},
    {key:"trinitymbp14",agente:"TrinityMBP14",state:"running",sessionSurface:"app",cliPaused:false},
    {key:"smithmbairplata",agente:"SmithMBAirPlata",state:"running",sessionSurface:"cli",cliPaused:true},
    {key:"neombp14",agente:"NeoMBP14",state:"running",sessionSurface:"app",cliPaused:false}
  ];
  assert.deepEqual([...api().active([],identity,0,works)].sort(),["neombp14","trinitymbp14"]);
});

test("ausencia y legado equivalente a Todos conservan el universo completo",()=>{
  const A=api(),all=["morfeomacmini","neomacmini","niomacmini","oraculomacmini","smithmacmini","trinitymacmini"];
  const active=new Set(["morfeomacmini","neomacmini","oraculomacmini"]);
  for(const legacy of [null,new Set(all),new Set([...all,"retiradomacmini"])]){
    const result=A.migrate(legacy,"legacy",all,active);
    assert.equal(result.mode,"all");
    assert.equal(result.scope,null);
    assert.equal(result.changed,true);
  }
});

test("subconjunto legado y selecciones v2 manual/all sobreviven sin reautoselección",()=>{
  const A=api(),all=["morfeomacmini","neomacmini","oraculomacmini"],subset=new Set(["neomacmini"]);
  const legacy=A.migrate(subset,"legacy",all,new Set(["morfeomacmini","oraculomacmini"]));
  assert.equal(legacy.mode,"manual");
  assert.deepEqual([...legacy.scope],["neomacmini"]);

  const explicitAllSet=new Set(all),manual=A.migrate(explicitAllSet,"manual",all,new Set(["morfeomacmini"]));
  assert.equal(manual.changed,false);
  assert.equal(manual.scope,explicitAllSet);
  assert.deepEqual([...A.effective(subset,"active")],["neomacmini"],
    "el modo activo conserva su snapshot: un refresco no mete procesos nuevos");
  assert.equal(A.effective(null,"all"),null,"Todos explícito sigue siendo Todos");
});

test("el scope activo limpia y renumera el Highscore",()=>{
  const rows=["MorfeoMacMini","NeoMacMini","OraculoMacMini"].map((agente,index)=>({agente,posicion:index+7}));
  const selected=api().apply(rows,new Set(["morfeomacmini","oraculomacmini"]));
  assert.deepEqual(selected.map(row=>[row.agente,row.posicion]),[["MorfeoMacMini",1],["OraculoMacMini",2]]);
});

test("layout y ARIA priorizan el nombre sin desplazar runner ni feedback",()=>{
  assert.match(html,/\.agent-scope-row\.agent\{grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(html,/\.agent-scope-primary\{[^}]*grid-template-columns:minmax\(0,1fr\) auto 28px[^}]*width:100%[^}]*grid-column:1;grid-row:1/);
  assert.match(html,/\.agent-scope-running\{[^}]*grid-column:2;grid-row:1/);
  assert.match(html,/\.agent-scope-app-feedback\{grid-column:1\/-1;grid-row:2/);
  assert.match(html,/class="agent-scope-primary agent-scope-switch" type="button" role="switch"[^>]*aria-checked=/);
  assert.match(html,/aria-label="' \+ \(following \? 'Dejar de seguir a ' : 'Seguir a '\) \+ esc\(item\.label\)/);
  assert.match(html,/role="checkbox" data-agent-scope-team[^>]*aria-checked=/);
  assert.match(html,/class="agent-scope-presets" role="radiogroup"/);
  assert.match(html,/role="radio" data-agent-scope-preset="active" aria-checked=/);
});

test("los refrescos de presencia resincronizan el modo activo sin tocar el manual",()=>{
  const refresh=functionSource("hsRefreshDesktopApps");
  assert.match(refresh,/if \(AGENT_SCOPE_MODE === "active"\)[\s\S]*hsActiveAgentKeys\(datos\.presencia, window\.ykAgentIdentity, datos\.presenceNow, trabajosEnCurso\(\)\)/);
  const scoreboard=functionSource("actualizaMarcador");
  assert.match(scoreboard,/if \(AGENT_SCOPE_MODE === "active"\)[\s\S]*hsActiveAgentKeys\(datos\.presencia, window\.ykAgentIdentity, datos\.presenceNow, trabajosEnCurso\(\)\)/);
  const workPaint=functionSource("hsPaintWorkUpdate");
  assert.match(workPaint,/hsActiveAgentKeys\(datos\.presencia, window\.ykAgentIdentity,[\s\S]*trabajosEnCurso\(\)\)/,
    "el polling ligero de active-work actualiza el ámbito sin esperar al refresco general");
  assert.match(html,/if \(activeKeys instanceof Set\) \{ AGENT_SCOPE = activeKeys; hsWriteAgentScope/,
    "un fallo transitorio no vacía el scope activo ya persistido");
});

test("una respuesta de presencia atrasada no pisa una nueva ni degrada su disponibilidad",()=>{
  assert.match(html,/var PRESENCE_REQUEST_SEQUENCE = 0, PRESENCE_APPLIED_SEQUENCE = 0/);
  const refresh=functionSource("hsRefreshDesktopApps");
  assert.match(refresh,/var requestSequence = hsBeginPresenceRequest\(\)/);
  assert.match(refresh,/if \(!hsAcceptPresenceRequest\(requestSequence\)\) return payload/);
  assert.match(refresh,/catch[\s\S]*if \(hsAcceptPresenceRequest\(requestSequence\)\)[\s\S]*datos\.presenceAvailable = false/);
  const scoreboard=functionSource("actualizaMarcador");
  assert.match(scoreboard,/var presenceRequestSequence = hsBeginPresenceRequest\(\)/);
  assert.match(scoreboard,/r\[2\] && hsAcceptPresenceRequest\(presenceRequestSequence\)/);
  assert.match(scoreboard,/!r\[2\] && hsAcceptPresenceRequest\(presenceRequestSequence\)/);
});

test("la carga y los refrescos usan el reloj canónico de presencia",()=>{
  assert.match(html,/presence:d\.presence \|\| \[\], controlMachines:d\.control_machines \|\| \[\], now:Number\(d\.now \|\| 0\)/);
  assert.match(html,/datos\.presenceNow = r\[5\] && Number\(r\[5\]\.now \|\| 0\) \|\| 0/);
  assert.match(html,/window\.ykAgentIdentity, Number\(datos\.presenceNow \|\| 0\) \|\| Date\.now\(\) \/ 1000/);
  const refresh=functionSource("hsRefreshDesktopApps");
  assert.match(refresh,/datos\.presenceNow = Number\(payload\.now \|\| 0\)/);
  const scoreboard=functionSource("actualizaMarcador");
  assert.match(scoreboard,/datos\.presenceNow = Number\(r\[2\]\.now \|\| 0\)/);
});
