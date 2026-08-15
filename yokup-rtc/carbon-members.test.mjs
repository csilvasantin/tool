import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import {
  CARBON_BEAT_WINDOW_MS,
  CARBON_MEMBERS_TABLE_SQL,
  CARBON_MEMBERS_INDEX_SQL,
  carbonId,
  carbonSkills,
  normalizeCarbonMember,
  carbonState,
  carbonRow,
  carbonBeat,
  carbonSeedSql
} from "./src/carbon-members.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function carbonDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(CARBON_MEMBERS_TABLE_SQL);
  db.exec(CARBON_MEMBERS_INDEX_SQL);
  return db;
}

test("el id de carbono sale SOLO del nombre: una persona no tiene apellido de máquina", () => {
  // Es la diferencia que hace posible el censo humano. La identidad de silicio
  // exige persona+máquina y sin ella responde 403; si el carbono heredara esa
  // regla no podría darse de alta nadie.
  assert.equal(carbonId("Sofía P."), "sofia-p");
  assert.equal(carbonId("Construcciones Oria"), "construcciones-oria");
  assert.equal(carbonId("  Javier   M.  "), "javier-m");
  // Mismo nombre → mismo id, escriba quien lo escriba y con o sin tilde.
  assert.equal(carbonId("Sofia P."), carbonId("Sofía P."));
  // Un nombre que no produce identificador no se cuela como cadena vacía.
  assert.equal(carbonId("¿?¡!"), "");
});

test("las habilidades entran como lista o como texto y SIEMPRE salen como lista limpia", () => {
  assert.deepEqual(carbonSkills("redes, players , redes"), ["redes", "players"]);
  assert.deepEqual(carbonSkills(["climatización", "LED", ""]), ["climatización", "LED"]);
  assert.deepEqual(carbonSkills(null), []);
});

test("el alta exige nombre y devuelve código, no excepción", () => {
  const sin = normalizeCarbonMember({ role: "técnico" }, 1000);
  assert.equal(sin.ok, false);
  assert.equal(sin.code, "carbon_name_required");

  const raro = normalizeCarbonMember({ name: "¿?" }, 1000);
  assert.equal(raro.ok, false);
  assert.equal(raro.code, "carbon_id_invalid");

  const alta = normalizeCarbonMember({
    name: "Laura R.", role: "técnica de campo", zone: "Barcelona",
    skills: ["redes", "players"], contact: "@laura", author: "NeoMBP16"
  }, 1000);
  assert.equal(alta.ok, true);
  assert.equal(alta.member.id, "laura-r");
  assert.equal(alta.member.name, "Laura R.");
  assert.equal(alta.member.status, "activo");
  assert.equal(alta.member.skills, "redes, players");
  assert.equal(alta.member.created_by, "NeoMBP16");
  assert.equal(alta.member.updated_at, 1000);
});

test("un estado inventado cae a activo y la baja se respeta", () => {
  assert.equal(normalizeCarbonMember({ name: "X", status: "jubilado" }, 1).member.status, "activo");
  assert.equal(normalizeCarbonMember({ name: "X", status: "baja" }, 1).member.status, "baja");
});

test("sin-latido NO es ausente: las tres respuestas del estado son distintas", () => {
  const ahora = 10 * 60 * 60 * 1e3;
  // Quien está en el censo y aún no ha aparecido.
  assert.equal(carbonState({ last_beat_at: 0 }, ahora), "sin-latido");
  // Quien latió dentro del turno.
  assert.equal(carbonState({ last_beat_at: ahora - 5 * 60 * 1e3 }, ahora), "en-turno");
  // Quien latió y dejó de hacerlo.
  assert.equal(carbonState({ last_beat_at: ahora - CARBON_BEAT_WINDOW_MS - 1 }, ahora), "ausente");
  // La baja manda sobre el latido: alguien dado de baja no está «en turno»
  // aunque su último latido sea de hace un minuto.
  assert.equal(carbonState({ status: "baja", last_beat_at: ahora - 60e3 }, ahora), "baja");
});

test("la ventana de carbono es un TURNO, no el ciclo de un demonio", () => {
  // Una persona que se va a comer no puede aparecer muerta a los seis minutos,
  // que es lo que pasaría midiéndola con la vara de la presencia de silicio.
  assert.equal(CARBON_BEAT_WINDOW_MS, 90 * 60 * 1e3);
  const ahora = 1e9;
  assert.equal(carbonState({ last_beat_at: ahora - 40 * 60 * 1e3 }, ahora), "en-turno");
});

test("la fila que ve el front trae estado y silencio calculados en el servidor", () => {
  const ahora = 1e9;
  const fila = carbonRow({
    id: "laura-r", name: "Laura R.", role: "técnica", zone: "Barcelona",
    skills: "redes, players", status: "activo",
    last_beat_at: ahora - 12 * 60 * 1e3, focus: "tótem de Gràcia", focus_at: ahora - 12 * 60 * 1e3
  }, ahora);
  assert.equal(fila.kind, "carbono");
  assert.equal(fila.estado, "en-turno");
  assert.equal(fila.silencio_ms, 12 * 60 * 1e3);
  assert.deepEqual(fila.skills, ["redes", "players"]);
  assert.equal(fila.focus, "tótem de Gràcia");

  // Sin latido no se inventa un silencio de 1970: va a null y el front lo pinta
  // como «aún no ha aparecido», no como «lleva 56 años callado».
  const nuevo = carbonRow({ id: "x", name: "X" }, ahora);
  assert.equal(nuevo.estado, "sin-latido");
  assert.equal(nuevo.silencio_ms, null);
  assert.equal(nuevo.last_beat_at, null);
});

test("un latido sin foco NO borra el foco anterior", () => {
  const conFoco = carbonBeat({ id: "laura-r", focus: "tótem de Gràcia" });
  assert.deepEqual(conFoco, { ok: true, id: "laura-r", focus: "tótem de Gràcia" });

  // focus:null es la señal de «no toques lo que había». Si esto devolviera ""
  // el UPDATE del handler machacaría el único dato que hace útil el latido.
  const sinFoco = carbonBeat({ id: "laura-r", focus: "   " });
  assert.equal(sinFoco.focus, null);

  // El latido admite el nombre y lo convierte al mismo id que el alta: el móvil
  // puede latir sin haberse leído antes el censo.
  assert.equal(carbonBeat({ name: "Laura R." }).id, "laura-r");
  assert.equal(carbonBeat({}).code, "carbon_id_required");
});

test("el censo persiste, es idempotente por id y el latido no pisa la ficha", () => {
  const db = carbonDb();
  const guardar = db.prepare(
    "INSERT INTO carbon_members(id,name,role,zone,skills,contact,status,created_at,updated_at,created_by) " +
    "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET " +
    "name=excluded.name, role=excluded.role, zone=excluded.zone, skills=excluded.skills, " +
    "contact=excluded.contact, status=excluded.status, updated_at=excluded.updated_at"
  );
  const alta = normalizeCarbonMember({ name: "Laura R.", zone: "Barcelona", skills: "redes" }, 1000).member;
  guardar.run(alta.id, alta.name, alta.role, alta.zone, alta.skills, alta.contact,
    alta.status, 1000, alta.updated_at, alta.created_by);

  // Latido con foco.
  db.prepare("UPDATE carbon_members SET last_beat_at=?, focus=COALESCE(?,focus), focus_at=CASE WHEN ? IS NULL THEN focus_at ELSE ? END WHERE id=?")
    .run(2000, "tótem de Gràcia", "tótem de Gràcia", 2000, "laura-r");

  // Segundo latido SIN foco: mantiene el anterior.
  const b = carbonBeat({ id: "laura-r" });
  db.prepare("UPDATE carbon_members SET last_beat_at=?, focus=COALESCE(?,focus), focus_at=CASE WHEN ? IS NULL THEN focus_at ELSE ? END WHERE id=?")
    .run(3000, b.focus, b.focus, 3000, b.id);

  let fila = db.prepare("SELECT * FROM carbon_members WHERE id=?").get("laura-r");
  assert.equal(fila.last_beat_at, 3000);
  assert.equal(fila.focus, "tótem de Gràcia");
  assert.equal(fila.focus_at, 2000, "el foco conserva SU hora, no la del latido mudo");

  // Editar la ficha no resucita ni borra el latido.
  const edicion = normalizeCarbonMember({ name: "Laura Ruiz", id: "laura-r", zone: "Girona" }, 4000).member;
  guardar.run(edicion.id, edicion.name, edicion.role, edicion.zone, edicion.skills, edicion.contact,
    edicion.status, 4000, edicion.updated_at, edicion.created_by);
  fila = db.prepare("SELECT * FROM carbon_members WHERE id=?").get("laura-r");
  assert.equal(fila.name, "Laura Ruiz");
  assert.equal(fila.zone, "Girona");
  assert.equal(fila.created_at, 1000, "el alta conserva su fecha de nacimiento");
  assert.equal(fila.last_beat_at, 3000, "editar la ficha no toca el latido");
  assert.equal(db.prepare("SELECT COUNT(*) c FROM carbon_members").get().c, 1);
});

test("la semilla es idempotente, no lee para escribir y conserva el orden del reparto", () => {
  const db = carbonDb();
  const roster = [
    { name: "Javier M.", skills: "climatización, LED", zone: "Madrid" },
    { name: "Laura R.", skills: "redes, players", zone: "Barcelona" },
    { name: "O'Brien e hijos", skills: "obra", zone: "Bilbao" }
  ];
  const sql = carbonSeedSql(roster, 1000);
  db.exec(sql);
  db.exec(sql);
  db.exec(sql);

  const filas = db.prepare("SELECT id,name,zone,created_at FROM carbon_members ORDER BY created_at ASC, id ASC").all();
  assert.equal(filas.length, 3, "tres ejecuciones no producen nueve personas");
  // El reparto de partes es hash(pantalla) % plantilla: si el orden cambiara,
  // cambiarían de técnico todas las incidencias abiertas sin que nadie lo pidiera.
  assert.deepEqual(filas.map((f) => f.name), ["Javier M.", "Laura R.", "O'Brien e hijos"]);
  assert.deepEqual(filas.map((f) => f.created_at), [1000, 1001, 1002]);
  // El apóstrofo no rompe el SQL ni se cuela como comilla escapada en el nombre.
  assert.equal(filas[2].name, "O'Brien e hijos");
  assert.equal(filas[2].id, "o-brien-e-hijos");

  // La semilla NO pisa a quien ya está: si alguien editó a Laura, la siguiente
  // ejecución respeta la edición en vez de devolverla a su estado de fábrica.
  db.prepare("UPDATE carbon_members SET zone=?, last_beat_at=? WHERE id=?").run("Girona", 5000, "laura-r");
  db.exec(sql);
  const laura = db.prepare("SELECT zone,last_beat_at FROM carbon_members WHERE id=?").get("laura-r");
  assert.equal(laura.zone, "Girona");
  assert.equal(laura.last_beat_at, 5000);
});

test("la semilla del worker se calcula una vez y con fecha fija, no en cada arranque", () => {
  // Si el `at` fuera Date.now(), dos isolates sembrarían fechas distintas y el
  // orden del reparto dependería de qué máquina arrancó antes.
  assert.match(source, /carbonSeedSql\(ROSTER, Date\.parse\("[0-9T:.Z-]+"\)\)/,
    "la semilla debe fijar su fecha, no leer el reloj");
  // Y se ejecuta con exec (una escritura idempotente) en vez de leer primero:
  // ensureSchema corre en CADA petición y un SELECT de guarda sería una lectura
  // por petición para no escribir nada casi nunca.
  assert.match(source, /await env\.DB\.exec\(CARBON_ROSTER_SEED_SQL\)/);
});

test("el worker deja de servir el equipo humano desde una constante escrita a mano", () => {
  // La regresión que este trabajo viene a impedir: /agents devolvía ROSTER, cinco
  // nombres inventados en el código. Si alguien vuelve a cablear ahí la respuesta,
  // este test lo canta.
  assert.match(source, /carbon_members/, "el worker debe conocer la tabla del censo de carbono");
  assert.match(source, /\/fleet\/carbon/, "el worker debe exponer el carril abierto del carbono");
  const handler = source.slice(source.indexOf('url.pathname === "/agents"'));
  const cuerpo = handler.slice(0, handler.indexOf("if (url.pathname"));
  assert.doesNotMatch(cuerpo, /ROSTER\.map/,
    "/agents no puede volver a servir la plantilla desde la constante ROSTER");
});
