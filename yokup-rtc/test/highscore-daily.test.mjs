import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {madridDayKey,madridDayStart} from "../src/display-ref.js";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`);return m[0];
};
const grabVar=name=>{
  const re=new RegExp(`var ${name} = [^;]+;`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`);return m[0];
};

function harness(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ideas(id TEXT PRIMARY KEY,title TEXT,author TEXT,status TEXT,created_at INTEGER)");
  db.exec("CREATE TABLE decisions(id TEXT PRIMARY KEY,machine TEXT,agent TEXT,question TEXT,status TEXT,created_at INTEGER)");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,subject TEXT,loc TEXT,source TEXT,status TEXT,assignee TEXT,created_at INTEGER,updated_at INTEGER)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{first:async()=>stmt.get(...args)||null,run:async()=>({meta:stmt.run(...args)}),all:async()=>({results:stmt.all(...args)})}},first:async()=>stmt.get()||null,all:async()=>({results:stmt.all()})}}};
  const context=vm.createContext({Map,String,Number,Date,RegExp,Math,Object,madridDayKey,madridDayStart,__name:(fn)=>fn});
  vm.runInContext([grabVar("HIGHSCORE_WEIGHTS"),grabVar("HIGHSCORE_PERSONAS"),grab("highscoreAgent"),grab("highscoreDaily")].join("\n"),context);
  return{db,env:{DB},F:context};
}

const HOY=Date.now();
const AYER=madridDayStart(HOY)-1000;   // un segundo antes de la medianoche de Madrid

test("solo puntúan agentes de la flota: ni asientos del Consejo ni Carlos", () => {
  const {F}=harness();
  assert.equal(F.highscoreAgent("Oráculo"),"Oráculo");
  assert.equal(F.highscoreAgent("Neo16 (Claude)"),"Neo16","el runtime entre paréntesis no es parte del nombre");
  assert.equal(F.highscoreAgent("Carlos · Oraculo"),"Oraculo","firma compartida: puntúa el agente, no el humano");
  assert.equal(F.highscoreAgent("MorfeoAir16"),"MorfeoAir16");
  assert.equal(F.highscoreAgent("CEO · Steve Jobs"),"","un asiento del Consejo no es un agente");
  assert.equal(F.highscoreAgent("Carlos"),"");
  assert.equal(F.highscoreAgent(""),"");
});

test("el marcador diario suma objetivos, ventanas y misiones del día de Madrid", async () => {
  const {db,env,F}=harness();
  db.exec(`INSERT INTO ideas(id,title,author,status,created_at) VALUES
    ('I1','a','Oráculo','nueva',${HOY}),
    ('I2','b','Oráculo','nueva',${HOY}),
    ('I3','c','CEO · Steve Jobs','nueva',${HOY}),
    ('I4','d','Oráculo','nueva',${AYER})`);
  db.exec(`INSERT INTO decisions(id,machine,agent,question,status,created_at) VALUES
    ('D1','MacBookAirRosa','NeoMBARosa','¿?','live',${HOY}),
    ('D2','MacBookAirRosa','NeoMBARosa','¿?','live',${HOY}),
    ('D3','MacBookAirAzul','TrinityMBAAzul','¿?','live',${HOY}),
    ('D4','MacBookAirRosa','NeoMBARosa','¿?','decided',${AYER})`);
  db.exec(`INSERT INTO tickets(id,subject,loc,source,status,assignee,created_at,updated_at) VALUES
    ('FLT-1','x','MacBookAirRosa','fleet','in_progress','NeoMBARosa',${AYER},${HOY}),
    ('FLT-2','y','MacBookAirRosa','fleet','resolved','NeoMBARosa',${AYER},${HOY}),
    ('FLT-3','z','MacBookAirRosa','fleet','open','NeoMBARosa',${HOY},${HOY}),
    ('FLT-4','w','MacBookAirRosa','fleet','in_progress','NeoMBARosa',${AYER},${AYER}),
    ('INC-9','v','tienda','web','in_progress','tecnico',${HOY},${HOY})`);

  // El vm vive en otro realm: se cruza por JSON para comparar como lo verá el front.
  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  assert.equal(d.ok,true);
  assert.equal(d.day,madridDayKey(HOY));
  assert.deepEqual(d.weights,{objective:20,window:8,mission:40});

  const rosa=d.scores.find(s=>s.agent==="NeoMBARosa");
  assert.ok(rosa,"NeoMBARosa tiene que puntuar: abrió ventanas y trabajó misiones hoy");
  assert.equal(rosa.machine,"MacBookAirRosa");
  assert.equal(rosa.windows,2,"solo las ventanas abiertas HOY");
  assert.equal(rosa.window_points,16);
  assert.equal(rosa.missions,2,"open no cuenta, y lo de ayer tampoco");
  assert.equal(rosa.mission_points,80);

  const oraculo=d.scores.find(s=>s.agent==="Oráculo");
  assert.equal(oraculo.objectives,2,"solo los objetivos creados hoy");
  assert.equal(oraculo.objective_points,40);
  assert.equal(oraculo.machine,"","el objetivo no trae máquina: lo funde el marcador");

  assert.ok(!d.scores.some(s=>/steve|carlos|tecnico/i.test(s.agent)),"nadie ajeno a la flota entra en la tabla");
  const azul=d.scores.find(s=>s.agent==="TrinityMBAAzul");
  assert.equal(azul.windows,1);
  assert.equal(azul.missions,0);
});

test("un día sin actividad devuelve un marcador vacío, no un error", async () => {
  const {env,F}=harness();
  const d=JSON.parse(JSON.stringify(await F.highscoreDaily(env)));
  assert.equal(d.ok,true);
  assert.deepEqual(d.scores,[]);
  assert.equal(d.day,madridDayKey(Date.now()));
});

test("la ruta /highscore/daily existe y responde con el marcador", () => {
  assert.match(source,/url\.pathname === "\/highscore\/daily"/);
  assert.match(source,/return json\(await highscoreDaily\(env\)\)/);
});

test("la medianoche del marcador es la de Madrid, no la de UTC", () => {
  // 4 de agosto de 2026, 00:30 en Madrid (CEST, UTC+2) = 3 de agosto 22:30 UTC.
  const madrugada=Date.UTC(2026,7,3,22,30);
  assert.equal(madridDayKey(madrugada),"2026-08-04");
  assert.equal(madridDayStart(madrugada),Date.UTC(2026,7,3,22,0),"el día empieza a las 22:00 UTC en verano");
  // Invierno (CET, UTC+1): el 15 de enero de 2026 empieza a las 23:00 UTC del 14.
  const invierno=Date.UTC(2026,0,15,10,0);
  assert.equal(madridDayStart(invierno),Date.UTC(2026,0,14,23,0));
});
