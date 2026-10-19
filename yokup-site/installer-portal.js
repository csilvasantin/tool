/* Real data only. No demo incidents, synthetic counters or successful optimistic writes. */
(() => {
const API='https://data.yokup.com/api/installer';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const es={}, en={hvac:'Air conditioning',portal:'INSTALLER NETWORK',signin:'Sign in',logout:'Sign out',eyebrow:'LOCAL PEOPLE. CONNECTED DEVICES.',headline:'Your skills.<br>Your area.<br><em>All connected.</em>',intro:'When an Admira device needs help, you can be the solution. Receive jobs in your specialty less than 40 km away.',radius:'Proximity radius',global:'Global',where:'Work from your city',equipment:'Screens and much more',coverage:'YOUR WORKING AREA',mapPlaceholder:'Set your location to see your working area.',mapHint:'Your location helps us find nearby jobs.',start:'FROM YOUR PROFILE TO YOUR FIRST JOB',ready:'Connect with<br>what you do best.',step1:'Put yourself on the map',step1body:'Choose your working base and the equipment you specialise in.',step2:'Receive nearby incidents',step2body:'Alerts arrive in your inbox based on distance and availability.',step3:'Accept, repair and report',step3body:'See the address after accepting and record how you fixed the issue.',notificationsNote:'Alerts are saved in your portal. You can enable browser notifications while you keep it open.',register:'Create account',yourProfile:'Your installer profile',profileHint:'Your location and skills determine which jobs you receive.',name:'Name or company',email:'Email address',password:'Password · at least 12 characters',country:'Country',city:'City',workbase:'Your working base',locate:'Use my location ↗',locationHint:'Click the map or enter the coordinates of your working base.',latitude:'Latitude',longitude:'Longitude',skills:'Your specialties',screen:'Screens',network:'Networks',sensor:'IoT sensors',kiosk:'Kiosks',available:'Available to receive jobs',dataNote:'Your email and location are not public. Your location is used to calculate distance to devices.',join:'Create my account →',workspace:'YOUR WORKSPACE',edit:'Edit profile',enableAlerts:'Enable alerts',newAlerts:'New alerts',myJobs:'My open jobs',finished:'Resolved jobs',inbox:'Your incident inbox',refresh:'Refresh ↻',inboxHint:'Only you can see your inbox. Incidents refresh every 30 seconds while you are here.',footer:'The people behind connected devices.',about:'About Yokup ↗',resolveTitle:'Close intervention',resolutionLabel:'Describe the issue, the repair and how you tested it.',cancel:'Cancel',resolve:'Save and close',evidenceLabel:'Evidence: https URL of a photo of the working device or of the fixed website.'};
Object.assign(en,{"eyebrow": "YOUR SKILLS BELONG HERE.", "headline": "Your trade. Your area.<br><em>Your next connection.</em>", "intro": "A profile connecting your skills with shops in your area. Start with what you do best.", "start": "YOUR PROFILE, STEP BY STEP", "ready": "What you do best.<br>Where you want to do it.", "signin": "Sign in", "accountStep": "Your account", "accountDetail": "Google or email. Your choice.", "zoneStep": "Your area", "zoneDetail": "Choose your base and how far you travel.", "skillsStep": "Your skills", "skillsDetail": "Tell us how you can help.", "privacyNote": "Your email and location are not public. You can change your profile and availability whenever you like.", "backHome": "← Back to the network", "accountTitle": "Let’s start with you.", "accountIntro": "Create your access. Next, choose your area and specialties.", "continueGoogle": "Continue with Google", "orEmail": "or continue with your email", "name": "Your name or your business name", "showPassword": "Show", "passwordHint": "A memorable phrase works too. Use at least 12 characters.", "rememberMe": "Remember my username for a week", "zoneTitle": "Where do you want to work?", "zoneIntro": "Search for your city or use your location. You can adjust your base on the map.", "city": "City or town", "searchCity": "Search", "or": "or", "locate": "Use my current location ↗", "locationHint": "Choose a city from the results to set your area.", "mapPlaceholder": "Search for your city to see your area.", "mapHint": "Your work base", "radiusLabel": "How far would you like to travel?", "radiusHint": "Distance around your base. You can change it later.", "skillsTitle": "What do you specialise in?", "skillsIntro": "Choose one or more specialties. You can change them whenever you like.", "screenHint": "Installation and maintenance", "playerHint": "Media players and signal", "networkHint": "Connectivity and cabling", "audioHint": "Sound and speakers", "hvacHint": "Comfort and temperature", "sensorHint": "Sensors and devices", "kioskHint": "Interactive terminals", "changeZone": "Change area", "availableHint": "You can pause your availability at any time.", "alertsPending": "Registration is open. Automatic job alerts are not active yet.", "previous": "← Back", "continue": "Continue →", "forgotPassword": "Forgot your password?", "saveNote": "Your account is created when you finish the last step."});
$$('[data-i18n]').forEach(el=>es[el.dataset.i18n]=el.innerHTML);
let lang=localStorage.getItem('yokup.installer.language')||'es', user=null, mode='register', map, marker, mapReady=false, polling=false, seen=new Set(), initialInbox=true, activeIncident=null, latestInbox=[], latestStats={unread:0,assigned:0,resolved:0};
const t=(a,b)=>lang==='en'?b:a;
let signupStep=0,locationSequence=0,locationController=null,saving=false,coordinateSource='';
const coordinatesReady=()=>['latitude','longitude'].every((n,i)=>{const raw=$(`[name=${n}]`).value;return raw!==''&&Number.isFinite(Number(raw))&&Math.abs(Number(raw))<=(i?180:90);});
function refreshWizard(){
 const login=mode==='login';
 $$('[data-signup-step]').forEach((p,i)=>{p.hidden=login?i!==0:i!==signupStep;p.inert=saving;});
 $('#account-form').setAttribute('aria-busy',String(saving));
 for(const el of [$('#register-tab'),$('#login-tab'),$('#login-top'),...$$('[data-go-step]')])el.disabled=saving;
 $('#signup-progress').hidden=login;
 $$('.steps-panel [data-go-step]').forEach((b,i)=>{b.classList.toggle('is-active',i===signupStep);b.classList.toggle('is-done',i<signupStep);if(i===signupStep)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');b.querySelector('.step-circle').textContent=i<signupStep?'✓':String(i+1);});
 $$('.panel-counter').forEach((p,i)=>{p.hidden=login;p.textContent=t('PASO ','STEP ')+(i+1)+t(' DE 3',' OF 3');});
 $('#account-title').textContent=login?t('Qué bien verte de nuevo.','Good to see you again.'):mode==='edit'?t('Tu perfil, a tu manera.','Your profile, your way.'):t('Empecemos por ti.','Let’s start with you.');
 $('.signup-panel .panel-intro').hidden=login||mode==='edit';
 $('#previous-step').hidden=login||signupStep===0;
 $('#submit-account').textContent=saving?t('Guardando…','Saving…'):login?t('Entrar →','Sign in →'):signupStep<2?t('Continuar →','Continue →'):mode==='edit'?t('Guardar perfil →','Save profile →'):t('Crear mi cuenta →','Create my account →');
 $('#submit-account').disabled=saving;$('#previous-step').disabled=saving;
 $('#show-password').textContent=$('[name=password]').type==='text'?t('Ocultar','Hide'):t('Mostrar','Show');
 $$('.access-links').forEach(el=>el.hidden=!login);$('.form-footnote').hidden=login||mode==='edit';
 $('.email-divider').hidden=mode==='edit';
 updateProfileSummary();
}
function setStep(step,focus=true){
 signupStep=Math.max(0,Math.min(2,step));refreshWizard();
 if(signupStep===1)requestAnimationFrame(()=>{map?.resize();if(coordinatesReady())drawZone(Number($('[name=latitude]').value),Number($('[name=longitude]').value),true);});
 if(focus){$('.form-card').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$(`[data-signup-step="${signupStep}"] h2`).focus({preventScroll:true});}
}
function validateStep(step){
 const panel=$(`[data-signup-step="${step}"]`);
 for(const input of panel.querySelectorAll('input,select')){
  if(input.disabled||input.type==='hidden'||input.type==='checkbox')continue;
  if(!input.checkValidity()||(input.minLength>0&&input.value.length<input.minLength)){
   $('#form-status').textContent=t('Revisa este campo para continuar.','Check this field to continue.');input.focus();input.reportValidity();return false;
  }
 }
 if(step===1&&!coordinatesReady()){$('#form-status').textContent=t('Selecciona una ciudad de los resultados, usa tu ubicación o marca tu base en el mapa.','Select a city from the results, use your location or pick your base on the map.');$('[name=city]').focus();return false;}
 if(step===2&&!$$('[name=skill]:checked').length){$('#form-status').textContent=t('Elige al menos una especialidad para crear tu perfil.','Choose at least one specialty to create your profile.');$('[name=skill]').focus();return false;}
 return true;
}
function goStep(target){
 if(saving)return;
 $('#form-status').textContent='';
 if(target>signupStep){for(let i=signupStep;i<target;i++){setStep(i,false);if(!validateStep(i))return;}}
 setStep(target);
}
function updateProfileSummary(){
 const radius=Number($('#work-radius').value)||40;
 $('#radius-value').textContent=radius+' km';$('#map-radius').textContent=radius+' km';$('#work-radius').setAttribute('aria-valuetext',radius+' km');
 const count=$$('[name=skill]:checked').length;
 $('#skills-count').textContent=count?count+t(count===1?' especialidad seleccionada':' especialidades seleccionadas',count===1?' specialty selected':' specialties selected'):t('Selecciona todas las que domines.','Choose all the skills you specialise in.');
 $('#zone-summary').textContent=coordinatesReady()?($('[name=city]').value||t('Tu base','Your base'))+' · '+radius+t(' km alrededor de tu base',' km around your base'):t('Aún no has elegido tu zona.','You haven’t chosen your area yet.');
}
function cancelLocation(){locationSequence++;locationController?.abort();$('#search-city').disabled=false;$('#locate').disabled=false;}
function clearLocation(){
 cancelLocation();coordinateSource='';$('[name=latitude]').value='';$('[name=longitude]').value='';$('#location-results').hidden=true;$('#location-results').replaceChildren();
 marker?.remove();marker=null;
 if(mapReady&&map.getSource('zone'))map.getSource('zone').setData({type:'FeatureCollection',features:[]});
 $('#map-city').textContent=t('Tu base de trabajo','Your work base');$('#location-status').textContent=t('Busca y selecciona tu ciudad para situar tu zona.','Search and select your city to set your area.');updateProfileSummary();
}
async function findLocation(params,reverse=false){
 cancelLocation();const sequence=locationSequence,controller=locationController=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),10000);
 $('#search-city').disabled=true;$('#locate').disabled=true;
 $('#location-status').textContent=t('Buscando tu zona…','Finding your area…');
 try{
  const r=await fetch('/api/installer-location?'+new URLSearchParams({...params,lang}),{signal:controller.signal});if(!r.ok)throw Error('location unavailable');const data=await r.json();
  if(sequence!==locationSequence)return;
  const results=$('#location-results');results.replaceChildren();results.hidden=true;
  if(reverse){const place=data.places?.[0];if(place){$('[name=city]').value=place.city;$('[name=country]').value=place.country;$('#map-city').textContent=place.city;}$('#location-status').textContent=place?t('Base seleccionada. Puedes ajustar el punto en el mapa.','Base selected. You can adjust the point on the map.'):t('Punto seleccionado. Confirma tu ciudad y país.','Point selected. Confirm your city and country.');updateProfileSummary();return;}
  if(!data.places?.length){$('#location-status').textContent=t('No encontramos esa ciudad. Prueba una localidad cercana o usa tu ubicación.','We couldn’t find that city. Try a nearby town or use your location.');return;}
  for(const place of data.places){const button=document.createElement('button');button.type='button';button.textContent=place.label;button.onclick=()=>{cancelLocation();$('[name=city]').value=place.city;$('[name=country]').value=place.country;coordinateSource='search';setLocation(place.latitude,place.longitude);results.hidden=true;results.replaceChildren();$('#location-status').textContent=t('Zona elegida. Ajusta el punto o la distancia si lo necesitas.','Area selected. Adjust the point or distance if needed.');updateProfileSummary();};results.append(button);}
  results.hidden=false;$('#location-status').textContent=t('Elige tu ciudad en los resultados.','Choose your city from the results.');
 }catch(e){if(sequence===locationSequence)$('#location-status').textContent=reverse?t('Punto seleccionado. Escribe tu ciudad y revisa el país para continuar.','Point selected. Enter your city and check the country to continue.'):t('No pudimos buscar la ciudad. Vuelve a intentarlo o usa tu ubicación y el mapa.','City search is unavailable. Try again or use your location and the map.');}
 finally{clearTimeout(timeout);if(sequence===locationSequence){$('#search-city').disabled=false;$('#locate').disabled=false;}}
}
function searchCity(){const city=$('[name=city]');if(city.value.trim().length<2){$('#location-status').textContent=t('Escribe al menos dos letras de tu ciudad.','Enter at least two letters of your city.');city.focus();return;}return findLocation({q:city.value.trim(),country:$('[name=country]').value});}
function choosePoint(lat,lon){coordinateSource='point';setLocation(lat,lon);updateProfileSummary();$('#location-results').hidden=true;return findLocation({lat:lat.toFixed(6),lon:lon.toFixed(6)},true);}

function countries(selected='ES') {
 const list='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
 const names=new Intl.DisplayNames([lang],{type:'region'}), select=$('[name=country]');select.replaceChildren();
 list.map(code=>({code,name:names.of(code)})).sort((a,b)=>a.name.localeCompare(b.name,lang)).forEach(({code,name})=>{const option=document.createElement('option');option.value=code;option.textContent=name;select.append(option);});select.value=selected;
}
function language(value){lang=value==='en'?'en':'es';localStorage.setItem('yokup.installer.language',lang);document.documentElement.lang=lang;$('#language').value=lang;
 $$('[data-i18n]').forEach(el=>el.innerHTML=(lang==='en'?en:es)[el.dataset.i18n]||es[el.dataset.i18n]);countries($('[name=country]').value||'ES');$('#signup-progress').setAttribute('aria-label',t('Progreso del registro','Registration progress'));$('#location-results').setAttribute('aria-label',t('Resultados de ciudades','City results'));$('#map').setAttribute('aria-label',t('Mapa de tu zona de trabajo','Map of your work area'));$('.tabs').setAttribute('aria-label',t('Acceso','Account access'));setMode(mode);if(user){showUser();render(latestInbox);}health();}
async function api(path,body,method){
 const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
 try{const response=await fetch(API+path,{method:method||(body?'POST':'GET'),credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||t('No se pudo completar la operación.','The operation could not be completed.')),{status:response.status});return result;}
 catch(e){if(e.name==='AbortError')throw new Error(t('La conexión ha tardado demasiado. Comprueba el resultado antes de repetir.','The connection timed out. Check the result before retrying.'));throw e;}finally{clearTimeout(timeout);}
}
async function health(){try{const state=await api('/health');$('#integration').hidden=state.admira_configured;if(!state.admira_configured)$('#integration').textContent=t('Registro abierto. Los avisos automáticos aún no están activos. Puedes crear tu perfil y dejar preparada tu zona de trabajo.','Registration is open. Automatic job alerts are not active yet. You can create your profile and set up your working area.');}catch{$('#integration').hidden=false;$('#integration').textContent=t('No hemos podido conectar con el servicio. Tu perfil no se guardará hasta recuperar la conexión.','We could not reach the service. Your profile cannot be saved until it reconnects.');}}
let googleAuth;
const REMEMBER_KEY='yk_remember_installer',WEEK=7*86400000;
function rememberedUser(){try{const r=JSON.parse(localStorage.getItem(REMEMBER_KEY)||'null');if(r&&r.exp>Date.now())return r.user;localStorage.removeItem(REMEMBER_KEY);}catch{}return '';}
function rememberUser(user,on){try{on?localStorage.setItem(REMEMBER_KEY,JSON.stringify({user,exp:Date.now()+WEEK})):localStorage.removeItem(REMEMBER_KEY);}catch{}}
function setMode(next){if(saving)return;const changed=next!==mode;mode=next;const login=mode==='login',edit=mode==='edit';
 if(changed){signupStep=0;googleAuth?.reset();}
 $$('.register-only').forEach(el=>{el.hidden=login;el.querySelectorAll('input,select').forEach(input=>input.disabled=login);});
 $('#account-form [name=email]').closest('label').hidden=edit;$('#account-form [name=password]').closest('label').hidden=edit;
 $('[name=email]').disabled=edit;
 if(!googleAuth?.isSignup())$('[name=password]').disabled=edit;
 if(googleAuth?.isSignup())$('[name=password]').closest('label').hidden=true;
 $('#portal-google').hidden=edit;
 $('[name=password]').autocomplete=login?'current-password':'new-password';$('[name=email]').type=login?'text':'email';$('[name=password]').minLength=login?1:12;
 $('#account-form .remember-line').hidden=!login;
 $('[data-i18n=password]').textContent=login?t('Contraseña','Password'):t('Contraseña · mínimo 12 caracteres','Password · at least 12 characters');
 if(login){const u=rememberedUser();if(u){$('[name=email]').value=u;$('[name=remember]').checked=true;}}
 $('#register-tab').classList.toggle('active',!login);$('#login-tab').classList.toggle('active',login);$('#register-tab').setAttribute('aria-selected',String(!login));$('#login-tab').setAttribute('aria-selected',String(login));$('.tabs').hidden=edit;
 $('#form-status').textContent='';refreshWizard();
}
function profileForm(){const fd=new FormData($('#account-form'));return {name:fd.get('name'),email:fd.get('email'),password:fd.get('password'),country:fd.get('country'),city:fd.get('city'),latitude:Number(fd.get('latitude')),longitude:Number(fd.get('longitude')),skills:fd.getAll('skill'),available:fd.get('available')==='on',radius_km:Number(fd.get('radius_km')),notify_zone:user?.notify_zone??true,demo:user?.demo??false,language:lang};}
function setLocation(latitude,longitude,move=true){$('#form-status').textContent='';$('[name=latitude]').value=Number(latitude).toFixed(6);$('[name=longitude]').value=Number(longitude).toFixed(6);drawZone(latitude,longitude,move);$('#map-city').textContent=$('[name=city]').value||t('Tu base seleccionada','Your selected base');updateProfileSummary();}
function drawZone(latitude,longitude,move){
 if(!mapReady)return;const coords=[],lat=latitude*Math.PI/180,lon=longitude*Math.PI/180,delta=(Number($('#work-radius').value)||40)/6371.0088;
 for(let i=0;i<=100;i++){const bearing=i/100*2*Math.PI,phi=Math.asin(Math.sin(lat)*Math.cos(delta)+Math.cos(lat)*Math.sin(delta)*Math.cos(bearing));const lambda=lon+Math.atan2(Math.sin(bearing)*Math.sin(delta)*Math.cos(lat),Math.cos(delta)-Math.sin(lat)*Math.sin(phi));coords.push([lambda*180/Math.PI,phi*180/Math.PI]);}
 const data={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[coords]}};
 if(map.getSource('zone'))map.getSource('zone').setData(data);else{map.addSource('zone',{type:'geojson',data});map.addLayer({id:'zone-fill',type:'fill',source:'zone',paint:{'fill-color':'#96b94c','fill-opacity':.18}});map.addLayer({id:'zone-line',type:'line',source:'zone',paint:{'line-color':'#668d39','line-width':2,'line-dasharray':[3,3]}});}
 if(marker)marker.remove();marker=new maplibregl.Marker({color:'#173d32'}).setLngLat([longitude,latitude]).addTo(map);
 if(move){const bounds=coords.reduce((b,c)=>b.extend(c),new maplibregl.LngLatBounds());map.fitBounds(bounds,{padding:{top:35,bottom:55,left:25,right:25},maxZoom:12,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:400});}$('#map-city').textContent=$('[name=city]').value||`${Number(latitude).toFixed(3)}, ${Number(longitude).toFixed(3)}`;
}
function initMap(){if(!window.maplibregl)return;try{map=new maplibregl.Map({container:'map',style:'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',center:[10,24],zoom:1.2,attributionControl:true});map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');map.on('load',()=>{mapReady=true;const fallback=$('.map-fallback');if(fallback)fallback.remove();if(coordinatesReady())drawZone(Number($('[name=latitude]').value),Number($('[name=longitude]').value),true);});map.on('click',e=>{if(mode!=='login'&&!$('#onboarding').hidden)choosePoint(e.lngLat.lat,e.lngLat.wrap().lng);});}catch{}}
function fillProfile(){for(const key of ['name','email','country','city','latitude','longitude'])$(`[name=${key}]`).value=user[key];$$('[name=skill]').forEach(el=>el.checked=user.skills.includes(el.value));$('#work-radius').value=user.radius_km||40;updateProfileSummary();$('[name=available]').checked=user.available;drawZone(user.latitude,user.longitude,true);}
function showUser(){document.dispatchEvent(new CustomEvent('portal-auth',{detail:{kind:'installer',authenticated:true}}));
 $('#onboarding').hidden=true;$('#dashboard').hidden=false;$('#logout').hidden=false;$('#login-top').hidden=true;
 $('#welcome').textContent=t('Hola, ','Hello, ')+user.name;$('#profile-summary').textContent=`${user.city} · ${new Intl.DisplayNames([lang],{type:'region'}).of(user.country)} · ${user.available?t('Disponible','Available'):t('No disponible','Unavailable')}`;
 fillProfile();refresh();
}
function signedOut(){document.dispatchEvent(new CustomEvent('portal-auth',{detail:{kind:'installer',authenticated:false}}));user=null;latestInbox=[];if(marker){marker.remove();marker=null;}if(mapReady){for(const layer of ['zone-line','zone-fill'])if(map.getLayer(layer))map.removeLayer(layer);if(map.getSource('zone'))map.removeSource('zone');map.flyTo({center:[10,24],zoom:1.2});}$('#map-city').textContent=t('Tu ubicación se usa para encontrar trabajos cercanos.','Your location helps us find nearby jobs.');$('#onboarding').hidden=false;$('#dashboard').hidden=true;$('#logout').hidden=true;$('#login-top').hidden=false;$('#account-form').reset();$('#profile-saved').hidden=true;clearLocation();signupStep=0;seen.clear();initialInbox=true;setMode('login');}
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function render(list){
 $('#unread-count').textContent=latestStats.unread;$('#assigned-count').textContent=latestStats.assigned;$('#resolved-count').textContent=latestStats.resolved;
 const host=$('#incidents');host.replaceChildren();
 if(!list.length){const box=node('div',undefined,'empty');box.append(node('h3',t('Tu próxima intervención empieza aquí.','Your next job starts here.')),node('p',user.available?t('Aquí verás las incidencias que encajen con tu zona y especialidades cuando se activen los avisos.','When alerts go live, you will see incidents matching your area and specialties here.'):t('Tu disponibilidad está desactivada. Actívala en tu perfil para recibir avisos.','Your availability is off. Enable it in your profile to receive alerts.')));host.append(box);}
 for(const incident of list){
  const card=node('article',undefined,'incident'+(!incident.read_at?' unread':'')),main=node('div'),actions=node('div',undefined,'incident-actions');
  const label=incident.status==='resolved'?t('Resuelta','Resolved'):incident.mine?t('Asignada a ti','Assigned to you'):incident.status==='open'?t('Disponible','Available'):t('Ya asignada','Already assigned');
  main.append(node('span',label,'pill'),node('small',new Date(incident.notified_at).toLocaleString(lang)),node('h3',incident.title),node('p',incident.device_name+' · '+(incident.reason==='offline'?t('Sin latido','No heartbeat'):incident.reason==='retailer'?t('Incidencia del comercio','Retailer incident'):t('Fallo reportado','Reported fault'))));
  if(incident.appointment_start)main.append(node('p',t('Cita confirmada: ','Confirmed appointment: ')+new Date(incident.appointment_start).toLocaleString(lang,{timeZone:incident.appointment_timezone})+' — '+new Date(incident.appointment_end).toLocaleTimeString(lang,{timeZone:incident.appointment_timezone})+' · '+incident.appointment_timezone+' · '+(incident.appointment_cost_cents/100).toFixed(2)+' EUR'),node('p',incident.appointment_scope));
  if(incident.description)main.append(node('p',incident.description));
  if(incident.rating_stars)main.append(node('p',`${incident.rating_stars}/5 ★ · ${incident.rating_comment||t('Valoración del comercio','Retailer review')} · ${incident.satisfied?t('Equipo funcionando','Device working'):t('El comercio solicita revisión','Retailer requests follow-up')}`));
  if(incident.mine&&incident.address){main.append(node('p',incident.address));const link=node('a',t('Abrir indicaciones ↗','Open directions ↗'));link.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(incident.latitude+','+incident.longitude);link.target='_blank';link.rel='noopener noreferrer';main.append(link);}
  if(incident.resolution)main.append(node('pre',incident.resolution));
  actions.append(node('strong',Number(incident.distance_km).toLocaleString(lang,{maximumFractionDigits:1})+' km'));
  if(incident.status==='open'){const accept=node('button',t('Aceptar intervención →','Accept job →'),'primary');accept.disabled=!user.available;accept.onclick=async()=>{accept.disabled=true;try{await api('/incidents/'+encodeURIComponent(incident.id)+'/accept',{});await refresh();}catch(e){$('#dashboard-status').textContent=e.message;accept.disabled=false;}};actions.append(accept);}
  if(incident.mine&&incident.status==='assigned'){const step=node('button',t('Dar avance','Post update'),'secondary');step.onclick=async()=>{const note=prompt(t('¿Cómo va? (se lo cuenta al comercio y reinicia el reloj de escalado)','How is it going? (shared with the retailer; resets the escalation clock)'));if(!note)return;try{await api('/incidents/'+encodeURIComponent(incident.id)+'/progress',{note});$('#dashboard-status').textContent=t('Avance registrado.','Update saved.');}catch(e){$('#dashboard-status').textContent=e.message;}};actions.append(step);const resolve=node('button',t('Registrar solución','Record solution'),'primary');resolve.onclick=()=>{activeIncident=incident.id;$('#resolution-form').reset();$('#resolution-status').textContent='';$('#resolution-dialog').showModal();};actions.append(resolve);}
  if(!incident.read_at){const read=node('button',t('Marcar leído','Mark as read'),'text-button');read.onclick=async()=>{try{await api('/notifications/'+incident.notification_id+'/read',{});await refresh();}catch(e){$('#dashboard-status').textContent=e.message;}};actions.append(read);}
  card.append(main,actions);host.append(card);
 }
}
async function refresh(){if(!user||polling)return;polling=true;try{const {notifications,stats,reputation}=await api('/inbox');latestStats=stats;$('#reputation').textContent=reputation?.count?`${Number(reputation.average).toFixed(1)} / 5 ★ · ${reputation.count} ${t('valoraciones de comercios','retailer reviews')}`:t('Todavía sin valoraciones de comercios.','No retailer reviews yet.');$('#dashboard-status').textContent='';latestInbox=notifications;render(notifications);for(const n of notifications){if(!initialInbox&&!seen.has(n.notification_id)&&!n.read_at&&n.status==='open'&&'Notification'in window&&Notification.permission==='granted')new Notification('Yokup · '+t('Incidencia cercana','Nearby incident'),{body:n.title+' · '+n.distance_km.toFixed(1)+' km',tag:n.notification_id});seen.add(n.notification_id);}initialInbox=false;}catch(e){if(e.status===401)signedOut();else $('#dashboard-status').textContent=e.message;}finally{polling=false;}}
$('#language').onchange=e=>language(e.target.value);$('#register-tab').onclick=()=>setMode('register');$('#login-tab').onclick=()=>setMode('login');$('#login-top').onclick=()=>{setMode('login');$('#account-form').scrollIntoView({behavior:'smooth'});};
$('#account-form').addEventListener('input',()=>{$('#form-status').textContent='';});
$('#search-city').onclick=searchCity;
$('[name=city]').addEventListener('input',()=>{if(coordinateSource==='point'){cancelLocation();$('#location-results').hidden=true;$('#map-city').textContent=$('[name=city]').value||t('Tu base seleccionada','Your selected base');updateProfileSummary();}else clearLocation();});
$('[name=country]').addEventListener('change',()=>{$('[name=city]').value='';clearLocation();});
$('[name=city]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchCity();}});
$('#locate').onclick=()=>{
 if(!navigator.geolocation){$('#location-status').textContent=t('Tu navegador no ofrece ubicación. Busca tu ciudad o elígela en el mapa.','Your browser does not offer location. Search for your city or choose it on the map.');return;}
 cancelLocation();const sequence=locationSequence;$('#locate').disabled=true;$('#location-status').textContent=t('Esperando permiso de ubicación…','Waiting for location permission…');
 navigator.geolocation.getCurrentPosition(p=>{if(sequence!==locationSequence)return;$('#locate').disabled=false;choosePoint(p.coords.latitude,p.coords.longitude);},()=>{if(sequence!==locationSequence)return;$('#locate').disabled=false;$('#location-status').textContent=t('No hemos podido usar tu ubicación. Puedes buscar tu ciudad sin dar permiso.','We could not use your location. You can search for your city without granting permission.');},{timeout:10000,maximumAge:60000});
};
$('#work-radius').oninput=()=>{updateProfileSummary();if(coordinatesReady())drawZone(Number($('[name=latitude]').value),Number($('[name=longitude]').value),true);};
$$('[name=skill]').forEach(el=>el.onchange=()=>{$('#form-status').textContent='';updateProfileSummary();});
$('#previous-step').onclick=()=>goStep(signupStep-1);
$$('[data-go-step]').forEach(el=>el.onclick=()=>goStep(Number(el.dataset.goStep)));
$('#show-password').onclick=()=>{const input=$('[name=password]'),show=input.type==='password';input.type=show?'text':'password';$('#show-password').textContent=show?t('Ocultar','Hide'):t('Mostrar','Show');$('#show-password').setAttribute('aria-pressed',String(show));};
googleAuth=window.YokupGoogle.mount({kind:'installer',form:$('#account-form'),getMode:()=>mode,setMode,onLogin:profile=>{user=profile;showUser();$('#dashboard').scrollIntoView({behavior:'smooth'});}});
$('#account-form').onsubmit=async e=>{
 e.preventDefault();if(saving)return;
 if(mode!=='login'&&signupStep<2){goStep(signupStep+1);return;}
 const steps=mode==='login'?[0]:[0,1,2];for(const step of steps){setStep(step,false);if(!validateStep(step))return;}
 saving=true;refreshWizard();$('#form-status').textContent=t('Guardando…','Saving…');
 try{
  const body=profileForm();
  const result=googleAuth.isSignup()?await googleAuth.complete(body):mode==='edit'?await api('/me',body,'PATCH'):await api(mode==='login'?'/login':'/register',body);
  if(mode==='login')rememberUser(body.email,$('[name=remember]').checked);
  user=result.profile;showUser();
  if(mode!=='login'){$('#profile-saved').textContent=t('✓ Tu perfil está guardado. Tu zona y tus especialidades ya están preparadas.','✓ Your profile is saved. Your area and specialties are ready.');$('#profile-saved').hidden=false;}
  $('[name=password]').value='';$('#dashboard').scrollIntoView({behavior:'smooth'});
 }catch(error){if(error.status===409&&mode==='register'){setStep(0);$('#form-status').textContent=t('Este correo ya tiene una cuenta. Puedes entrar o usar otro correo.','This email already has an account. Sign in or use another email.');}else $('#form-status').textContent=error.message;}
 finally{saving=false;refreshWizard();}
};
$('#edit-profile').onclick=()=>{$('#onboarding').hidden=false;signupStep=0;setMode('edit');fillProfile();$('#account-form').scrollIntoView({behavior:'smooth'});};
$('#logout').onclick=async()=>{try{await api('/logout',{});signedOut();}catch(e){$('#dashboard-status').textContent=e.message;}};$('#refresh').onclick=refresh;
// Avisos push REALES (Yokup Desk · FLT-100938): llegan con el portal cerrado. Si el navegador no admite push
// o el servidor aún no tiene claves VAPID, se cae a los avisos con la pestaña abierta de siempre.
const b64ToBytes=v=>{const s=(v+'='.repeat((4-v.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0));};
$('#browser-alerts').onclick=async()=>{if(!('Notification'in window)){$('#dashboard-status').textContent=t('Este navegador no admite avisos. Tu bandeja seguirá guardándolos.','This browser does not support notifications. Your inbox will still save them.');return;}const permission=await Notification.requestPermission();if(permission!=='granted'){$('#dashboard-status').textContent=t('Avisos no activados. Puedes consultar tu bandeja en cualquier momento.','Notifications not enabled. You can check your inbox at any time.');return;}
 try{const key=await api('/push/key');if(!key.enabled||!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('sin push');const reg=await navigator.serviceWorker.register('/instalador-sw.js',{scope:'/instalador'});await navigator.serviceWorker.ready;const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(key.public_key)});await api('/push/subscribe',{subscription:sub.toJSON()});$('#dashboard-status').textContent=t('Avisos activados: te llegarán aunque cierres el portal.','Notifications enabled: they will reach you even with the portal closed.');}
 catch{$('#dashboard-status').textContent=t('Avisos activados mientras mantengas este portal abierto.','Notifications enabled while this portal stays open.');}};
$('#cancel-resolution').onclick=()=>$('#resolution-dialog').close();$('#resolution-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('.primary');button.disabled=true;try{const form=new FormData(e.target);await api('/incidents/'+encodeURIComponent(activeIncident)+'/resolve',{resolution:form.get('resolution'),evidence_url:form.get('evidence_url')});$('#resolution-dialog').close();await refresh();}catch(e){$('#resolution-status').textContent=e.message;}finally{button.disabled=false;}};
language(lang);initMap();api('/me').then(result=>{user=result.profile;showUser();}).catch(e=>{if(e.status!==401)$('#form-status').textContent=e.message;});
setInterval(()=>{if(!document.hidden)refresh();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
// An explicit sign-up link takes priority over a remembered login.
if(new URLSearchParams(location.search).get('alta')==='1')setMode('register');
else if(rememberedUser())setMode('login');
})();
