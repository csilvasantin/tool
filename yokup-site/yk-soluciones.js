const API = "https://api.yokup.com/supervisor/soluciones?id=macmini-insta360";
const ORDEN = ["pantallas-izquierda", "pantallas-centro", "pantallas-derecha", "recreativa", "sala", "puerta"];
const NOMBRES = {
  "pantallas-izquierda": "Pantallas izquierda",
  "pantallas-centro": "Pantallas centro",
  "pantallas-derecha": "Pantallas derecha",
  recreativa: "Recreativa",
  sala: "Sala",
  puerta: "Puerta"
};
const FOTO = /^https:\/\/api\.yokup\.com\/media\/fleet\/[a-f0-9]{8,64}\.(?:jpe?g|png|webp)$/i;
const TICKET = /^https:\/\/www\.admira\.app\/ticket\?id=INC-[A-Z0-9]{4,16}$/;

const grid = document.getElementById("solGrid");
const recorrido = document.getElementById("solRecorrido");
const abiertas = document.getElementById("solAbiertas");
const cerradas = document.getElementById("solCerradas");
const cuando = document.getElementById("solCuando");
if (!grid) throw new Error("falta el tablero de soluciones");

function nombre(id) {
  return NOMBRES[id] || id;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function estadoTexto(estado) {
  if (estado === "apagada") return "Apagada";
  if (estado === "encendida") return "Encendida";
  return "Sin dato";
}

function lista(host, items, vacio) {
  host.replaceChildren();
  if (!items.length) {
    host.append(el("li", "sol-vacio", vacio));
    return;
  }
  for (const item of items) {
    const li = el("li");
    const linea = el("span", "", `${nombre(item.posicion || "")} · ${item.id}`.replace(/^ · /, ""));
    li.append(linea);
    if (TICKET.test(item.url || "")) {
      const a = el("a", "", "Ficha");
      a.href = item.url;
      a.rel = "noopener noreferrer";
      li.append(el("span", "sol-sep", " · "), a);
    }
    if (item.cuando) li.append(el("small", "", item.cuando));
    host.append(li);
  }
}

function pintar(data) {
  const porId = new Map((data.posiciones || []).map((p) => [p.id, p]));
  const ids = ORDEN.filter((id) => porId.has(id));
  for (const p of data.posiciones || []) if (!ids.includes(p.id)) ids.push(p.id);
  grid.replaceChildren();
  if (!ids.length) {
    grid.append(el("p", "sol-vacio", "El Mac Mini aún no ha publicado un recorrido."));
    recorrido.textContent = "Recorrido en espera";
  } else {
    const en = data.en || "";
    recorrido.textContent = en
      ? `Cámara en ${nombre(en)} · ciclo ${data.ciclo || 0}`
      : `Ciclo ${data.ciclo || 0}`;
    for (const id of ids) {
      const p = porId.get(id) || { id, estado: "sin-dato" };
      const card = el("article", `sol-card ${p.estado === "apagada" ? "apagada" : ""} ${id === en ? "mira" : ""}`.trim());
      card.append(el("p", "sol-nombre", nombre(id)));
      if (FOTO.test(p.foto || "")) {
        const img = el("img");
        img.src = p.foto;
        img.alt = `Captura pixelada de ${nombre(id)}`;
        card.append(img);
      } else {
        card.append(el("p", "sol-sin-foto", "Sin captura"));
      }
      const meta = el("p", "sol-meta");
      meta.append(el("b", p.estado || "sin-dato", estadoTexto(p.estado)));
      if (id === en) meta.append(el("span", "", " · cámara aquí"));
      if (typeof p.luz === "number") meta.append(el("span", "", ` · luz ${p.luz.toFixed(2)}`));
      card.append(meta);
      if (p.incidencia && TICKET.test(p.incidencia.url || "")) {
        const a = el("a", "sol-ticket", p.incidencia.id);
        a.href = p.incidencia.url;
        a.rel = "noopener noreferrer";
        card.append(a);
      }
      grid.append(card);
    }
  }
  lista(abiertas, data.abiertas || [], "Ninguna abierta");
  lista(cerradas, data.cerradas || [], "Ninguna cerrada");
  const updated = Number(data.updated_at) || 0;
  cuando.textContent = updated ? `Actualizado ${new Date(updated).toLocaleTimeString("es-ES")}` : "Sin publicación todavía";
}

async function leer() {
  const res = await fetch(API, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  pintar(await res.json());
}

let timer = 0;
function programar(ms) {
  window.clearTimeout(timer);
  timer = window.setTimeout(ciclo, ms);
}

async function ciclo() {
  if (document.hidden) {
    programar(5000);
    return;
  }
  try {
    await leer();
  } catch (error) {
    cuando.textContent = "Sin enlace con el estado en vivo";
  }
  programar(5000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) ciclo();
});
ciclo();
