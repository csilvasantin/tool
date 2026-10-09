/* Portada de admira.app / yokup.com: el cuerpo visible sigue a html.lang.
 * Escucha el mismo aviso que la Suite (admiranext:lang) y el atributo lang.
 * No monta el marco de admiranext: solo traduce nodos de texto de esta casa.
 */
(function () {
  var DICC = {
    "Saltar al contenido": "Skip to content",
    "Llamadas": "Calls",
    "Entrenamiento": "Training",
    "Instaladores": "Installers",
    "Comercios": "Retailers",
    "Entrar": "Sign in",
    "TECNOLOGÍA GLOBAL. TALENTO LOCAL.": "GLOBAL TECHNOLOGY. LOCAL TALENT.",
    "Un mundo": "A world",
    "conectado.": "connected.",
    "Personas que": "People who",
    "lo cuidan.": "look after it.",
    "Conectamos comercios e instaladores para cuidar de cada pantalla, cada equipo y cada experiencia.": "We connect retailers and installers to look after every screen, every device and every experience.",
    "Tengo un comercio": "I have a shop",
    "Soy instalador": "I am an installer",
    "Parte del ecosistema": "Part of the ecosystem",
    "UNA MISMA RED. TODO UN MUNDO.": "ONE NETWORK. A WHOLE WORLD.",
    "Preparando el mundo…": "Preparing the world…",
    "No se ha podido cargar el globo.": "The globe could not load.",
    "Puedes seguir accediendo a los portales.": "You can still open the portals.",
    "Volver a intentar": "Try again",
    "Arrastra para explorar": "Drag to explore",
    "Pausar giro": "Pause spin",
    "Vista global": "Global view",
    "Las personas y la tecnología.": "People and technology.",
    "En el mismo equipo.": "On the same team.",
    "Admira": "Admira",
    "CADA EQUIPO CUENTA": "EVERY DEVICE COUNTS",
    "Cerca cuando": "Close when",
    "hace falta.": "it is needed.",
    "Del primer aviso a la valoración final, un lugar para seguir cada intervención.": "From the first alert to the final rating, one place to follow each visit.",
    "Tu comercio, conectado": "Your shop, connected",
    "Da de alta tus establecimientos y equipos. Comunica una incidencia y consulta cómo avanza.": "Register your locations and devices. Report an incident and see how it moves forward.",
    "Ir al portal del comercio": "Go to the retailer portal",
    "El talento, cerca": "Talent, nearby",
    "Regístrate como instalador, indica dónde trabajas y gestiona las intervenciones de tu zona.": "Register as an installer, say where you work and manage the jobs in your area.",
    "Ir al portal del instalador": "Go to the installer portal",
    "El trabajo, bien cerrado": "The job, properly closed",
    "Sigue la reparación y valora la intervención. Tu experiencia ayuda a cuidar mejor de cada comercio.": "Follow the repair and rate the visit. Your experience helps look after every shop.",
    "Conectamos tecnología y personas.": "We connect technology and people.",
    "Para agentes": "For agents",
    "Plataforma": "Platform",
    "Asistencia": "Support",
    "Más sobre Yokup": "More about Yokup",
    "Un ecosistema conectado": "A connected ecosystem",
    "Globo terráqueo interactivo, sin ubicaciones seleccionadas": "Interactive globe, no locations selected",
    "Yokup, inicio": "Yokup, home",
    "Navegación principal": "Main navigation"
  };
  var original = new WeakMap();
  function idioma() {
    var lang = "";
    try { lang = String(document.documentElement.lang || "").toLowerCase(); } catch (e) {}
    return lang.indexOf("en") === 0 ? "en" : "es";
  }
  function saltar(node) {
    var p = node;
    while (p) {
      if (p.nodeType === 1) {
        var tag = String(p.tagName || "").toLowerCase();
        if (tag === "script" || tag === "style") return true;
        var cls = String(p.className || "");
        if (/(?:^|\s)(?:yk-lcli-log|yk-lcli-out|yk-lcli-in|yk-local-cli|yk-cli-out)(?:\s|$)/.test(cls)) return true;
      }
      p = p.parentNode;
    }
    return false;
  }
  function pintarNodo(node) {
    if (!node || node.nodeType !== 3 || saltar(node)) return;
    var raw = original.has(node) ? original.get(node) : node.nodeValue;
    if (!original.has(node)) original.set(node, raw);
    var core = String(raw).trim();
    if (!core || !Object.prototype.hasOwnProperty.call(DICC, core)) return;
    var lead = String(raw).match(/^\s*/)[0];
    var trail = String(raw).match(/\s*$/)[0];
    node.nodeValue = idioma() === "en" ? lead + DICC[core] + trail : raw;
  }
  function recorrer(node) {
    if (!node) return;
    if (node.nodeType === 3) { pintarNodo(node); return; }
    if (node.nodeType !== 1) return;
    if (saltar(node)) return;
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) recorrer(kids[i]);
  }
  function aplicar(lang) {
    if (lang === "en" || lang === "es") {
      try { document.documentElement.lang = lang; } catch (e) {}
    }
    recorrer(document.body);
  }
  function arrancar() {
    aplicar(idioma());
    try {
      document.addEventListener("admiranext:lang", function (ev) {
        aplicar(ev && ev.detail && ev.detail.lang);
      });
    } catch (e) {}
    try {
      if (window.MutationObserver && document.documentElement) {
        new MutationObserver(function () { aplicar(idioma()); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
      }
    } catch (e) {}
  }
  window.YkIdioma = { aplicar: aplicar, diccionario: DICC };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
