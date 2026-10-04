// Puertas del espejo (admira.biz) que Pages no puede dejar caer en el catch-all.
// El guardián de yokup.com ya redirige la flota; aquí está el mismo salto para
// el proyecto de Pages, más el alias /ayuda y el corte de las rutas que hoy
// devuelven la portada con un 200 (/llms.txt, /robots.txt, /.well-known/*).
// _redirects no puede devolver 404 (solo 301/302/303/307/308 y el proxy 200) y,
// además, una Function gana a _redirects: por eso el middleware lo aplica.
import { casaDe, marcaDeCasa } from "./casas.mjs";

export const LIVE = "https://www.admira.live";

// Igual que MUDADAS_A_ADMIRA_LIVE del guardián, solo las rutas de este encargo.
// /informes → /informes-flota: en admira.live /informes es otra aplicación.
export const FLOTA_A_LIVE = {
  "/highscore": "/highscore",
  "/misiones": "/misiones",
  "/normativa": "/normativa",
  "/tareas": "/tareas",
  "/objetivos": "/objetivos",
  "/notificaciones": "/notificaciones",
  "/decisiones": "/decisiones",
  "/informes": "/informes-flota",
  "/dashboard": "/dashboard",
  "/asistencia": "/asistencia",
};

export function rutaLimpia(pathname) {
  let path = String(pathname || "");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.toLowerCase().endsWith(".html")) path = path.slice(0, -5);
  return path;
}

export function esContratoAusente(pathname) {
  return pathname === "/llms.txt" || pathname === "/robots.txt" || pathname === "/.well-known" || String(pathname || "").startsWith("/.well-known/");
}

export function esContratoMarca(pathname) {
  return pathname === "/mcp/manifest.json" || pathname === "/mcp/llms.txt";
}

// Texto de manifest.json o llms.txt cuando el host es el espejo. En yokup.com
// y en Pages se deja el fichero canónico. api.yokup.com y los identificadores
// (yokup-fleet, yokup_whoami) no se tocan: es la misma regla que el HTML.
export function marcaCuerpoTexto(text, hostname) {
  const casa = casaDe(hostname);
  return casa ? marcaDeCasa(String(text), casa.name) : String(text);
}

export function marcaDocumento(html, hostname, pathname, sello = "") {
  const casa = casaDe(hostname);
  if (!casa) return String(html);
  let out = marcaDeCasa(String(html), casa.name);
  const v = sello ? "?v=" + encodeURIComponent(sello) : "";
  if (!out.includes('src="/yk-casa.js')) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><script src="/yk-casa.js${v}"></script>`);
  }
  if (!out.slice(0, 500).includes("data-casa=")) {
    out = out.replace(/<html([^>]*)>/i, `<html$1 data-casa="${casa.id}">`);
  }
  const canon = `<link rel="canonical" href="${casa.origin}${pathname}">`;
  if (/rel=["']canonical["']/i.test(out)) out = out.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, canon);
  return out;
}

function noEncontrado() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

// Respuesta que corta la petición, o null si sigue su curso.
// La flota y /ayuda solo en GET/HEAD (igual que el guardián). Las rutas que
// no existen contestan 404 en cualquier método: un POST no debe caer en la portada.
export function atajoDePagina(request) {
  let url;
  try { url = new URL(request.url); } catch (_) { return null; }
  if (esContratoAusente(url.pathname)) return noEncontrado();
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const limpia = rutaLimpia(url.pathname);
  const destino = FLOTA_A_LIVE[limpia];
  if (destino) return Response.redirect(LIVE + destino + url.search, 301);
  if (limpia === "/ayuda") {
    const barra = url.pathname.endsWith("/") ? "/" : "";
    return Response.redirect(new URL("/help" + barra + url.search, url), 301);
  }
  return null;
}
