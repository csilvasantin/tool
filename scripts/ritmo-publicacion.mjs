#!/usr/bin/env node
// ritmo-publicacion — TOPE DE CUATRO PUBLICACIONES POR HORA Y PROYECTO.
//
// Por qué existe. La noche del 9 al 10 de agosto de 2026 Yokup se publicó CINCO
// veces de madrugada (r1 00:01, r2 00:39, r3 00:57, r4 01:01, r5 08:05) más las
// del final de la tarde: veintiún commits entre las 22:46 y las 09:34. Nadie las
// pidió. Salieron del bucle OnIdle proponiendo mejoras y de los agentes
// implementándolas y publicándolas mientras Carlos dormía. Por la mañana se
// encontró el sitio cambiado, el aviso de «versión nueva · recarga» repicando
// sin parar y cosas movidas de sitio. Carlos: «tenemos que limitar al máximo 4
// actualizaciones cada hora de los proyectos».
//
// Cómo cuenta. Contra el HISTORIAL DE GIT, no contra un fichero local: publican
// varias máquinas a la vez y un contador local no ve lo que hizo el MacMini hace
// veinte minutos. Se cuentan los commits de sellado (`chore(release)`) de la
// última hora en origin/main —previo fetch— más los locales todavía sin subir.
//
// Cómo se salta, cuando hay que saltarlo. Un tope sin salida convierte una caída
// en una caída larga: si producción está rota, arreglarla es más urgente que el
// ritmo. PUBLICACION_URGENTE="<motivo>" publica igual, deja el motivo escrito en
// la salida y lo anuncia. Lo que no admite es saltárselo en silencio.
//
// Uso:  node scripts/ritmo-publicacion.mjs [--proyecto yokup-rtc] [--tope 4]
//       Sale 0 si se puede publicar, 1 si no.

import { execFileSync } from "node:child_process";

export const TOPE_POR_HORA = 4;
export const VENTANA_MINUTOS = 60;

function git(args, { silencioso = true } = {}) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", silencioso ? "ignore" : "inherit"] });
  } catch {
    return "";
  }
}

// Un sello es un commit de publicación. Se reconocen los dos formatos que ha
// usado la casa: «chore(release): sellar …» y el antiguo «sellar Yokup rN».
const ES_SELLO = /^(chore\(release\)|sellar\b)/i;

export function sellosRecientes(lineas, ahora = Date.now(), ventanaMinutos = VENTANA_MINUTOS) {
  const desde = ahora - ventanaMinutos * 60 * 1000;
  const vistos = new Map(); // hash → publicación, para no contar dos veces el mismo commit
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    const [hash, epoch, ...resto] = linea.split("");
    const asunto = resto.join("");
    if (!ES_SELLO.test(asunto.trim())) continue;
    const cuando = Number(epoch) * 1000;
    if (!Number.isFinite(cuando) || cuando < desde) continue;
    vistos.set(hash, { hash, cuando, asunto: asunto.trim() });
  }
  return [...vistos.values()].sort((a, b) => b.cuando - a.cuando);
}

function historial() {
  git(["fetch", "--quiet", "origin", "main"]);
  const formato = "--pretty=format:%H%at%s";
  const desde = `--since=${VENTANA_MINUTOS + 5} minutes ago`;
  // origin/main = lo que han publicado las demás máquinas. HEAD = lo mío sin subir.
  const remoto = git(["log", "origin/main", desde, formato]).split("\n");
  const local = git(["log", "HEAD", desde, formato]).split("\n");
  return [...remoto, ...local];
}

export function evaluar({ lineas, ahora = Date.now(), tope = TOPE_POR_HORA } = {}) {
  const sellos = sellosRecientes(lineas ?? historial(), ahora);
  const puede = sellos.length < tope;
  // Cuándo se libera un hueco: cuando el más antiguo de los que cuentan cumple la hora.
  const masAntiguo = sellos.length ? sellos[sellos.length - 1].cuando : null;
  const libreEn = puede || masAntiguo === null
    ? 0
    : Math.max(0, Math.ceil((masAntiguo + VENTANA_MINUTOS * 60 * 1000 - ahora) / 60000));
  return { puede, sellos, tope, libreEn };
}

function minutosDesde(cuando, ahora) {
  return Math.round((ahora - cuando) / 60000);
}

export function informe(resultado, { proyecto = "este proyecto", ahora = Date.now() } = {}) {
  const { sellos, tope, libreEn, puede } = resultado;
  const lineas = [];
  if (puede) {
    lineas.push(`  ✓ ritmo: ${sellos.length} de ${tope} publicaciones en la última hora`);
    return lineas.join("\n");
  }
  lineas.push(`✗ Publicación bloqueada: ${proyecto} ya lleva ${sellos.length} en la última hora (tope ${tope}).`);
  for (const s of sellos) {
    lineas.push(`    hace ${String(minutosDesde(s.cuando, ahora)).padStart(2)} min · ${s.hash.slice(0, 7)} ${s.asunto}`);
  }
  lineas.push(`  Se libera un hueco en ${libreEn} min. Junta los cambios en una sola publicación:`);
  lineas.push("  publicar seis veces por noche no es ir rápido, es no dejar dormir a nadie.");
  lineas.push('  Si producción está rota y esto no puede esperar: PUBLICACION_URGENTE="motivo" <deploy>');
  return lineas.join("\n");
}

// --- ejecutable ------------------------------------------------------------
const esPrincipal = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (esPrincipal) {
  const args = process.argv.slice(2);
  const valor = (nombre) => {
    const i = args.indexOf(nombre);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const proyecto = valor("--proyecto") ?? "este proyecto";
  const tope = Number(valor("--tope") ?? TOPE_POR_HORA);
  const ahora = Date.now();
  const resultado = evaluar({ tope, ahora });
  const urgente = (process.env.PUBLICACION_URGENTE ?? "").trim();

  if (resultado.puede) {
    console.log(informe(resultado, { proyecto, ahora }));
    process.exit(0);
  }
  console.error(informe(resultado, { proyecto, ahora }));
  if (urgente) {
    // Se deja pasar, pero por escrito y con nombre: una excepción anónima se
    // convierte en la norma a la tercera vez que alguien la usa.
    console.error(`\n  ⚠ SE PUBLICA POR URGENCIA declarada: «${urgente}»`);
    process.exit(0);
  }
  process.exit(1);
}
