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
    "Entrar →": "Sign in →",
    "Tus equipos.": "Your devices.",
    "Tu tranquilidad.": "Your peace of mind.",
    "Crear cuenta de comercio": "Create a retailer account",
    "Crear cuenta →": "Create account →",
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
  var RETAILER = {
    "Yokup · Portal del comercio": "Yokup · Retailer portal",
    "Mi comercio": "My shop",
    "Circuitos ↗": "Circuits ↗",
    "Salir": "Sign out",
    "PORTAL DEL COMERCIO": "RETAILER PORTAL",
    "Pide ayuda, sigue la reparación y cuéntanos cómo ha ido. Pantallas, hilo musical, climatización y todos los equipos de tu comercio.": "Ask for help, follow the repair and tell us how it went. Screens, music, climate and every device in your shop.",
    "Un mismo circuito de atención": "One service circuit",
    "Admira controla los equipos. El instalador los mantiene. Tú confirmas que todo funciona.": "Admira watches the devices. The installer maintains them. You confirm that everything works.",
    "Abrir mis circuitos en Admira ↗": "Open my circuits in Admira ↗",
    "EL SERVICIO SIGUE HASTA TU VALORACIÓN": "THE SERVICE CONTINUES UNTIL YOU RATE IT",
    "¿Qué necesita tu comercio?": "What does your shop need?",
    "Pantallas": "Screens",
    "Hilo musical": "Background music",
    "Aire acondicionado": "Air conditioning",
    "Redes y otros IoT": "Networks and other IoT",
    "Elige el equipo y describe el problema": "Choose the device and describe the problem",
    "La incidencia llega a técnicos de su especialidad a menos de 40 km.": "The incident reaches technicians in that trade within 40 km.",
    "Sigue la intervención": "Follow the visit",
    "Consulta quién la atiende, el estado y la solución registrada.": "See who is handling it, the status and the recorded solution.",
    "Confirma y valora": "Confirm and rate",
    "Da tu opinión. Si sigue fallando, solicita una revisión desde la valoración.": "Give your opinion. If it still fails, ask for a review from the rating.",
    "Continuar con Google": "Continue with Google",
    "Tu nombre": "Your name",
    "Correo electrónico": "Email",
    "Contraseña": "Password",
    "· mínimo 12 caracteres": "· at least 12 characters",
    "Recordar mi usuario una semana": "Remember my user for a week",
    "Tu cuenta solo puede ver tus establecimientos e intervenciones. La cuenta de instalador es independiente.": "Your account can only see your locations and visits. The installer account is separate.",
    "¿Has olvidado la contraseña?": "Forgot your password?",
    "+ Comunicar incidencia": "+ Report an incident",
    "Buscando técnico": "Looking for a technician",
    "En manos del técnico": "With the technician",
    "Pendientes de tu valoración": "Waiting for your rating",
    "Garantías por vencer": "Warranties about to expire",
    "Mis establecimientos": "My locations",
    "Buscar establecimiento": "Search locations",
    "← Anteriores": "← Previous",
    "Siguientes →": "Next →",
    "Mis equipos": "My devices",
    "+ Equipo": "+ Device",
    "Establecimiento": "Location",
    "Todos mis establecimientos": "All my locations",
    "+ Añadir": "+ Add",
    "↑ Importar Excel": "↑ Import Excel",
    "Estado del equipo": "Device status",
    "Todos los equipos": "All devices",
    "Garantía por vencer (≤30 días)": "Warranty expiring (≤30 days)",
    "Garantía vencida": "Warranty expired",
    "Sin datos de garantía": "No warranty data",
    "Mantenimiento pendiente": "Maintenance due",
    "Retirados": "Retired",
    "Mis incidencias": "My incidents",
    "Actualizar ↻": "Refresh ↻",
    "Todas": "All",
    "En curso": "In progress",
    "Por valorar": "To rate",
    "Se muestran todas las incidencias en curso y las 200 resueltas más recientes. Los contadores incluyen todo tu histórico.": "All open incidents are shown, plus the 200 most recent resolved ones. The counters include your full history.",
    "ITIL · INVENTARIO TECNOLÓGICO": "ITIL · TECHNOLOGY INVENTORY",
    "Inventario ITIL": "ITIL inventory",
    "+ CI": "+ CI",
    "Yokup es el inventario maestro de los equipos de cada Xpacio: grupos, posiciones, códigos y garantía. XpaceOS, Pixeria, admira.app y clearchannel.tv lo leen desde aquí.": "Yokup is the master inventory of the devices in each Xpace: groups, positions, codes and warranty. XpaceOS, Pixeria, admira.app and clearchannel.tv read it from here.",
    "Establecimiento o Xpacio": "Location or Xpace",
    "Ver retirados": "Show retired",
    "Conectar un agente": "Connect an agent",
    "Crear token": "Create token",
    "Autoriza a tu asistente para trabajar en tu nombre. Elige sus permisos y revoca el acceso cuando lo necesites.": "Authorise your assistant to work on your behalf. Choose its permissions and revoke access when you need to.",
    "Servidor MCP:": "MCP server:",
    "Documentación pública y configuración ↗": "Public documentation and setup ↗",
    "Actualizar conexiones": "Refresh connections",
    "Actividad de mis agentes": "My agents' activity",
    "Últimas 100 operaciones. Un resultado por comprobar puede haberse aplicado; revisa la incidencia antes de repetirlo.": "Last 100 operations. A result still to check may already have been applied; review the incident before repeating it.",
    "Cargar actividad": "Load activity",
    "El comercio, el técnico y el circuito. Conectados.": "The shop, the technician and the circuit. Connected.",
    "Portal del instalador ↗": "Installer portal ↗",
    "TUS UBICACIONES, EN UN SOLO PASO": "YOUR LOCATIONS, IN ONE STEP",
    "Importar establecimientos": "Import locations",
    "Añade todas las ubicaciones de tu comercio desde un Excel. Revisa los datos antes de guardarlos.": "Add every location of your shop from an Excel file. Review the data before saving.",
    "1. Prepara tu archivo": "1. Prepare your file",
    "Nombre, tipo, país, ciudad, dirección, latitud y longitud. Código propio opcional. Hasta 500 ubicaciones por archivo.": "Name, type, country, city, address, latitude and longitude. Own code optional. Up to 500 locations per file.",
    "↓ Descargar plantilla Excel": "↓ Download Excel template",
    "2. Selecciona tu Excel": "2. Choose your Excel file",
    ".xlsx o .xls · máximo 5 MB · valores sin fórmulas": ".xlsx or .xls · 5 MB maximum · values without formulas",
    "Hoja de ubicaciones": "Locations sheet",
    "Las coordenadas permiten encontrar técnicos cercanos. Si faltan, complétalas antes de importar.": "Coordinates let us find nearby technicians. If they are missing, fill them in before importing.",
    "Al confirmar, el nombre, tipo, dirección y coordenadas de estos establecimientos serán públicos en los mapas de admira.app y clearchannel.tv. Tu cuenta y tus incidencias siguen siendo privadas.": "When you confirm, the name, type, address and coordinates of these locations become public on the admira.app and clearchannel.tv maps. Your account and your incidents stay private.",
    "Volver a comprobar": "Check again",
    "Importar y publicar en mapas": "Import and publish on the maps",
    "Publicar establecimiento": "Publish location",
    "Su nombre, tipo, dirección y coordenadas serán públicos en los mapas de admira.app y clearchannel.tv. Tu cuenta, tus equipos privados y tus incidencias no se publican.": "Its name, type, address and coordinates become public on the admira.app and clearchannel.tv maps. Your account, your private devices and your incidents are not published.",
    "Publicar en ambos mapas": "Publish on both maps",
    "Tu establecimiento": "Your location",
    "Nombre del establecimiento": "Location name",
    "Tipo": "Type",
    "Estanco": "Tobacconist",
    "Kiosco": "Kiosk",
    "Supermercado": "Supermarket",
    "Hostelería": "Hospitality",
    "Otro comercio o circuito": "Other shop or circuit",
    "País": "Country",
    "Ciudad": "City",
    "Dirección de intervención": "Service address",
    "Ubicación del establecimiento": "Location of the shop",
    "Usar ubicación actual ↗": "Use current location ↗",
    "Úsala si estás en el comercio. También puedes introducir sus coordenadas. Así avisaremos a técnicos cercanos.": "Use it if you are at the shop. You can also enter its coordinates. That way we notify nearby technicians.",
    "Latitud": "Latitude",
    "Longitud": "Longitude",
    "Guardar establecimiento": "Save location",
    "Añadir equipo": "Add device",
    "Nombre del equipo": "Device name",
    "Tipo de equipo": "Device type",
    "Hilo musical / audio": "Background music / audio",
    "Aire acondicionado / climatización": "Air conditioning / climate",
    "Player": "Player",
    "Red / conectividad": "Network / connectivity",
    "Kiosco interactivo": "Interactive kiosk",
    "Sensor / otro IoT": "Sensor / other IoT",
    "Puedes comunicar incidencias desde el alta. La vinculación con el inventario de Admira la confirma el responsable del circuito.": "You can report incidents from this form. Linking to the Admira inventory is confirmed by the circuit owner.",
    "Guardar equipo": "Save device",
    "INVENTARIO Y CICLO DE VIDA": "INVENTORY AND LIFECYCLE",
    "Ficha del equipo": "Device record",
    "Categoría": "Category",
    "Pantalla": "Screen",
    "IoT / sensor": "IoT / sensor",
    "Audio": "Audio",
    "TPV": "POS",
    "Red": "Network",
    "Mobiliario": "Furniture",
    "Iluminación": "Lighting",
    "Otro": "Other",
    "Estado": "Status",
    "Operativo": "Operational",
    "Degradado": "Degraded",
    "En mantenimiento": "In maintenance",
    "Planificado": "Planned",
    "Retirado": "Retired",
    "Fabricante": "Manufacturer",
    "Modelo": "Model",
    "Número de serie": "Serial number",
    "Proveedor": "Supplier",
    "Fecha de compra": "Purchase date",
    "Factura / albarán": "Invoice / delivery note",
    "Inicio de garantía": "Warranty start",
    "Fin de garantía": "Warranty end",
    "Instalado el": "Installed on",
    "Instalado por": "Installed by",
    "Mantenimiento cada (días)": "Maintenance every (days)",
    "Último mantenimiento": "Last maintenance",
    "Fecha de retirada": "Retirement date",
    "Notas": "Notes",
    "Solo datos reales de factura, albarán o parte. Un campo vacío queda «sin datos»: nunca se da una garantía por vigente sin su fecha.": "Only real data from an invoice, delivery note or report. An empty field stays “no data”: a warranty is never treated as valid without its date.",
    "Guardar ficha": "Save record",
    "Comunicar una incidencia": "Report an incident",
    "Equipo": "Device",
    "¿Qué ocurre?": "What is happening?",
    "Cuéntanos el problema": "Tell us the problem",
    "Prioridad": "Priority",
    "Normal · permite seguir trabajando": "Normal · you can keep working",
    "Urgente · afecta a la actividad del comercio": "Urgent · it affects the shop's work",
    "Avisaremos en el portal a instaladores disponibles de esta especialidad a menos de 40 km. La asignación se confirma cuando uno acepta.": "We will notify available installers in this trade within 40 km. The assignment is confirmed when one accepts.",
    "Enviar incidencia →": "Send incident →",
    "¿Cómo ha ido la intervención?": "How did the visit go?",
    "Valora al técnico": "Rate the technician",
    "1 ★": "1 ★",
    "2 ★": "2 ★",
    "3 ★": "3 ★",
    "4 ★": "4 ★",
    "5 ★": "5 ★",
    "¿El equipo vuelve a funcionar?": "Is the device working again?",
    "Selecciona…": "Choose…",
    "Sí, funciona correctamente": "Yes, it works",
    "No, necesito una revisión": "No, I need a review",
    "Tu comentario": "Your comment",
    "La valoración quedará vinculada a esta intervención. Si el equipo sigue fallando, abriremos una revisión y conservaremos el historial.": "The rating stays linked to this visit. If the device still fails, we open a review and keep the history.",
    "Enviar valoración": "Send rating",
    "Autorizar una integración": "Authorise an integration",
    "Nombre del agente o integración": "Agent or integration name",
    "Duración": "Duration",
    "7 días": "7 days",
    "30 días": "30 days",
    "90 días": "90 days",
    "Permisos que autorizas": "Permissions you grant",
    "Empieza con consulta. Habilita acciones solo si quieres que el agente las realice en tu nombre. Nunca compartas este token en chats públicos.": "Start with read access. Enable actions only if you want the agent to perform them for you. Never share this token in public chats.",
    "Crear token privado": "Create private token",
    "Token · visible una sola vez": "Token · shown only once",
    "Copiar token": "Copy token",
    "Guárdalo en un gestor de secretos. Si lo pierdes, revócalo y crea otro. No se guarda en el navegador.": "Keep it in a secret manager. If you lose it, revoke it and create another. It is not stored in the browser.",
    "INVENTARIO ITIL": "ITIL INVENTORY",
    "Nuevo CI": "New CI",
    "Código ITIL": "ITIL code",
    "Uso / rol": "Use / role",
    "Grupo": "Group",
    "Posición": "Position",
    "Orientación": "Orientation",
    "Sin indicar": "Not set",
    "Horizontal": "Horizontal",
    "Vertical": "Vertical",
    "Depende de": "Depends on",
    "Compra y garantía (solo datos reales de factura o albarán)": "Purchase and warranty (only real invoice or delivery-note data)",
    "Garantía (meses)": "Warranty (months)",
    "Si no hay fin, se calcula: inicio de garantía (o compra) + meses.": "If there is no end date, it is calculated: warranty start (or purchase) + months.",
    "Un campo vacío queda «sin datos». Serie, proveedor y factura son privados: las soluciones de la Galaxia solo reciben el estado de la garantía.": "An empty field stays “no data”. Serial, supplier and invoice are private: Galaxy solutions only receive the warranty status.",
    "Guardar CI": "Save CI",
    "Retirar CI": "Retire CI",
    "Motivo de la retirada": "Reason for retirement",
    "No se borra: queda retirado con el motivo en su ficha.": "It is not deleted: it stays retired with the reason on its record.",
    "Retirar": "Retire",
    "Portales de Yokup": "Yokup portals",
    "Nombre, dirección, ciudad o código": "Name, address, city or code",
    "Filtrar incidencias": "Filter incidents",
    "Cerrar": "Close",
    "Vista previa de ubicaciones": "Location preview",
    "Estanco de la plaza": "Plaza tobacconist",
    "Pantalla del escaparate": "Window screen",
    "La pantalla no enciende": "The screen does not turn on",
    "Desde cuándo sucede y qué has observado.": "Since when it happens and what you have seen.",
    "Tu experiencia y, si sigue fallando, qué problema persiste.": "Your experience and, if it still fails, what problem remains.",
    "MI COMERCIO": "MY SHOP",
    "No se ha podido conectar con el portal. Vuelve a intentarlo.": "Could not connect to the portal. Try again.",
    "Mi asistente de mantenimiento": "My maintenance assistant",
    "Menu board de caja": "Checkout menu board",
    "menu board, escaparate, música…": "menu board, window, music…",
    "Caja, Escaparate, Sala…": "Checkout, Window, Room…",
    "Pared caja · izquierda": "Checkout wall · left",
    "Sustituido por…": "Replaced by…"
  };
  Object.keys(RETAILER).forEach(function (clave) { DICC[clave] = RETAILER[clave]; });
  var original = new WeakMap();
  var attrOriginal = new WeakMap();
  var tituloOriginal = "";
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
  function pintarAttrs(el) {
    if (!el || typeof el.getAttribute !== "function" || typeof el.setAttribute !== "function") return;
    var saved = attrOriginal.get(el);
    if (!saved) { saved = {}; attrOriginal.set(el, saved); }
    var names = ["placeholder", "aria-label", "title"];
    for (var a = 0; a < names.length; a++) {
      var name = names[a];
      var current = el.getAttribute(name);
      if (current == null) continue;
      if (!Object.prototype.hasOwnProperty.call(saved, name)) saved[name] = current;
      var raw = saved[name];
      var core = String(raw).trim();
      if (!core || !Object.prototype.hasOwnProperty.call(DICC, core)) continue;
      var lead = String(raw).match(/^\s*/)[0];
      var trail = String(raw).match(/\s*$/)[0];
      el.setAttribute(name, idioma() === "en" ? lead + DICC[core] + trail : raw);
    }
  }
  function pintarNodo(node) {
    if (!node || node.nodeType !== 3 || saltar(node)) return;
    var live = node.nodeValue;
    var liveCore = String(live == null ? "" : live).trim();
    // El portal escribe frases después del primer pase. Si el texto vivo es una
    // clave, esa frase es la fuente, aunque el nodo naciera vacío.
    if (liveCore && Object.prototype.hasOwnProperty.call(DICC, liveCore)) original.set(node, live);
    else if (!original.has(node)) original.set(node, live);
    var raw = original.get(node);
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
    pintarAttrs(node);
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
      try {
        if (typeof document.title === "string") {
          if (!tituloOriginal) tituloOriginal = document.title;
          var tcore = String(tituloOriginal).trim();
          if (tcore && Object.prototype.hasOwnProperty.call(DICC, tcore)) document.title = idioma() === "en" ? DICC[tcore] : tituloOriginal;
        }
      } catch (e) {}
      recorrer(document.body);
    } finally {
      aplicando = false;
    }
  }
  function pedidoUrl() {
    try {
      var q = String(new URLSearchParams(location.search).get("lang") || "").toLowerCase();
      if (q === "en" || q === "eng" || q === "english") return "en";
      if (q === "es" || q === "esp" || q === "spanish" || q === "espanol") return "es";
    } catch (e) {}
    return "";
  }
  function arrancar() {
    if (idioma() === "en" || pedidoUrl() === "en") {
      try {
        if (document.body && document.body.getAttribute("data-yk-title") === "MI COMERCIO") {
          document.body.setAttribute("data-yk-title", "MY SHOP");
        }
      } catch (e) {}
    }
    aplicar(pedidoUrl() || idioma());
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
