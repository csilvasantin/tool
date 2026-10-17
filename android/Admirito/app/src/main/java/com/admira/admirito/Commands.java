package com.admira.admirito;
import java.text.Normalizer;
import java.util.*;
final class Commands {
 static String normalize(String text){return Normalizer.normalize(text.toLowerCase(Locale.ROOT),Normalizer.Form.NFD).replaceAll("\\p{M}","").replaceAll("[^a-z0-9 ]"," ").trim().replaceAll(" +"," ");}
 static String strip(String text){String s=normalize(text);return s.startsWith("admirito ")?s.substring(9):s;}
 static String invocation(String text){String s=strip(text).replaceFirst("^invoca (?:al agente |al consejero |a )?","");return strip(text).startsWith("invoca ")&&Arrays.asList("admirito","bugito","supervisor","oraculo","jobs","wozniak","disney","lucas","musk").contains(s)?s:null;}
 static String tour(String text){String s=strip(text).replaceFirst("^(?:lanza|inicia|abre) (?:el )?","");if(!s.startsWith("tour "))return null;String t=s.substring(5);return Arrays.asList("alsea mexico","starbucks mexico","altadis","altadis espana","dooh total").contains(t)?"/tour "+t:null;}
 static String control(String text){String s=strip(text);switch(s){case "siguiente":case "anterior":case "para la demo":case "continua la demo":return s;default:return null;}}
 static String controlInstruction(String control){return "CONTROL DE PRESENTACIÓN solicitado por Carlos desde Admirito Android: "+control+". Actúa solo sobre la presentación ya abierta en Firefox del MacMini. Verifica URL y estado antes y después. siguiente/anterior: exactamente una lámina; para la demo: detener reproducción, ensayo y voz conservando pestaña y lámina; continúa la demo: reanudar desde la lámina actual. No alternes a ciegas ni reinicies, no abras pestañas ni muevas ventanas. Confirma solo lo comprobado. Si no puedes comprobarlo, dilo sin repetir la acción.";}
}
