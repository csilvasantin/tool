/* Portada de admira.app / yokup.com: el cuerpo visible sigue a html.lang.
 * Escucha el mismo aviso que la Suite (admiranext:lang) y el atributo lang.
 * No monta el marco de admiranext: solo traduce nodos de texto de esta casa.
 */
(function () {
  var DICC = {
    "Registro abierto. Los avisos automáticos aún no están activos.": "Registration is open. Automatic job alerts are not active yet.",
    "Define tu base de trabajo y tus especialidades. Prepárate para recibir avisos de equipos cercanos cuando se active la red.": "Set your work base and specialties. Get ready for nearby device alerts when the network goes live.",
    "Cuando se activen los avisos, consulta las incidencias de tu zona y acepta las que encajen contigo.": "Once alerts go live, review incidents in your area and accept the jobs that suit you.",
    "LA RED PARA INSTALADORES COMO TÚ": "THE NETWORK FOR INSTALLERS LIKE YOU",
    "Tu talento local.": "Your local skills.",
    "Una red global.": "A global network.",
    "Instala y mantén pantallas, redes y equipos conectados en": "Install and maintain screens, networks and connected devices in",
    "estancos, cafeterías y comercios de tu zona.": "tobacconists, cafés and shops in your area.",
    "Avisos según tu zona y especialidad": "Alerts matched to your area and skills",
    "Tú eliges qué intervenciones aceptar": "You choose which jobs to accept",
    "Todo el seguimiento en un solo lugar": "Track every job in one place",
    "Darme de alta como instalador": "Sign up as an installer",
    "Descubrir cómo funciona": "See how it works",
    "Crea tu perfil. Elige tu zona y tus especialidades.": "Create your profile. Set your area and specialties.",
    "¿Tienes un comercio?": "Do you run a shop?",
    "Accede a tu portal": "Open your portal",
    "EL MUNDO CONECTADO NECESITA TALENTO LOCAL.": "A CONNECTED WORLD NEEDS LOCAL SKILLS.",
    "Una red que llega lejos.": "A network that reaches far.",
    "Un trabajo que empieza cerca.": "Work that starts close to home.",
    "Tu experiencia, donde hace falta.": "Your skills, where they are needed.",
    "Pantallas": "Screens",
    "Redes": "Networks",
    "Equipos IoT": "IoT devices",
    "MÁS CONEXIONES. MENOS COMPLICACIONES.": "MORE CONNECTIONS. LESS COMPLICATION.",
    "Tú sabes resolverlo.": "You know how to fix it.",
    "Nosotros te conectamos.": "We make the connection.",
    "Una red para conectar tu experiencia con los comercios que necesitan cuidar su tecnología.": "A network connecting your skills with retailers who need to look after their technology.",
    "Trabajos cerca de ti": "Jobs close to you",
    "Indica tu base de trabajo y recibe avisos de equipos cercanos según tu especialidad y disponibilidad.": "Set your work base and receive alerts for nearby devices matched to your skills and availability.",
    "Tu ciudad. Tu zona.": "Your city. Your area.",
    "Tu oficio, a tu manera": "Your trade, your way",
    "Revisa los avisos y acepta las intervenciones que encajan contigo. Tú decides cuándo estás disponible.": "Review alerts and accept the jobs that suit you. You decide when you are available.",
    "Tú tienes el control.": "You are in control.",
    "Cada trabajo, en orden": "Every job, organised",
    "Gestiona tus intervenciones, documenta la solución y conserva el seguimiento desde tu portal.": "Manage your jobs, document the solution and keep track of progress from your portal.",
    "Del aviso a la solución.": "From the alert to the solution.",
    "¿Quieres ampliar tus conocimientos?": "Want to build your knowledge?",
    "Explora el entrenamiento": "Explore training",
    "ASÍ EMPIEZA TU PRÓXIMA CONEXIÓN": "YOUR NEXT CONNECTION STARTS HERE",
    "De tu perfil": "From your profile",
    "a la intervención.": "to the job.",
    "Empieza por lo que mejor conoces: tu oficio y tu zona.": "Start with what you know best: your trade and your area.",
    "Crea tu perfil": "Create your profile",
    "Regístrate como profesional o empresa. Indica tu base de trabajo y las especialidades que dominas.": "Sign up as a professional or business. Set your work base and the skills you specialise in.",
    "Encuentra tu siguiente intervención": "Find your next job",
    "Consulta los avisos de tu zona y acepta los que encajen con tu experiencia y disponibilidad.": "Review alerts in your area and accept those that match your experience and availability.",
    "Resuelve y deja tu huella": "Fix it and make your mark",
    "Realiza la intervención, documenta la solución y cierra el trabajo desde tu portal.": "Complete the visit, document the solution and close the job from your portal.",
    "EL SIGUIENTE PASO ES TUYO": "THE NEXT STEP IS YOURS",
    "Pon tu talento": "Put your skills",
    "en el mapa.": "on the map.",
    "Una red global necesita profesionales como tú.": "A global network needs professionals like you.",
    "Tu zona. Tu especialidad. Tu próxima conexión.": "Your area. Your skills. Your next connection.",
    "Reanudar giro": "Resume spin",

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
  var aplicando = false;
  function aplicar(lang) {
    if (aplicando) return;
    aplicando = true;
    try {
      if (lang === "en" || lang === "es") {
        try {
          if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
        } catch (e) {}
      }
      recorrer(document.body);
    } finally {
      aplicando = false;
    }
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
