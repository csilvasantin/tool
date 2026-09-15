export const SCRIPT=[
 {key:'problem',say:'Hola, soy el asistente de prueba de Yokup. Estamos validando una incidencia de pantalla. ¿Sigue sin funcionar?'},
 {key:'availability',say:'¿Qué día y en qué horario podría recibir al técnico? Indique también quién le abrirá.'},
 {key:'next',say:'Gracias. Hemos recogido su disponibilidad. La visita seguirá pendiente hasta que el comercio y el técnico acepten la misma propuesta.'}
];
export function pilotReply(index,reply){
 const value=String(reply||'').trim();if(value.length<2)return {index,error:'Escribe o dicta una respuesta.'};
 if(/\b(humano|persona|operador)\b/i.test(value))return {index,done:true,outcome:'human_handoff',say:'Dejamos el contexto para que continúe una persona.'};
 return {index:Math.min(index+1,SCRIPT.length-1),done:index>=1,outcome:index>=1?'availability':null,say:SCRIPT[Math.min(index+1,SCRIPT.length-1)].say};
}
export function speak(text,lang='es-ES'){
 if(!('speechSynthesis' in window))return false;
 window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=.95;window.speechSynthesis.speak(u);return true;
}
