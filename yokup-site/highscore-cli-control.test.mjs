import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){
      if(escaped)escaped=false;
      else if(char==="\\")escaped=true;
      else if(char===quote)quote="";
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`funcion ${name} incompleta`);
}

// El panel se prueba sin navegador: se extraen las funciones puras del HTML y se
// ejecutan con el mínimo entorno que necesitan (normaliza, esc y las constantes).
function cliApi(){
  // `esc` no se extrae: su regex lleva comillas y despista al lector de llaves.
  // Se replica su escape exacto, que es lo único que necesita el render.
  const funciones=["normaliza","hsCliKey","hsCliVerbos","hsCliEstado","hsCliGrupos","hsCliAccionAria","hsCliEsperaTexto","hsCliFila"]
    .map(functionSource).join("\n");
  return new Function(`
    var CLI_CICLO_SEG=20,CLI_PENDIENTES={};
    function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
    ${funciones}
    return {
      key:hsCliKey,estado:hsCliEstado,grupos:hsCliGrupos,aria:hsCliAccionAria,espera:hsCliEsperaTexto,
      fila:function(item,pendientes){CLI_PENDIENTES=pendientes||{};return hsCliFila(item);}
    };
  `)();
}

const VIVO={cli:"smith-grok",label:"Smith · Grok (OpenCode)",machine:"MacBookAir16plata",alive:true,pid:28330,seen_at:1786194282953,state:"vivo"};
const PARADO={...VIVO,alive:false,pid:null,state:"parado"};
const MUDO={cli:"smith-grok",label:"Smith · Grok (OpenCode)",machine:"MacBookPro14",alive:null,pid:null,seen_at:null,state:"sin noticias"};

test("el panel consume GET /fleet/cli del worker y lo refresca solo",()=>{
  assert.match(source,/data-yk-slot="right"[^>]*id="cliControl"/);
  assert.match(source,/id="cliCtlList"/);
  assert.match(source,/id="cliCtlCount"/);
  assert.match(source,/fetch\(YK \+ "\/fleet\/cli", \{ cache:"no-store" \}\)/);
  assert.match(source,/CLI_ITEMS = \(d && d\.items\) \|\| \[\]/);
  assert.match(source,/function hsRenderCliControl\(/);
  assert.match(source,/iniciaCliControl\(\);/);
  assert.match(source,/setInterval\(function \(\) \{ hsCargaCliControl\(\); \}, CLI_REFRESCO_MS\)/);
});

test("los CLIs se agrupan por ordenador, con su estado y su recuento",()=>{
  const api=cliApi(),grupos=api.grupos([MUDO,VIVO]);
  assert.deepEqual(grupos.map(g=>g.machine),["MacBookAir16plata","MacBookPro14"]);
  assert.deepEqual(grupos.map(g=>g.items.length),[1,1]);
  assert.equal(api.key(VIVO),"MacBookAir16plata|smith-grok");
  assert.equal(api.key(MUDO),"MacBookPro14|smith-grok");
  assert.match(source,/<legend class="sr-only">CLIs de/);
  assert.match(source,/count\.textContent = CLI_ITEMS\.length \? vivos \+ "\/" \+ CLI_ITEMS\.length \+ " vivos"/);
});

test("«sin noticias» NO se pinta como «parado»: color, icono, rótulo y title distintos",()=>{
  const api=cliApi(),parado=api.estado(PARADO),mudo=api.estado(MUDO);

  assert.equal(parado.clave,"parado");
  assert.equal(mudo.clave,"sin noticias");
  assert.notEqual(parado.tono,mudo.tono);
  assert.notEqual(parado.punto,mudo.punto);
  assert.notEqual(parado.etiqueta,mudo.etiqueta);
  assert.notEqual(parado.titulo,mudo.titulo);

  // «parado» es un HECHO que declara su máquina viva.
  assert.match(parado.titulo,/late y confirma que el CLI NO está corriendo/);
  assert.match(parado.titulo,/hecho/i);
  // «sin noticias» es IGNORANCIA: nadie late allí y podría estar corriendo.
  assert.match(mudo.titulo,/Nadie late en MacBookPro14/i);
  assert.match(mudo.titulo,/No es lo mismo que estar parado/i);
  assert.equal(mudo.ciego,true);
  assert.equal(parado.ciego,false);

  // Y el HTML final los separa de verdad: clase de estado y botón marcados.
  const filaParado=api.fila(PARADO),filaMudo=api.fila(MUDO);
  assert.match(filaParado,/class="cli-ctl-state parada"/);
  assert.match(filaMudo,/class="cli-ctl-state muda"/);
  assert.doesNotMatch(filaParado,/muda/);
  assert.doesNotMatch(filaMudo,/parada/);
  assert.match(filaMudo,/class="cli-ctl-act start ciega"/);
  assert.doesNotMatch(filaParado,/ciega/);
  assert.match(source,/\.cli-ctl-state\.parada\{color:var\(--dim\)\}/);
  assert.match(source,/\.cli-ctl-state\.muda\{color:var\(--violet\)\}/);

  // Arrancar a ciegas exige confirmación explícita: nadie enciende dos veces.
  assert.match(functionSource("hsCliOrdena"),/if\(ciego && !confirm\(|if \(ciego && !confirm\(/);
});

test("cada fila ofrece matar lo vivo y arrancar lo que no lo está, con aria-label",()=>{
  const api=cliApi();
  assert.equal(api.estado(VIVO).accion,"stop");
  assert.equal(api.estado(PARADO).accion,"start");
  assert.equal(api.estado(MUDO).accion,"start");

  assert.match(api.fila(VIVO),/data-cli-accion="stop"/);
  assert.match(api.fila(PARADO),/data-cli-accion="start"/);
  assert.match(api.fila(VIVO),/aria-label="Matar Smith · Grok \(OpenCode\) en MacBookAir16plata, que ahora está vivo"/);
  assert.match(api.fila(PARADO),/aria-label="[^"]*que ahora está parado"/);
  assert.match(api.aria(MUDO,api.estado(MUDO)),/no se sabe si ya está corriendo/);

  const orden=functionSource("hsCliOrdena");
  assert.match(orden,/fetch\(YK \+ "\/fleet\/cli", \{/);
  assert.match(orden,/method:"POST"/);
  assert.match(orden,/body:JSON\.stringify\(\{ machine:machine, cli:cli, action:accion \}\)/);
  assert.match(source,/hsCliOrdena\(boton\.getAttribute\("data-cli-machine"\)/);
});

test("la orden se declara encolada y se vigila el censo, sin fingir el cambio",()=>{
  const api=cliApi();
  const espera=api.espera({accion:"start",desde:Date.now()-4000});
  // Compactado (Carlos, 2026-08-08): el raíl es estrecho y este aviso es transitorio.
  assert.match(espera,/Orden de arranque enviada · esperando a la máquina/);
  assert.match(espera,/ciclo de 20 s/);
  assert.match(api.espera({accion:"stop",desde:Date.now()}),/Orden de matar enviada/);

  // Mientras se espera, el botón queda deshabilitado y el aviso visible.
  const esperando=api.fila(VIVO,{"MacBookAir16plata|smith-grok":{accion:"stop",desde:Date.now()}});
  assert.match(esperando,/ disabled/);
  assert.match(esperando,/class="cli-ctl-wait"/);

  const orden=functionSource("hsCliOrdena"),vigila=functionSource("hsCliVigila");
  assert.match(orden,/hsCliMensaje\("Orden enviada, esperando a " \+ machine/);
  assert.match(orden,/Orden encolada \("/);
  assert.match(orden,/hsCliVigila\(clave\)/);
  assert.match(vigila,/setTimeout\(tic, CLI_VIGILA_MS\)/);
  assert.match(vigila,/ahora !== espera\.previo/);
  assert.match(vigila,/sigue encolada tras/);
  assert.match(source,/var CLI_VIGILA_MS = 8000/);
  assert.match(source,/var CLI_VIGILA_MAX_MS = 60000/);
});

test("un 401 dice que hace falta iniciar sesión, y un 403 que el CLI no está en la lista blanca",()=>{
  const orden=functionSource("hsCliOrdena");
  assert.match(orden,/if \(res\.status === 401\) throw new Error\("Necesitas iniciar sesión/);
  assert.match(orden,/if \(res\.status === 403\) throw new Error\("Ese CLI no está en la lista blanca/);
  assert.match(orden,/hsCliMensaje\(normaliza\(e && e\.message\) \|\| "No se pudo enviar la orden", true\)/);
  assert.match(source,/id="cliCtlStatus" role="status" aria-live="polite"/);
  assert.match(source,/\.cli-ctl-status\.error\{color:var\(--warn\)\}/);
});

// FLT-1322 (Carlos, 2026-08-08): el panel se había centrado en OpenCode. Ahora cada
// ordenador ofrece su SESIÓN de terminal y los CLIs que viven dentro, y cada familia
// habla con sus verbos: una sesión se activa y se desactiva, un CLI se arranca y se mata.
const SESION={cli:"terminal",kind:"session",label:"Sesión de terminal",machine:"MacBookAir16plata",
  alive:true,pid:4242,seen_at:1786198000000,state:"vivo"};
const GROK={cli:"grok",kind:"cli",label:"Grok · CLI",machine:"MacBookPro14",
  alive:false,pid:null,seen_at:1786198000000,state:"parado"};

test("una sesión de terminal se activa y se desactiva; un CLI se arranca y se mata",()=>{
  const api=cliApi();
  const viva=api.estado(SESION),inactiva=api.estado({...SESION,alive:false,pid:null,state:"parado"});
  assert.equal(viva.accionEtiqueta,"■ Desactivar");
  assert.equal(viva.etiqueta,"Activa");
  assert.match(viva.titulo,/late y confirma que la sesión está abierta/);
  assert.equal(inactiva.accionEtiqueta,"▶ Activar");
  assert.equal(inactiva.etiqueta,"Inactiva");
  assert.match(inactiva.titulo,/la sesión NO está abierta/);
  assert.equal(api.aria(SESION,viva),"Desactivar Sesión de terminal en MacBookAir16plata, que ahora está activa");

  // La familia CLI conserva los verbos de siempre: cambiarlos rompería el hábito.
  const grok=api.estado(GROK);
  assert.equal(grok.accionEtiqueta,"▶ Arrancar");
  assert.equal(api.aria(GROK,grok),"Arrancar Grok · CLI en MacBookPro14, que ahora está parado");

  // Un item sin `kind` (censo viejo) se lee como CLI, no como sesión.
  assert.equal(api.estado(VIVO).accionEtiqueta,"■ Matar");

  // La acción que viaja al worker es la misma para las dos familias: start/stop.
  assert.equal(viva.accion,"stop");
  assert.equal(inactiva.accion,"start");
});

test("la espera también habla el idioma de cada familia",()=>{
  const api=cliApi(),desde=Date.now();
  assert.match(api.espera({accion:"stop",desde},SESION),/^Orden de desactivar enviada/);
  assert.match(api.espera({accion:"start",desde},SESION),/^Orden de activar enviada/);
  assert.match(api.espera({accion:"stop",desde},GROK),/^Orden de matar enviada/);
  assert.match(api.espera({accion:"start",desde},GROK),/^Orden de arranque enviada/);
});

test("la ayuda del panel nombra la sesión de terminal y los CLIs, no un producto concreto",()=>{
  const ayuda=source.slice(source.indexOf('<p class="cli-ctl-help">'),source.indexOf("</p>",source.indexOf('<p class="cli-ctl-help">')));
  assert.match(ayuda,/sesión/i);
  assert.match(ayuda,/CLIs/);
  assert.ok(ayuda.length<230,"la ayuda va compacta: el raíl no es una columna de texto");
  assert.doesNotMatch(ayuda,/OpenCode/i);
});

// FLT-1330 (Carlos, 2026-08-08): nueve filas abiertas de golpe empujaban el resto
// del raíl fuera de la pantalla. Dos niveles de plegado — la sección y cada
// ordenador — y el recuento visible en los dos, cerrados o abiertos.
test("el panel se pliega en dos niveles y ninguno esconde el recuento",()=>{
  // Nivel 1: la cabecera ES el interruptor y arranca cerrada.
  assert.match(source,/<button class="cli-ctl-head" type="button" id="cliCtlToggle" aria-expanded="false" aria-controls="cliCtlBody">/);
  assert.match(source,/<div class="cli-ctl-body" id="cliCtlBody" hidden>/);
  assert.match(source,/cabecera\.setAttribute\("aria-expanded", String\(abrir\)\)/);
  assert.match(source,/cuerpo\.hidden = !abrir/);
  // El recuento «2/9 vivos» vive DENTRO del botón: se lee con la sección cerrada.
  const cabecera=source.slice(source.indexOf('<button class="cli-ctl-head"'),source.indexOf("</button>",source.indexOf('<button class="cli-ctl-head"')));
  assert.match(cabecera,/id="cliCtlCount"/);

  // Nivel 2: cada ordenador es otro botón, cerrado, con su marcador vivos/total.
  assert.match(source,/<button class="cli-ctl-machine" type="button" data-cli-maquina=/);
  assert.match(source,/aria-expanded="' \+ abierto \+ '"/);
  assert.match(source,/vivosGrupo \+ '\/' \+ grupo\.items\.length/,
    "la barra cerrada ya dice cuántos de los suyos están en marcha");
  assert.match(source,/<div class="cli-ctl-clis" id="' \+ idHijos \+ '"' \+ \(abierto \? '' : ' hidden'\)/);
  assert.match(source,/var CLI_ABIERTOS = new Set\(\)/,"el estado de apertura no se persiste");
  assert.match(source,/CLI_ABIERTOS\.has\(maquina\)\) CLI_ABIERTOS\.delete\(maquina\); else CLI_ABIERTOS\.add\(maquina\)/);
  assert.match(source,/\.cli-ctl-clis\[hidden\]\{display:none\}/);
  assert.match(source,/\.cli-ctl-body\[hidden\]\{display:none\}/);
});
