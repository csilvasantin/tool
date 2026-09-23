// All people, events and conversations in this presentation are synthetic.
export const PROFILES={
 fast:{name:'Rápida',model:'gpt-realtime-2.1-mini',tag:'Consultas sencillas',description:'Confirmar un fallo, recoger disponibilidad y seguir un procedimiento breve.',style:'Preguntas cortas, una decisión por turno.',naturalness:'Objetivo: voz directa y ágil. Pendiente de prueba de escucha.',capacity:'Ruta acotada; deriva las excepciones a coordinación.',rates:{audioIn:10,audioOut:20,textIn:.6,textOut:2.4}},
 balanced:{name:'Equilibrada',model:'gpt-realtime',tag:'Coordinación habitual',description:'Aclarar el problema, negociar una franja y mantener el contexto entre contactos.',style:'Resume lo entendido y pide confirmación antes de avanzar.',naturalness:'Objetivo: conversación fluida y contextual. Pendiente de prueba de escucha.',capacity:'Diagnóstico guiado y coordinación entre comercio y técnico.',rates:{audioIn:32,audioOut:64,textIn:4,textOut:16}},
 premium:{name:'Premium',model:'gpt-realtime-2.1',tag:'Casos con más matices',description:'Gestionar cambios, restricciones de acceso y casos que necesitan más razonamiento.',style:'Explica alternativas y comprueba ambigüedades.',naturalness:'Objetivo: conversación flexible con más matices. Pendiente de prueba de escucha.',capacity:'Más razonamiento para excepciones; siempre respeta las aceptaciones.',rates:{audioIn:32,audioOut:64,textIn:4,textOut:24}}
};
export const SCENARIOS={normal:'Todo va bien',no_answer:'El comercio no contesta',reschedule:'Hay que cambiar la cita',reopen:'La reparación no funciona',handoff:'Pide hablar con una persona'};
export const STAGES=['Detectar','Hablar con el comercio','Coordinar al técnico','Acordar la cita','Intervenir','Confirmar recuperación'];
const speech=(fast,balanced,premium)=>({fast,balanced,premium});
const ai=(texts)=>({who:'Yokup IA',text:texts}),person=(who,text)=>({who,text});
const event=(kind,stage,title,description,dialogue=[],extra={})=>({kind,stage,title,description,dialogue,...extra});
export function buildStory(scenario='normal'){
 if(!SCENARIOS[scenario])scenario='normal';
 const out=[event('detected',0,'La pantalla deja de emitir','La monitorización detecta un fallo y abre una única incidencia. Yokup conserva el equipo, la ubicación y la prioridad.',[],{data:{device:'Pantalla de escaparate · DEMO-042',site:'Comercio de demostración · Barcelona',issue:'Pantalla sin señal',priority:'Alta'},action:'Abrir incidencia y seleccionar contacto autorizado'})];
 if(scenario==='no_answer')out.push(event('no_answer',1,'La primera llamada no obtiene respuesta','La IA no interpreta el silencio como una confirmación. Programa otro intento. El tiempo de espera está comprimido en esta demo.',[],{action:'Reintento previsto en 10 minutos · máximo 3 por ciclo'}));
 out.push(event('contact',1,'Yokup llama al comercio','La IA se identifica, confirma el fallo y recoge la disponibilidad. La persona responde; Yokup registra los datos útiles.',[
 ai(speech('Hola, soy la IA de Yokup. ¿La pantalla sigue sin señal?','Hola, soy el asistente de IA de Yokup. Hemos detectado que la pantalla del escaparate no emite. ¿Sigue así?','Hola, soy el asistente de IA de Yokup. Le llamo por la pantalla del escaparate. Antes de enviar a alguien, quiero confirmar qué ve y evitarle una visita innecesaria. ¿Está encendida pero sin imagen?')),
 person('Laura · comercio','Sí, está encendida pero no muestra imagen. Ya revisamos el cable de alimentación.'),
 ai(speech('¿Cuándo puede recibir al técnico?','Gracias. Dejo anotada esa comprobación. ¿Qué franja le va bien y quién puede abrir al técnico?','Anoto que hay alimentación y que sigue sin imagen. No hace falta manipular el equipo. ¿Qué franja nos propone y hay alguna restricción de acceso?')),
 person('Laura · comercio','Mañana de diez a doce. Yo puedo abrir; el acceso es por la puerta lateral.')
 ],{data:{availability:'Mañana, 10:00–12:00',access:'Laura · puerta lateral'},action:'Guardar contexto y disponibilidad; todavía no confirmar una visita'}));
 if(scenario==='handoff'){
 out.push(event('handoff',1,'La persona recupera el control','La IA detiene la automatización y entrega la conversación, el diagnóstico y la disponibilidad al equipo de coordinación.',[person('Laura · comercio','Prefiero hablar con una persona.'),ai(speech('De acuerdo. Paso el contexto a coordinación.','De acuerdo. Una persona continuará con toda la información que ya me ha dado.','Por supuesto. Dejo el fallo, las comprobaciones y su horario para que coordinación continúe sin hacerle repetir la conversación.'))],{action:'Derivar a coordinación · incidencia abierta'}));return out;
 }
 out.push(event('proposal',2,'Un técnico compatible, cerca','Yokup filtra por especialidad, disponibilidad y distancia. En este ejemplo prepara una propuesta para un técnico a 2,8 km.',[],{version:1,data:{technician:'Alex · técnico de pantallas',distance:'2,8 km',slot:'Mañana, 10:00–11:00',scope:'Diagnóstico y recuperación de señal',price:'65 € · importe ficticio de la demo'},action:'Crear propuesta v1 · ninguna aceptación todavía'}));
 out.push(event('accept_installer',2,'La IA llama al técnico','El técnico acepta expresamente la fecha, el trabajo y el importe de esta versión.',[
 ai(speech('Soy la IA de Yokup. Visita mañana de diez a once, revisar pantalla, sesenta y cinco euros. ¿Acepta?','Hola Alex, soy el asistente de IA de Yokup. Hay una pantalla sin señal a 2,8 kilómetros. Laura puede abrir por la puerta lateral mañana de diez a once. Diagnóstico y recuperación por sesenta y cinco euros. ¿Acepta esta propuesta?','Hola Alex, soy el asistente de IA de Yokup. La pantalla tiene alimentación pero no imagen; el comercio ya revisó el cable. Propongo mañana de diez a once, acceso lateral con Laura, diagnóstico y recuperación de señal por sesenta y cinco euros. ¿Confirma disponibilidad, alcance e importe?')),
 person('Alex · técnico','Sí, acepto esa visita, ese trabajo y los sesenta y cinco euros.')
 ],{version:1,action:'Registrar aceptación del técnico sobre v1 · falta el comercio'}));
 if(scenario==='reschedule'){
 out.push(event('change_request',3,'El comercio propone otra hora','La IA escucha la restricción. Una franja distinta requiere una propuesta nueva y nuevas aceptaciones.',[person('Laura · comercio','A las diez no puedo. ¿Podría ser a las once?'),ai(speech('Revisaré la franja de once a doce. La cita aún no está confirmada.','Lo cambio a once a doce y vuelvo a confirmarlo con el técnico. Hasta tener ambas respuestas, la cita sigue pendiente.','De acuerdo. La aceptación anterior del técnico era para las diez. Prepararé una nueva propuesta de once a doce y comprobaré las dos aceptaciones; así nadie recibe una cita que no ha acordado.'))],{action:'Solicitar nueva versión; no reutilizar el sí anterior'}));
 out.push(event('proposal',3,'Propuesta v2: las aceptaciones vuelven a cero','Yokup conserva v1 en el historial. La nueva fecha no hereda ninguna aceptación.',[],{version:2,data:{slot:'Mañana, 11:00–12:00'},action:'Crear v2 · comercio pendiente · técnico pendiente'}));
 out.push(event('accept_installer',3,'El técnico acepta la nueva franja','La IA vuelve a llamar con la versión corregida.',[ai(speech('Nueva propuesta: mañana de once a doce, mismo trabajo e importe. ¿Acepta?','Alex, Laura necesita cambiar la visita a once a doce. Mantenemos el alcance y los sesenta y cinco euros. ¿Confirma esta nueva propuesta?','Alex, cambia únicamente la franja: mañana de once a doce. La propuesta anterior queda sustituida. Se mantienen acceso, alcance e importe. ¿Acepta expresamente esta versión?')),person('Alex · técnico','Sí, acepto la nueva franja de once a doce con el mismo trabajo e importe.')],{version:2,action:'Registrar aceptación del técnico sobre v2'}));
 }
 const version=scenario==='reschedule'?2:1,slot=version===2?'once a doce':'diez a once';
 out.push(event('accept_retailer',3,'La IA confirma el acuerdo con el comercio','La cita se confirma únicamente cuando comercio y técnico aceptan la misma versión.',[
 ai(speech(`Laura, mañana de ${slot}, diagnóstico y recuperación de señal por sesenta y cinco euros. ¿Acepta?`,`Laura, Alex ha aceptado venir mañana de ${slot}. El trabajo es diagnóstico y recuperación de señal por sesenta y cinco euros. ¿Confirma esta propuesta?`,`Laura, ya tenemos la aceptación de Alex para mañana de ${slot}, con acceso por la puerta lateral. El alcance es diagnóstico y recuperación de señal y el importe es sesenta y cinco euros. ¿Está de acuerdo con la fecha, el trabajo y el precio?`)),
 person('Laura · comercio','Sí, acepto la fecha, el trabajo y los sesenta y cinco euros.')
 ],{version,action:`Dos aceptaciones sobre v${version} → confirmar cita y asignar técnico`}));
 out.push(event('repaired',4,'El técnico registra la intervención','Alex documenta la reparación. Yokup mantiene la incidencia pendiente de confirmación del comercio.',[person('Alex · técnico','He restaurado la conexión del reproductor. La pantalla vuelve a mostrar contenido.')],{action:'Guardar resolución técnica · solicitar validación al comercio'}));
 if(scenario==='reopen'){
 out.push(event('unsatisfied',5,'La comprobación detecta que sigue fallando','La IA no cierra por el informe técnico: el comercio dice que el fallo persiste.',[ai(speech('Soy la IA de Yokup. ¿La pantalla funciona bien ahora?','Laura, soy la IA de Yokup. Alex ha registrado la reparación. ¿Ve ya el contenido correctamente?','Laura, soy el asistente de IA de Yokup. Quiero verificar el resultado de la visita: ¿la imagen permanece estable o ha vuelto a fallar?')),person('Laura · comercio','Volvió a quedarse en negro a los cinco minutos.')],{action:'Registrar valoración negativa y reabrir seguimiento'}));
 out.push(event('review',4,'La IA vuelve a coordinar la revisión','El técnico recibe el contexto de la primera reparación y el síntoma que persiste.',[ai(speech('Alex, la pantalla ha vuelto a fallar. Necesitamos una revisión.','Alex, la imagen volvió a negro a los cinco minutos. Dejo la incidencia reabierta para coordinar la revisión con Laura.','Alex, la primera recuperación no se ha mantenido: Laura informa de pantalla negra tras cinco minutos. Conservo la intervención anterior y abro una revisión; habrá que acordar cualquier nueva visita antes de confirmarla.')),person('Alex · técnico','Reviso la conexión durante la intervención y documento la corrección definitiva.')],{action:'Revisión de prueba · cualquier nueva cita exige su propia doble aceptación'}));
 out.push(event('repaired',4,'Segunda reparación documentada','El técnico registra la corrección y se solicita una nueva validación.',[],{action:'Volver a llamar al comercio; todavía no cerrar'}));
 }
 out.push(event('satisfied',5,'La última llamada comprueba el resultado','La IA recoge la confirmación del comercio. El expediente queda cerrado con el historial completo.',[
 ai(speech('Soy la IA de Yokup. ¿La pantalla funciona y está satisfecho con la solución?','Laura, soy la IA de Yokup. ¿La pantalla mantiene el contenido correctamente? ¿Podemos dar la incidencia por resuelta?','Laura, soy el asistente de IA de Yokup. Para cerrar el seguimiento, quiero confirmar que la imagen se mantiene estable y que la solución le resulta satisfactoria. ¿Está todo correcto?')),
 person('Laura · comercio','Sí, lleva funcionando correctamente y estoy satisfecha. Podéis cerrar la incidencia.'),
 ai(speech('Gracias. Incidencia cerrada.','Gracias, Laura. Registro su confirmación y cierro la incidencia con todo el historial.','Gracias por confirmarlo. Dejo registrado el resultado y su satisfacción. La incidencia queda cerrada; si el síntoma reaparece, tendremos el contexto para continuar.'))
 ],{action:'Registrar satisfacción y cerrar la incidencia'}));return out;
}
export function initialState(){return {stage:0,status:'open',version:0,acceptances:{retailer:false,installer:false},data:{},calls:0,retries:0,closed:false,history:[]};}
export function applyEvent(previous,e){
 if(previous.closed)throw Error('La incidencia ya está cerrada');
 const s={...previous,stage:e.stage,data:{...previous.data,...e.data},acceptances:{...previous.acceptances},history:[...previous.history,e]};
 if(e.kind==='proposal'){if(e.version<=s.version)throw Error('Versión no vigente');s.version=e.version;s.acceptances={retailer:false,installer:false};s.status='proposed';}
 if(e.kind.startsWith('accept_')){if(e.version!==s.version||s.status!=='proposed')throw Error('La aceptación debe ser de la propuesta vigente');s.acceptances[e.kind==='accept_retailer'?'retailer':'installer']=true;if(s.acceptances.retailer&&s.acceptances.installer)s.status='scheduled';}
 if(e.kind==='no_answer'){s.retries++;s.calls++;}
 if(['contact','accept_installer','accept_retailer','change_request','unsatisfied','review','satisfied'].includes(e.kind))s.calls++;
 if(e.kind==='repaired'){if(!['scheduled','reopened'].includes(s.status))throw Error('Falta una intervención acordada');s.status='awaiting_rating';}
 if(e.kind==='unsatisfied'){if(s.status!=='awaiting_rating')throw Error('Falta la reparación');s.status='reopened';}
 if(e.kind==='satisfied'){if(s.status!=='awaiting_rating')throw Error('Falta validar la reparación');s.closed=true;s.status='closed';}
 if(e.kind==='handoff')s.status='human_handoff';return s;
}
export function stateAt(story,index){return story.slice(0,index+1).reduce(applyEvent,initialState());}
export function dialogueText(item,profile){return typeof item.text==='string'?item.text:item.text[profile]||item.text.balanced;}
export function estimateCost(profile,usage){
 const rates=PROFILES[profile]?.rates;if(!rates)throw Error('Perfil no válido');
 let total=0;for(const key of Object.keys(rates)){const n=Number(usage[key]??0);if(!Number.isFinite(n)||n<0||n>1e9)throw Error('Volumen no válido');total+=n*rates[key]/1e6;}return total;
}
