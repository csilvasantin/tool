import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {coachLessonForSlot,coachLessonForDimension,COACH_HOUR} from "../src/academy-coach.js";

// Carlos, 2026-08-09: «lanzan la cápsula de conocimiento de las 3 predefinidas que
// toca; lo que tiene que hacer a partir de ahora es lanzar como predefinida la que
// toca y dejarme escoger las otras dos (si toca tech, esa se define por defecto pero
// permite escoger creativity o business) en la ventana de decisión».
//
// Lo que se fija aquí: que la ventana enseña LAS TRES, que la ★ es la de la rueda,
// que elegir otra CAMBIA de verdad la cápsula de esa hora, y que tres opciones con
// `parent_decision` puesto siguen sin materializar una sola misión.
const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`);return m[0];
};
const grabVar=name=>{
  const re=new RegExp(`var ${name} = [^\\n]+;`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`);return m[0];
};
const grabVarMulti=name=>{
  const re=new RegExp(`var ${name} = \\[[^]*?\\n\\];`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`);return m[0];
};

function harness(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE decisions(id TEXT PRIMARY KEY,machine TEXT,agent TEXT,surface TEXT,question TEXT,options TEXT,recommended INTEGER,chosen INTEGER,status TEXT,created_at INTEGER,deadline INTEGER,url TEXT,mission TEXT,project TEXT,project_slug TEXT,parent_decision TEXT,batch_id TEXT)");
  db.exec("CREATE TABLE academy_capsulas(hour_start INTEGER PRIMARY KEY,seat TEXT,tema TEXT,source TEXT,capsule_id TEXT,title TEXT,note TEXT,url TEXT,at INTEGER,agent TEXT,decision_id TEXT,smith_status TEXT,smith_agent TEXT,smith_stage TEXT,smith_detail TEXT,smith_progress INTEGER,smith_source_url TEXT,smith_video_id TEXT,smith_capsule_id TEXT,smith_updated_at INTEGER)");
  const DB={
    prepare(sql){const stmt=db.prepare(sql);return{
      bind(...args){return{first:async()=>stmt.get(...args)||null,run:async()=>({meta:stmt.run(...args)}),all:async()=>({results:stmt.all(...args)})}},
      first:async()=>stmt.get()||null,run:async()=>({meta:stmt.run()}),all:async()=>({results:stmt.all()})}},
    exec:async()=>{}
  };
  const context=vm.createContext({Map,Set,Array,String,Number,Date,RegExp,Math,Object,JSON,Promise,Error,parseInt,
    coachLessonForSlot,coachLessonForDimension,COACH_HOUR,
    COUNCIL:{cto:{role:"CTO",alias:"Ada"},cco:{role:"CCO",alias:"Rick"},ceo:{role:"CEO",alias:"Steve"}},
    resolveDecisionIdentity:(agent,machine)=>({ok:true,agent,machine}),
    ensureAcademyCapsuleSchema:async()=>{},
    isInitialMissionDecision:()=>false,
    isContinuationMissionDecision:()=>true,   // el peor caso: la FORMA sí encaja
    __name:(fn)=>fn});
  vm.runInContext([
    grabVar("ACADEMY_HORA_MS"),grabVarMulti("ACADEMY_TEMAS"),grabVarMulti("ACADEMY_TURNOS"),
    grabVar("ACADEMY_DECISION_PARENT"),grabVar("ACADEMY_DECISION_MIN"),grabVar("ACADEMY_ELECCION_VENTANA_MS"),
    grab("academyTemaDeFranja"),grab("academyCapsulaDeLeccion"),
    grab("abreVentanaFormacion"),grab("academyHourFromDecisionId"),
    grab("aplicaEleccionFormacion"),grab("aplicaEleccionesFormacion"),grab("isMissionDecision")
  ].join("\n"),context);
  return{db,env:{DB},F:context};
}

// Una hora cualquiera en punto. La temática que toca la manda el Coach, no el test:
// clavar aquí «tecnología» ataría el test a la fase del reloj del 9 de agosto.
const HORA=Math.floor(Date.now()/COACH_HOUR)*COACH_HOUR;
const TEMAS=["tecnologia","creatividad","negocio"];
const tocaId=()=>{
  const {dimension}=coachLessonForSlot(Math.floor(HORA/COACH_HOUR));
  return dimension;
};

async function abre(F,env){
  const {tema,lessonId}=F.academyTemaDeFranja(Math.floor(HORA/COACH_HOUR));
  const seat=tema.seats[0];
  return {r:await F.abreVentanaFormacion(env,{hourStart:HORA,tema,seat,capsula:{title:"Lección "+lessonId}}),tema,seat};
}

test("la ventana ofrece las tres temáticas y recomienda la que toca", async () => {
  const {db,env,F}=harness();
  const {r,tema}=await abre(F,env);
  assert.equal(r.ok,true);
  const fila=db.prepare("SELECT * FROM decisions WHERE id=?").get("DCL-form-"+HORA.toString(36));
  const opciones=JSON.parse(fila.options);
  assert.equal(opciones.length,3,"las tres temáticas, no sólo la que toca");
  assert.deepEqual(opciones,[
    "Atender la cápsula de Tecnología en admira.academy",
    "Atender la cápsula de Creatividad en admira.academy",
    "Atender la cápsula de Negocio en admira.academy"
  ],"orden fijo: el índice guardado en `chosen` tiene que significar lo mismo cada hora");
  assert.equal(TEMAS[fila.recommended],tema.id,"la ★ es la de la rueda del Coach");
  assert.match(fila.question,/Puedes cambiar la temática/,"la pregunta dice que se puede cambiar");
});

test("la ventana dura lo que su hora, no dos minutos", async () => {
  // Con 24 ventanas al día y 2 minutos cada una, «dejarme escoger» era teórico.
  const {db,env,F}=harness();
  await abre(F,env);
  const fila=db.prepare("SELECT * FROM decisions WHERE id=?").get("DCL-form-"+HORA.toString(36));
  assert.equal(fila.deadline,HORA+3600000,"se cierra con su hora: después, su cápsula ya no es la de ahora");
  assert.ok(fila.deadline-fila.created_at>=2*60*1000,"nunca menos que el mínimo de la casa");
});

test("elegir otra temática cambia de verdad la cápsula de esa hora", async () => {
  const {db,env,F}=harness();
  const {tema,seat}=await abre(F,env);
  const {lessonId}=F.academyTemaDeFranja(Math.floor(HORA/COACH_HOUR));
  db.prepare("INSERT INTO academy_capsulas(hour_start,seat,tema,source,capsule_id,title,note,url,at,smith_status,smith_stage,smith_progress) VALUES(?,?,?,?,?,?,?,?,?,'pending','queued',0)")
    .run(HORA,seat,tema.id,"academia/leccion",lessonId,"Lección vieja","nota","u",HORA);

  // Carlos elige una temática distinta de la que tocaba.
  const otra=TEMAS.filter(t=>t!==tema.id)[0];
  const idx=TEMAS.indexOf(otra);
  db.prepare("UPDATE decisions SET status='decided',chosen=? WHERE id=?").run(idx,"DCL-form-"+HORA.toString(36));
  const d=db.prepare("SELECT * FROM decisions WHERE id=?").get("DCL-form-"+HORA.toString(36));
  const res=await F.aplicaEleccionFormacion(env,d);

  assert.equal(res.cambiada,true);
  const fila=db.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").get(HORA);
  assert.equal(fila.tema,otra,"la cápsula pasa a la temática elegida");
  assert.equal(fila.capsule_id,coachLessonForDimension(Math.floor(HORA/COACH_HOUR),otra).lessonId,
    "y con la lección que le toca a ESA temática en este ciclo, no la primera de su catálogo");
  assert.equal(fila.smith_status,"pending","Smith vuelve a la cola: la cápsula de antes ya no vale");
  assert.equal(fila.smith_progress,0);
  const dec=db.prepare("SELECT mission FROM decisions WHERE id=?").get("DCL-form-"+HORA.toString(36));
  assert.equal(dec.mission,"formacion:"+otra,"el histórico no puede decir una temática y la Academia otra");
});

test("aplicar dos veces no escribe dos veces", async () => {
  const {db,env,F}=harness();
  const {tema,seat}=await abre(F,env);
  db.prepare("INSERT INTO academy_capsulas(hour_start,seat,tema,source,capsule_id,title,note,url,at,smith_status) VALUES(?,?,?,?,?,?,?,?,?,'pending')")
    .run(HORA,seat,tema.id,"academia/leccion","x","t","n","u",HORA);
  const id="DCL-form-"+HORA.toString(36);
  const otra=TEMAS.filter(t=>t!==tema.id)[0];
  db.prepare("UPDATE decisions SET status='decided',chosen=? WHERE id=?").run(TEMAS.indexOf(otra),id);
  const d=db.prepare("SELECT * FROM decisions WHERE id=?").get(id);
  assert.equal((await F.aplicaEleccionFormacion(env,d)).cambiada,true);
  assert.equal((await F.aplicaEleccionFormacion(env,d)).cambiada,false,"el barrido repasa la misma ventana en cada tick");
});

test("una cápsula ya verificada por Smith no se cambia por detrás", async () => {
  // Con vídeo y texto publicados en Pixeria, cambiarle la temática debajo dejaría a
  // la Academia enseñando una cosa y diciendo que es otra.
  const {db,env,F}=harness();
  const {tema,seat}=await abre(F,env);
  db.prepare("INSERT INTO academy_capsulas(hour_start,seat,tema,source,capsule_id,title,note,url,at,smith_status) VALUES(?,?,?,?,?,?,?,?,?,'verified')")
    .run(HORA,seat,tema.id,"pixeria/capsula","cap","t","n","u",HORA);
  const id="DCL-form-"+HORA.toString(36);
  const otra=TEMAS.filter(t=>t!==tema.id)[0];
  db.prepare("UPDATE decisions SET status='decided',chosen=? WHERE id=?").run(TEMAS.indexOf(otra),id);
  const res=await F.aplicaEleccionFormacion(env,db.prepare("SELECT * FROM decisions WHERE id=?").get(id));
  assert.equal(res.ok,false);
  assert.equal(res.code,"capsula_verificada");
  assert.equal(db.prepare("SELECT tema FROM academy_capsulas WHERE hour_start=?").get(HORA).tema,tema.id);
});

test("si nadie contesta, vence con la recomendada — la rueda sigue mandando", async () => {
  const {db,env,F}=harness();
  const {tema,seat}=await abre(F,env);
  db.prepare("INSERT INTO academy_capsulas(hour_start,seat,tema,source,capsule_id,title,note,url,at,smith_status) VALUES(?,?,?,?,?,?,?,?,?,'pending')")
    .run(HORA,seat,tema.id,"academia/leccion","x","t","n","u",HORA);
  db.prepare("UPDATE decisions SET status='expired' WHERE id=?").run("DCL-form-"+HORA.toString(36));
  const res=await F.aplicaEleccionesFormacion(env,HORA+1000);
  assert.equal(res.revisadas,1);
  assert.equal(db.prepare("SELECT tema FROM academy_capsulas WHERE hour_start=?").get(HORA).tema,tema.id,
    "vencer sin respuesta deja exactamente lo que había: la temática de la rueda");
});

test("tres opciones con parent_decision NO materializan misiones", () => {
  // El sandbox está montado con isContinuationMissionDecision()===true a propósito:
  // aunque la FORMA encaje, el nombre de la ventana tiene que bastar para pararlo.
  const {F}=harness();
  const opciones=["Atender la cápsula de Tecnología en admira.academy",
                  "Atender la cápsula de Creatividad en admira.academy",
                  "Atender la cápsula de Negocio en admira.academy"];
  assert.equal(F.isMissionDecision(opciones,{parent_decision:"FORMACION"}),false);
  assert.equal(F.isMissionDecision(opciones,{parent_decision:"BATCH-otra"}),true,
    "y no se lleva por delante las continuaciones de verdad");
});

test("la hora sale del id de la ventana, no de created_at", () => {
  const {F}=harness();
  assert.equal(F.academyHourFromDecisionId("DCL-form-"+HORA.toString(36)),HORA);
  assert.equal(F.academyHourFromDecisionId("DCL-form-zzz"),null,"un id que no cae en hora en punto no vale");
  assert.equal(F.academyHourFromDecisionId("DCL-1234"),null);
  assert.equal(F.academyHourFromDecisionId(""),null);
});

test("elegir la misma temática a otra hora no repite lección", () => {
  // El ciclo avanza aunque la dimensión se escoja a mano.
  const a=coachLessonForDimension(Math.floor(HORA/COACH_HOUR),"creatividad").lessonId;
  const b=coachLessonForDimension(Math.floor(HORA/COACH_HOUR)+3,"creatividad").lessonId;
  assert.notEqual(a,b,"tres franjas después es la vuelta siguiente del reloj");
});
