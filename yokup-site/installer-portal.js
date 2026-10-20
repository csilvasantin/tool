/* Real data only. No demo incidents, synthetic counters or successful optimistic writes. */
(() => {
const API='https://data.'+(/(?:^|\.)(admira\.(?:app|biz))$/.exec(location.hostname)?.[1]||'yokup.com')+'/api/installer';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const es={}, en={hvac:'Air conditioning',portal:'INSTALLER NETWORK',signin:'Sign in',logout:'Sign out',eyebrow:'LOCAL PEOPLE. CONNECTED DEVICES.',headline:'Your skills.<br>Your area.<br><em>All connected.</em>',intro:'When an Admira device needs help, you can be the solution. Receive jobs in your specialty less than 40 km away.',radius:'Proximity radius',global:'Global',where:'Work from your city',equipment:'Screens and much more',coverage:'YOUR WORKING AREA',mapPlaceholder:'Set your location to see your working area.',mapHint:'Your location helps us find nearby jobs.',start:'FROM YOUR PROFILE TO YOUR FIRST JOB',ready:'Connect with<br>what you do best.',step1:'Put yourself on the map',step1body:'Choose your working base and the equipment you specialise in.',step2:'Receive nearby incidents',step2body:'Alerts arrive in your inbox based on distance and availability.',step3:'Accept, repair and report',step3body:'See the address after accepting and record how you fixed the issue.',notificationsNote:'Alerts are saved in your portal. You can enable browser notifications while you keep it open.',register:'Create account',yourProfile:'Your installer profile',profileHint:'Your location and skills determine which jobs you receive.',name:'Name or company',email:'Email address',password:'Password · at least 12 characters',country:'Country',city:'City',workbase:'Your working base',locate:'Use my location ↗',locationHint:'Click the map or enter the coordinates of your working base.',latitude:'Latitude',longitude:'Longitude',skills:'Your specialties',screen:'Screens',network:'Networks',sensor:'IoT sensors',kiosk:'Kiosks',available:'Available to receive jobs',dataNote:'Your email and location are not public. Your location is used to calculate distance to devices.',join:'Create my account →',workspace:'YOUR WORKSPACE',edit:'Edit profile',enableAlerts:'Enable alerts',newAlerts:'New alerts',myJobs:'My open jobs',finished:'Resolved jobs',inbox:'Your incident inbox',refresh:'Refresh ↻',inboxHint:'Only you can see your inbox. Incidents refresh every 30 seconds while you are here.',footer:'The people behind connected devices.',about:'About Yokup ↗',resolveTitle:'Close intervention',resolutionLabel:'Describe the issue, the repair and how you tested it.',cancel:'Cancel',resolve:'Save and close',evidenceLabel:'Evidence: https URL of a photo of the working device or of the fixed website.'};
Object.assign(en,{"eyebrow": "YOUR SKILLS BELONG HERE.", "headline": "Your trade. Your area.<br><em>Your next connection.</em>", "intro": "A profile connecting your skills with shops in your area. Start with what you do best.", "start": "YOUR PROFILE, STEP BY STEP", "ready": "What you do best.<br>Where you want to do it.", "signin": "Sign in", "accountStep": "Your account", "accountDetail": "Google or email. Your choice.", "zoneStep": "Your area", "zoneDetail": "Choose your base and how far you travel.", "skillsStep": "Your skills", "skillsDetail": "Tell us how you can help.", "privacyNote": "Your email and location are not public. You can change your profile and availability whenever you like.", "backHome": "← Back to the network", "accountTitle": "Let’s start with you.", "accountIntro": "Create your access. Next, choose your area and specialties.", "continueGoogle": "Continue with Google", "orEmail": "or continue with your email", "name": "Your name or your business name", "showPassword": "Show", "passwordHint": "A memorable phrase works too. Use at least 12 characters.", "rememberMe": "Remember my username for a week", "zoneTitle": "Where do you want to work?", "zoneIntro": "Search for your city or use your location. You can adjust your base on the map.", "city": "City or town", "searchCity": "Search", "or": "or", "locate": "Use my current location ↗", "locationHint": "Choose a city from the results to set your area.", "mapPlaceholder": "Search for your city to see your area.", "mapHint": "Your work base", "radiusLabel": "How far would you like to travel?", "radiusHint": "Distance around your base. You can change it later.", "skillsTitle": "What do you specialise in?", "skillsIntro": "Choose one or more specialties. You can change them whenever you like.", "screenHint": "Installation and maintenance", "playerHint": "Media players and signal", "networkHint": "Connectivity and cabling", "audioHint": "Sound and speakers", "hvacHint": "Comfort and temperature", "sensorHint": "Sensors and devices", "kioskHint": "Interactive terminals", "changeZone": "Change area", "availableHint": "You can pause your availability at any time.", "alertsPending": "Registration is open. Automatic job alerts are not active yet.", "previous": "← Back", "continue": "Continue →", "forgotPassword": "Forgot your password?", "saveNote": "Your account is created when you finish the last step."});
Object.assign(en,{"advancedTools":"Integrations and advanced tools","edit": "Edit my profile ↗", "enableAlerts": "Enable browser alerts ↗", "yourZone": "YOUR AREA", "yourSkills": "YOUR SKILLS", "yourAvailability": "YOUR AVAILABILITY", "adjustZone": "Adjust my area ↗", "adjustSkills": "Edit specialties ↗", "newAlerts": "Unread alerts", "myJobs": "In progress", "finished": "Resolved", "inbox": "Your jobs", "filterAvailable": "Available", "filterAssigned": "In progress", "filterResolved": "Resolved", "filterAll": "All", "inboxHint": "Your inbox is private. It refreshes every 30 seconds while you are here.", "inboxLimit": "The 100 most recent alerts are shown.", "backToPanel": "← Back to my dashboard", "updateEyebrow": "KEEP THE RETAILER UP TO DATE", "progressTitle": "Post a progress update", "progressLabel": "How is the job going?", "progressHint": "Your update is shared with the retailer.", "sendProgress": "Save update"});
Object.assign(en,{retrySession:'Check again',jobEyebrow:'YOUR JOB',backToJobs:'Back',jobEvidence:'DOCUMENT YOUR WORK',photosLabel:'Photos of the completed work',photosHint:'Up to 6 photos. Saved privately with this job. JPEG, PNG or WebP; up to 8 MB per uploaded photo.',takePhoto:'Take photo',choosePhotos:'Choose from gallery',useEvidenceLink:'Or use an HTTPS evidence link',closureHint:'The job closes only after the server confirms the solution and saved photos. If it fails, keep this screen and retry.',resolveWithPhotos:'Save photos and close'});
$$('[data-i18n]').forEach(el=>es[el.dataset.i18n]=el.innerHTML);
let lang=localStorage.getItem('yokup.installer.language')||'es', user=null, mode='register', map, marker, mapReady=false, polling=false, seen=new Set(), initialInbox=true, activeIncident=null, latestInbox=[], latestStats={unread:0,assigned:0,resolved:0};
const t=(a,b)=>lang==='en'?b:a;
let signupStep=0,locationSequence=0,locationController=null,saving=false,coordinateSource='';
const coordinatesReady=()=>['latitude','longitude'].every((n,i)=>{const raw=$(`[name=${n}]`).value;return raw!==''&&Number.isFinite(Number(raw))&&Math.abs(Number(raw))<=(i?180:90);});
function refreshWizard(){
 const login=mode==='login';
 $$('[data-signup-step]').forEach((p,i)=>{p.hidden=login?i!==0:i!==signupStep;p.inert=saving;});
 $('#account-form').setAttribute('aria-busy',String(saving));
 for(const el of [$('#register-tab'),$('#login-tab'),$('#login-top'),$('#cancel-profile-edit'),...$$('[data-go-step]')])el.disabled=saving;
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
  const length=['name','city','password'].includes(input.name)?input.value.trim().length:input.value.length;
  if(!input.checkValidity()||(input.minLength>0&&length<input.minLength)){
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
 setStep(target);wizardNavigation();
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
 $$('[data-i18n]').forEach(el=>el.innerHTML=(lang==='en'?en:es)[el.dataset.i18n]||es[el.dataset.i18n]);countries($('[name=country]').value||'ES');$('#signup-progress').setAttribute('aria-label',t('Progreso del registro','Registration progress'));$('#location-results').setAttribute('aria-label',t('Resultados de ciudades','City results'));$('#map').setAttribute('aria-label',t('Mapa de tu zona de trabajo','Map of your work area'));$('.tabs').setAttribute('aria-label',t('Acceso','Account access'));$('.profile-overview').setAttribute('aria-label',t('Tu perfil de trabajo','Your work profile'));$('.metrics').setAttribute('aria-label',t('Resumen de intervenciones','Job summary'));$('.work-filters').setAttribute('aria-label',t('Estado de las intervenciones','Job status'));setMode(mode);if(user){renderProfile();render(latestInbox);}health();}
async function api(path,body,method){
 const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
 try{const response=await fetch(API+path,{method:method||(body?'POST':'GET'),credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||t('No se pudo completar la operación.','The operation could not be completed.')),{status:response.status});return result;}
 catch(e){if(e.name==='AbortError')throw new Error(t('La conexión ha tardado demasiado. Comprueba el resultado antes de repetir.','The connection timed out. Check the result before retrying.'));throw e;}finally{clearTimeout(timeout);}
}
async function health(){try{const state=await api('/health');serviceState=state.admira_configured?'active':'pending';}catch{serviceState='offline';}renderServiceState();if(user&&inboxLoaded)render(latestInbox);}
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
 $('#register-tab').classList.toggle('active',!login);$('#login-tab').classList.toggle('active',login);$('#register-tab').setAttribute('aria-selected',String(!login));$('#login-tab').setAttribute('aria-selected',String(login));$('.tabs').hidden=edit;$('.edit-navigation').hidden=!edit;
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
const {filterIncidents,filterCounts,profilePatch}=window.InstallerDashboardModel;
let inboxLoaded=false,inboxError='',lastSyncAt=null,activeFilter='available',filterChosen=false,serviceState='loading',availabilityBusy=false,profileOwner=null;
let inboxRefreshPromise=null;
const pendingActions=new Set();
function skillLabel(value){const labels={screen:t('Pantallas','Screens'),player:'Players',network:t('Redes','Networks'),audio:'Audio',hvac:t('Climatización','Air conditioning'),sensor:t('Sensores IoT','IoT sensors'),kiosk:t('Kioscos','Kiosks')};return labels[value]||value;}
function renderProfile(){
 if(!user)return;
 $('#welcome').textContent=t('Hola, ','Hello, ')+user.name+'.';
 $('#welcome-message').textContent=t('Este es tu punto de partida. Tu perfil, tu zona y tus intervenciones, en un mismo lugar.','Your starting point. Your profile, your area and your jobs, all in one place.');
 $('#profile-city').textContent=user.city;
 let country=user.country;try{country=new Intl.DisplayNames([lang],{type:'region'}).of(user.country);}catch{}
 $('#profile-summary').textContent=country+' · '+Number(user.radius_km||40).toLocaleString(lang)+t(' km alrededor de tu base',' km around your base');
 const skills=$('#profile-skills');skills.replaceChildren();for(const skill of user.skills)skills.append(node('span',skillLabel(skill),'skill-chip'));
 $('#availability-label').textContent=user.available?t('Disponible','Available'):t('En pausa','Paused');
 $('#availability-dot').classList.toggle('paused',!user.available);
 $('#availability-hint').textContent=user.demo?t('Este perfil de prueba no recibe trabajos reales.','This test profile does not receive real jobs.'):user.available?t('Puedes aceptar las intervenciones que encajen contigo.','You can accept the jobs that suit you.'):t('No recibirás nuevos avisos. Tus trabajos en curso siguen aquí.','You will not receive new alerts. Your current jobs stay here.');
 const button=$('#toggle-availability');button.textContent=availabilityBusy?t('Guardando…','Saving…'):user.available?t('Pausar disponibilidad','Pause availability'):t('Activar disponibilidad','Enable availability');button.disabled=availabilityBusy||user.demo===true;button.setAttribute('aria-pressed',String(user.available));
 renderServiceState();
}
function renderServiceState(){
 $('#integration').hidden=!!user||serviceState==='active';
 if(serviceState==='pending')$('#integration').textContent=t('Registro abierto. Los avisos automáticos aún no están activos. Puedes crear tu perfil y dejar preparada tu zona de trabajo.','Registration is open. Automatic job alerts are not active yet. You can create your profile and set up your working area.');
 else if(serviceState==='offline')$('#integration').textContent=t('No hemos podido conectar con el servicio. Tu perfil no se guardará hasta recuperar la conexión.','We could not reach the service. Your profile cannot be saved until it reconnects.');
 const messages={loading:t('Comprobando el estado de la red…','Checking network status…'),active:t('Tu perfil está preparado. Consulta aquí tus avisos e intervenciones.','Your profile is ready. Find your alerts and jobs here.'),pending:t('Tu perfil está listo. Los avisos automáticos aún no están activos; tus intervenciones registradas siguen disponibles aquí.','Your profile is ready. Automatic job alerts are not active yet; your recorded jobs remain available here.'),offline:t('No podemos comprobar la conexión de la red. No damos por activados los avisos automáticos.','We cannot check the network connection. Automatic alert availability is unconfirmed.')};
 $('#dispatch-state').textContent=messages[serviceState];$('.network-status').classList.toggle('network-offline',serviceState==='offline');
}
function openProfileEditor(step=0){if(saving||availabilityBusy)return;$('#dashboard').hidden=true;$('#advanced-integrations').hidden=true;$('#onboarding').hidden=false;signupStep=step;setMode('edit');fillProfile();setStep(step);wizardNavigation();}
function selectWorkFilter(filter,focus=false){activeFilter=filter;filterChosen=true;render(latestInbox);if(focus)$('#filter-'+filter).focus();}
function formatDate(value,zone){const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';try{return d.toLocaleString(lang,zone?{timeZone:zone}:undefined);}catch{return d.toLocaleString(lang);}}
function render(list){
 if(!user)return;
 renderIntervention();
 for(const [id,key] of [['unread-count','unread'],['assigned-count','assigned'],['resolved-count','resolved']])$('#'+id).textContent=inboxLoaded&&latestStats[key]!=null&&Number.isFinite(Number(latestStats[key]))?Number(latestStats[key]).toLocaleString(lang):'—';
 const counts=filterCounts(list);
 $$('[data-filter]').forEach(b=>{const selected=b.dataset.filter===activeFilter;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
 $$('[data-filter-count]').forEach(n=>n.textContent=inboxLoaded?String(counts[n.dataset.filterCount]):'—');
 $('#incidents').setAttribute('aria-labelledby','filter-'+activeFilter);$('#incidents').setAttribute('aria-busy',String(polling));
 $('#refresh').disabled=polling;$('#refresh').textContent=polling?t('Actualizando…','Updating…'):t('Actualizar ↻','Refresh ↻');
 $('#last-sync').textContent=lastSyncAt?t('Actualizado a las ','Updated at ')+new Date(lastSyncAt).toLocaleTimeString(lang,{hour:'2-digit',minute:'2-digit'}):t('Esperando la primera actualización','Waiting for the first update');
 $('#inbox-state').textContent=inboxError?(inboxLoaded?t('No se ha podido actualizar. Se muestran los últimos datos recibidos; actualiza antes de realizar cambios.','Could not refresh. The last received data is shown; refresh before making changes.'):t('No hemos podido cargar tus intervenciones. Pulsa Actualizar para volver a intentarlo.','We could not load your jobs. Select Refresh to try again.')):'';
 $('#inbox-limit').hidden=list.length<100;
 const host=$('#incidents');host.replaceChildren();
 if(!inboxLoaded){const state=node('div',undefined,'work-empty');state.append(node('span',inboxError?'↻':'◎','empty-symbol'),node('h3',inboxError?t('No podemos mostrar la bandeja todavía.','Your inbox is not available yet.'):t('Cargando tus intervenciones…','Loading your jobs…')),node('p',inboxError?t('Tu perfil sigue guardado. Puedes volver a intentarlo sin registrarte otra vez.','Your profile is still saved. Try again without registering again.'):t('Estamos consultando los datos de tu portal.','We are fetching your portal data.')));host.append(state);return;}
 const filtered=filterIncidents(list,activeFilter);
 if(!filtered.length){
  const headings={available:t('Todo preparado para tu próxima intervención.','Ready for your next job.'),assigned:t('No tienes intervenciones en curso.','You have no jobs in progress.'),resolved:t('Aquí quedará tu trabajo terminado.','Your completed work will appear here.'),all:t('Tu bandeja empieza aquí.','Your inbox starts here.')};
  const messages={available:!user.available?t('Tu disponibilidad está en pausa. Actívala cuando quieras recibir nuevos avisos.','Your availability is paused. Enable it when you want to receive new alerts.'):serviceState==='pending'?t('Tu zona y tus especialidades están guardadas. Los avisos automáticos aún no están activos.','Your area and specialties are saved. Automatic job alerts are not active yet.'):t('No hay intervenciones disponibles en los avisos recibidos. Puedes actualizar la bandeja cuando quieras.','There are no available jobs in your received alerts. You can refresh the inbox whenever you like.'),assigned:t('Cuando aceptes una intervención, podrás seguirla y comunicar avances desde aquí.','When you accept a job, you can track it and share progress here.'),resolved:t('Las intervenciones que cierres con su solución y evidencia aparecerán en este historial.','Jobs you close with a solution and evidence will appear in this history.'),all:t('Aquí verás los avisos recibidos y sus cambios de estado.','Your received alerts and their status changes will appear here.')};
  const box=node('div',undefined,'work-empty');box.append(node('span','◎','empty-symbol'),node('h3',headings[activeFilter]),node('p',messages[activeFilter]));
  if(activeFilter==='available'){const edit=node('button',t('Revisar mi zona y especialidades ↗','Review my area and skills ↗'),'secondary');edit.type='button';edit.onclick=()=>openProfileEditor(1);box.append(edit);}host.append(box);
 }
 for(const incident of filtered){
  const card=node('article',undefined,'incident'+(!incident.read_at?' unread':''));card.dataset.incidentId=incident.id;
  const main=node('div',undefined,'incident-main'),actions=node('div',undefined,'incident-actions'),meta=node('div',undefined,'incident-meta');
  const label=incident.status==='resolved'?t('Resuelta','Resolved'):incident.mine&&incident.status==='assigned'?t('En curso · asignada a ti','In progress · assigned to you'):incident.status==='open'?t('Disponible','Available'):t('Asignada a otro profesional','Assigned to another professional');
  meta.append(node('span',label,'pill state-'+incident.status));if(!incident.read_at)meta.append(node('span',t('Sin leer','Unread'),'unread-label'));
  const date=formatDate(incident.notified_at);if(date)meta.append(node('small',date));main.append(meta,node('h3',incident.title),node('p',incident.device_name+' · '+(incident.reason==='offline'?t('Equipo sin conexión','Device offline'):incident.reason==='retailer'?t('Aviso del comercio','Retailer report'):t('Fallo reportado','Reported fault')),'incident-device'));
  if(incident.description)main.append(node('p',incident.description,'incident-description'));
  if(incident.appointment_start){const appointment=node('div',undefined,'appointment-summary');appointment.append(node('strong',t('Cita confirmada','Confirmed appointment')),node('p',formatDate(incident.appointment_start,incident.appointment_timezone)+' — '+formatDate(incident.appointment_end,incident.appointment_timezone)));if(incident.appointment_cost_cents!=null&&Number.isFinite(Number(incident.appointment_cost_cents)))appointment.append(node('p',(Number(incident.appointment_cost_cents)/100).toLocaleString(lang,{style:'currency',currency:'EUR'})));if(incident.appointment_scope)appointment.append(node('p',incident.appointment_scope));main.append(appointment);}
  if(incident.mine&&incident.address){main.append(node('p',incident.address,'incident-address'));if(Number.isFinite(incident.latitude)&&Number.isFinite(incident.longitude)){const link=node('a',t('Cómo llegar ↗','Get directions ↗'),'directions-link');link.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(incident.latitude+','+incident.longitude);link.target='_blank';link.rel='noopener noreferrer';main.append(link);}}
  if(incident.resolution){const details=node('details',undefined,'resolution-details');details.append(node('summary',t('Ver solución registrada','View recorded solution')),node('p',incident.resolution));main.append(details);}
  if(incident.rating_stars)main.append(node('p',`${incident.rating_stars}/5 ★ · ${incident.rating_comment||t('Valoración del comercio','Retailer review')} · ${incident.satisfied?t('Equipo funcionando','Device working'):t('El comercio solicita revisión','Retailer requests follow-up')}`,'incident-review'));
  if(incident.distance_km!=null&&Number.isFinite(Number(incident.distance_km)))actions.append(node('strong',Number(incident.distance_km).toLocaleString(lang,{maximumFractionDigits:1})+' km','incident-distance'));
  const open=node('button',t('Ver intervención →','View job →'),'secondary');open.type='button';open.onclick=()=>openIntervention(incident.id);actions.append(open);
  if(incident.status==='open'&&!incident.mine){const accept=node('button',t('Aceptar intervención →','Accept job →'),'primary');accept.type='button';accept.disabled=!user.available;accept.onclick=()=>mutateIncident(incident.id,()=>api('/incidents/'+encodeURIComponent(incident.id)+'/accept',{}),t('Intervención aceptada. La encontrarás en En curso.','Job accepted. You can find it under In progress.'),'assigned');actions.append(accept);if(!user.available)actions.append(node('p',t('Activa tu disponibilidad para aceptar.','Enable your availability to accept.'),'action-hint'));}
  if(incident.mine&&incident.status==='assigned'){const progress=node('button',t('Comunicar avance','Post progress'),'secondary');progress.type='button';progress.onclick=()=>openProgress(incident);const resolve=node('button',t('Registrar solución','Record solution'),'primary');resolve.type='button';resolve.onclick=()=>openResolution(incident);actions.append(progress,resolve);}
  if(!incident.read_at){const read=node('button',t('Marcar como leído','Mark as read'),'text-button');read.type='button';read.onclick=()=>mutateIncident(incident.id,()=>api('/notifications/'+encodeURIComponent(incident.notification_id)+'/read',{}),t('Aviso marcado como leído.','Alert marked as read.'));actions.append(read);}
  if(pendingActions.has(incident.id)||uploadingPhotos.has(incident.id)||inboxError)actions.querySelectorAll('button').forEach(b=>{if(b!==open)b.disabled=true;});
  card.append(main,actions);host.append(card);
 }
}
function refresh(){if(!user)return Promise.resolve(false);if(inboxRefreshPromise)return inboxRefreshPromise;inboxRefreshPromise=loadInbox().finally(()=>{inboxRefreshPromise=null;});return inboxRefreshPromise;}
async function loadInbox(){
 if(!user||polling)return false;const owner=user.id;polling=true;if(!inboxLoaded)render(latestInbox);else{$('#refresh').disabled=true;$('#refresh').textContent=t('Actualizando…','Updating…');}
 try{
  const {notifications,stats,reputation}=await api('/inbox');if(!user||user.id!==owner)return false;
  if(!Array.isArray(notifications)||!stats)throw Error('Invalid inbox');
  latestStats=stats;latestInbox=notifications;inboxLoaded=true;inboxError='';lastSyncAt=Date.now();
  if(!filterChosen&&initialInbox)activeFilter=filterCounts(notifications).assigned?'assigned':'available';
  $('#reputation').textContent=reputation?.count?`${Number(reputation.average).toFixed(1)} / 5 ★ · ${reputation.count} ${t('valoraciones de comercios','retailer reviews')}`:t('Todavía sin valoraciones de comercios.','No retailer reviews yet.');
  for(const n of notifications){if(!initialInbox&&!seen.has(n.notification_id)&&!n.read_at&&n.status==='open'&&'Notification'in window&&Notification.permission==='granted')new Notification(t('Intervención cercana','Nearby job'),{body:n.title+' · '+Number(n.distance_km).toFixed(1)+' km',tag:n.notification_id});seen.add(n.notification_id);}initialInbox=false;resumeClosureAfterLogin();return true;
 }catch(e){if(user?.id!==owner)return false;if(e.status===401)signedOut(t('Tu sesión ha caducado. Vuelve a entrar para continuar.','Your session has expired. Sign in to continue.'));else inboxError=e.message;return false;}
 finally{polling=false;if(user&&user.id===owner)render(latestInbox);}
}
async function mutateIncident(id,request,success,filterAfter){
 if(pendingActions.has(id)||inboxError||!user)return {ok:false,error:t('Actualiza la bandeja antes de continuar.','Refresh the inbox before continuing.')};
 pendingActions.add(id);$('#dashboard-status').classList.remove('status-error');$('#dashboard-status').textContent='';render(latestInbox);
 try{await request();if(inboxRefreshPromise)await inboxRefreshPromise;const fresh=await refresh();if(!user)return {ok:true};if(fresh&&filterAfter){activeFilter=filterAfter;filterChosen=true;}$('#dashboard-status').textContent=fresh?success:t('La acción se ha guardado. No podemos actualizar la lista; pulsa Actualizar antes de repetirla.','The action was saved. We cannot refresh the list; select Refresh before repeating it.');return {ok:true};}
 catch(e){if(e.status===401)signedOut(t('Tu sesión ha caducado. Vuelve a entrar para continuar.','Your session has expired. Sign in to continue.'));else if(e.status===409)await refresh();const error=e.message;if(user){$('#dashboard-status').textContent=error;$('#dashboard-status').classList.add('status-error');}return {ok:false,error};}
 finally{pendingActions.delete(id);if(user)render(latestInbox);}
}
function dialogBusy(dialog,busy){dialog.setAttribute('aria-busy',String(busy));dialog.querySelectorAll('button').forEach(b=>b.disabled=busy);dialog.querySelectorAll('input,textarea').forEach(el=>{if(el.type==='file')el.disabled=busy;else el.readOnly=busy;});}

function showUser(){
 document.dispatchEvent(new CustomEvent('portal-auth',{detail:{kind:'installer',authenticated:true}}));
 if(profileOwner!==user.id){profileOwner=user.id;latestInbox=[];latestStats={unread:null,assigned:null,resolved:null};inboxLoaded=false;inboxError='';lastSyncAt=null;activeFilter='available';filterChosen=false;seen.clear();initialInbox=true;}
 document.body.classList.add('installer-signed-in');$('#onboarding').hidden=true;$('#dashboard').hidden=false;$('#advanced-integrations').hidden=false;$('#logout').hidden=false;$('#login-top').hidden=true;$('.edit-navigation').hidden=true;
 fillProfile();renderProfile();render(latestInbox);refresh();navigation({view:'dashboard'},true);resumeClosureAfterLogin();
}
function signedOut(message=''){
 if(!message)forgetClosureReturn();
 document.dispatchEvent(new CustomEvent('portal-auth',{detail:{kind:'installer',authenticated:false}}));user=null;profileOwner=null;latestInbox=[];inboxLoaded=false;inboxError='';lastSyncAt=null;pendingActions.clear();
 clearJobDrafts();$('#intervention-dialog').close();document.body.classList.remove('installer-signed-in');$('#progress-dialog').close();$('#resolution-dialog').close();
 if(marker){marker.remove();marker=null;}if(mapReady){for(const layer of ['zone-line','zone-fill'])if(map.getLayer(layer))map.removeLayer(layer);if(map.getSource('zone'))map.removeSource('zone');map.jumpTo({center:[10,24],zoom:1.2});}
 $('#onboarding').hidden=false;$('#dashboard').hidden=true;$('#advanced-integrations').hidden=true;$('#advanced-integrations').open=false;$('#logout').hidden=true;$('#login-top').hidden=false;$('#account-form').reset();$('#profile-saved').hidden=true;$('#availability-status').textContent='';clearLocation();signupStep=0;seen.clear();initialInbox=true;setMode('login');$('#form-status').textContent=message;wizardNavigation(true);renderServiceState();
}
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
$('#language').onchange=e=>language(e.target.value);$('#register-tab').onclick=()=>{setMode('register');wizardNavigation();};$('#login-tab').onclick=()=>{setMode('login');wizardNavigation();};$('#login-top').onclick=()=>{setMode('login');wizardNavigation();$('#account-form').scrollIntoView({behavior:'smooth'});};
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
googleAuth=window.YokupGoogle.mount({kind:'installer',form:$('#account-form'),getMode:()=>mode,setMode:next=>{setMode(next);wizardNavigation(true);},onLogin:profile=>{user=profile;showUser();$('#dashboard').scrollIntoView({behavior:'smooth'});}});
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
$('#edit-profile').onclick=()=>openProfileEditor();
$$('[data-edit-section]').forEach(b=>b.onclick=()=>openProfileEditor(Number(b.dataset.editSection)));
$('#cancel-profile-edit').onclick=()=>{if(!saving)showUser();};
$('#logout').onclick=async()=>{try{await api('/logout',{});signedOut();}catch(e){$('#dashboard-status').textContent=e.message;}};$('#refresh').onclick=refresh;
// Avisos push REALES (Yokup Desk · FLT-100938): llegan con el portal cerrado. Si el navegador no admite push
// o el servidor aún no tiene claves VAPID, se cae a los avisos con la pestaña abierta de siempre.
const b64ToBytes=v=>{const s=(v+'='.repeat((4-v.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0));};
$('#browser-alerts').onclick=async()=>{$('#dashboard-status').classList.remove('status-error');if(!('Notification'in window)){$('#dashboard-status').textContent=t('Este navegador no admite avisos. Tu bandeja seguirá guardándolos.','This browser does not support notifications. Your inbox will still save them.');return;}const permission=await Notification.requestPermission();if(permission!=='granted'){$('#dashboard-status').textContent=t('Avisos no activados. Puedes consultar tu bandeja en cualquier momento.','Notifications not enabled. You can check your inbox at any time.');return;}
 try{const key=await api('/push/key');if(!key.enabled||!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('sin push');const reg=await navigator.serviceWorker.register('/instalador-sw.js',{scope:'/instalador'});await navigator.serviceWorker.ready;const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(key.public_key)});await api('/push/subscribe',{subscription:sub.toJSON()});$('#dashboard-status').textContent=t('Avisos activados: te llegarán aunque cierres el portal.','Notifications enabled: they will reach you even with the portal closed.');}
 catch{$('#dashboard-status').textContent=t('Avisos activados mientras mantengas este portal abierto.','Notifications enabled while this portal stays open.');}};
const jobDrafts=new Map(),uploadingPhotos=new Set(),photoCache=new Map();
let detailId=null,detailData=null,detailError='',detailLoading=false,detailSequence=0;
function jobDraft(id){if(!jobDrafts.has(id))jobDrafts.set(id,{note:'',resolution:'',evidence_url:'',local:[],stored:[]});return jobDrafts.get(id);}
function clearJobDrafts(){uncertainClosures.clear();clearTimeout(closureRecoveryTimer);for(const value of photoCache.values())if(value.url)URL.revokeObjectURL(value.url);photoCache.clear();for(const d of jobDrafts.values())for(const p of [...d.local,...d.stored])if(p.preview)URL.revokeObjectURL(p.preview);jobDrafts.clear();detailSequence++;detailId=null;detailData=null;}
function jobStatus(i){return i.status==='resolved'?t('Resuelta','Resolved'):i.mine&&i.status==='assigned'?t('En curso · asignada a ti','In progress · assigned to you'):i.status==='open'?t('Disponible','Available'):t('Asignada a otro profesional','Assigned to another professional');}
async function openIntervention(id){detailId=id;detailData=null;detailError='';$('#intervention-dialog').showModal();$('#intervention-dialog').scrollTop=0;navigation({view:'detail',id});await reloadIntervention();}
async function reloadIntervention(){
 if(!detailId||!$('#intervention-dialog').open)return;const id=detailId,sequence=++detailSequence;detailLoading=true;detailError='';renderIntervention();
 try{const data=await api('/incidents/'+encodeURIComponent(id));if(sequence!==detailSequence||!user)return;detailData=data;const draft=jobDraft(id);draft.stored=data.photos;}
 catch(e){if(sequence!==detailSequence)return;detailError=e.status===401?t('Tu sesión ha caducado. Vuelve a entrar.','Your session expired. Sign in again.'):t('No podemos actualizar la ficha. Reintenta antes de realizar cambios.','We cannot refresh this job. Retry before making changes.');}
 finally{if(sequence===detailSequence){detailLoading=false;renderIntervention();}}
}
function renderIntervention(){
 if(!$('#intervention-dialog').open)return;
 const body=$('#intervention-body'),actions=$('#intervention-actions');body.replaceChildren();actions.replaceChildren();
 $('#intervention-title').textContent=detailData?.incident.title||t('Ficha de intervención','Job details');
 $('#intervention-status').textContent=detailLoading?t('Consultando el estado actual…','Checking the current status…'):detailError||inboxError?t('Datos sin actualizar. Actualiza para continuar.','Data could not be refreshed. Refresh to continue.'):'';
 const retry=node('button',t('Actualizar ficha','Refresh job'),'secondary');retry.type='button';retry.disabled=detailLoading;retry.onclick=async()=>{await refresh();await reloadIntervention();};
 if(!detailData){if(!detailLoading)actions.append(retry);return;}
 const i=detailData.incident,current=latestInbox.find(n=>n.id===i.id),changed=!!current&&(current.mine!==i.mine||current.status!==i.status);if(changed)$('#intervention-status').textContent=t('El trabajo ha cambiado. Actualiza la ficha antes de continuar.','This job has changed. Refresh its details before continuing.');body.append(node('span',jobStatus(i),'pill'),node('h3',t('Qué ocurre','What happened')),node('p',i.description||i.title),node('h3',t('Equipo y comercio','Device and retailer')),node('p',i.device_name));
 if(i.site_name)body.append(node('p',i.site_name));
 body.append(node('p',(en[i.skill]&&lang==='en'?en[i.skill]:es[i.skill]||i.skill)+' · '+(i.reason==='offline'?t('Equipo sin conexión','Device offline'):i.reason==='retailer'?t('Aviso del comercio','Retailer report'):t('Fallo reportado','Reported fault')),'muted'));
 const appointment=latestInbox.find(n=>n.id===i.id);if(appointment?.appointment_start){body.append(node('h3',t('Cita confirmada','Confirmed appointment')),node('p',formatDate(appointment.appointment_start,appointment.appointment_timezone)+' — '+formatDate(appointment.appointment_end,appointment.appointment_timezone)));if(appointment.appointment_scope)body.append(node('p',appointment.appointment_scope));if(appointment.appointment_cost_cents!=null)body.append(node('p',(appointment.appointment_cost_cents/100).toLocaleString(lang,{style:'currency',currency:'EUR'})));}
 body.append(node('h3',t('Dónde ir','Where to go')));
 if(i.mine){body.append(node('p',i.address||t('No hay dirección comunicada para este equipo.','No address has been supplied for this device.')));if(Number.isFinite(i.latitude)&&Number.isFinite(i.longitude)){const link=node('a',t('Cómo llegar ↗','Get directions ↗'),'primary directions-link');link.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(i.latitude+','+i.longitude);link.target='_blank';link.rel='noopener noreferrer';body.append(link);}}
 else body.append(node('p',t('La dirección y la ruta solo están disponibles cuando el trabajo está asignado a ti.','The address and directions are available only when this job is assigned to you.'),'muted'));
 if(i.resolution)body.append(node('h3',t('Solución registrada','Recorded solution')),node('p',i.resolution));
 if(i.mine&&detailData.timeline.length){body.append(node('h3',t('Avances y actividad','Progress and activity')));const list=node('ol',undefined,'job-timeline');for(const event of detailData.timeline){const li=node('li');li.append(node('small',formatDate(event.created_at)),node('p',event.kind==='resuelta'?t('Solución y evidencia guardadas.','Solution and evidence saved.'):event.detail));list.append(li);}body.append(list);}
 if(i.mine&&detailData.photos.length){body.append(node('h3',t('Fotos guardadas','Saved photos')));const photos=node('div',undefined,'photo-previews');for(const p of detailData.photos){const img=node('img');img.alt=t('Foto del trabajo terminado','Photo of completed work');photos.append(img);loadSavedPreview(p,img);}body.append(photos);}
 const blocked=detailLoading||!!detailError||!!inboxError||pendingActions.has(i.id)||uploadingPhotos.has(i.id)||!current||changed;
 const button=(label,cls,action)=>{const b=node('button',label,cls);b.type='button';b.disabled=blocked;b.onclick=action;actions.append(b);return b;};
 if(i.status==='open'){const b=button(t('Aceptar intervención →','Accept job →'),'primary',async()=>{const r=await mutateIncident(i.id,()=>api('/incidents/'+encodeURIComponent(i.id)+'/accept',{}),t('Intervención aceptada.','Job accepted.'),'assigned');if(r.ok)await reloadIntervention();});b.disabled=blocked||!user?.available;}
 if(i.mine&&i.status==='assigned'){button(t('Comunicar avance','Post progress'),'secondary',()=>openProgress(i));button(t('Cerrar con fotos','Close with photos'),'primary',()=>openResolution(i));}
 actions.append(retry);
}
async function loadSavedPreview(photo,img){
 const owner=user?.id,key=owner+':'+photo.id;
 try{
  let cached=photoCache.get(key);
  if(!cached){cached={};photoCache.set(key,cached);cached.promise=(async()=>{const response=await fetch(API+'/evidence/'+encodeURIComponent(photo.id),{credentials:'include',cache:'no-store'});if(!response.ok)throw Error();const blob=await response.blob();if(user?.id!==owner)throw Error();cached.url=URL.createObjectURL(blob);return cached.url;})().catch(e=>{photoCache.delete(key);throw e;});}
  img.src=await cached.promise;
 }catch{img.alt=t('Foto guardada; vista previa no disponible. Reintenta actualizar.','Photo saved; preview unavailable. Try refreshing.');}
}
function openProgress(i){activeIncident=i.id;$('#progress-form').elements.note.value=jobDraft(i.id).note;$('#progress-status').textContent='';$('#progress-incident').textContent=i.title;$('#progress-dialog').showModal();jobDialogNavigation('progress',i.id);}
async function openResolution(i){
 activeIncident=i.id;const d=jobDraft(i.id),form=$('#resolution-form'),dialog=$('#resolution-dialog');form.elements.resolution.value=d.resolution;form.elements.evidence_url.value=d.evidence_url;$('#resolution-status').textContent='';$('#resolution-incident').textContent=i.title;$('#photo-status').textContent=t('Consultando fotos guardadas…','Loading saved photos…');renderPhotoDraft();dialog.showModal();dialog.scrollTop=0;jobDialogNavigation('resolution',i.id);dialogBusy(dialog,true);
 try{const data=await api('/incidents/'+encodeURIComponent(i.id));if(activeIncident!==i.id||!dialog.open)return;d.stored=data.photos;renderPhotoDraft();$('#photo-status').textContent='';}
 catch{$('#photo-status').textContent=t('No podemos consultar las fotos guardadas. Se comprobarán de nuevo al reintentar el cierre.','We cannot load saved photos. They will be checked again when you retry closing.');}
 finally{dialogBusy(dialog,false);}
}
$('#progress-form').elements.note.addEventListener('input',e=>jobDraft(activeIncident).note=e.target.value);
for(const name of ['resolution','evidence_url'])$('#resolution-form').elements[name].addEventListener('input',e=>jobDraft(activeIncident)[name]=e.target.value);
function renderPhotoDraft(){
 const d=jobDraft(activeIncident),host=$('#photo-previews');host.replaceChildren();
 for(const p of d.stored){if(d.local.some(l=>l.id===p.id))continue;const figure=node('figure'),img=node('img');img.alt=t('Foto guardada de la intervención','Saved job photo');loadSavedPreview(p,img);figure.append(img,node('figcaption',t('Guardada en el trabajo','Saved with this job')));host.append(figure);}
 d.local.forEach((p,index)=>{const figure=node('figure'),img=node('img');img.src=p.preview;img.alt=t('Vista previa de la foto ','Photo preview ')+(index+1);figure.append(img,node('figcaption',p.id?t('Guardada en el trabajo','Saved with this job'):t('Lista para subir','Ready to upload')));if(!p.id){const remove=node('button',t('Quitar','Remove'),'text-button');remove.type='button';remove.disabled=uploadingPhotos.has(activeIncident);remove.onclick=()=>{URL.revokeObjectURL(p.preview);d.local.splice(index,1);renderPhotoDraft();};figure.append(remove);}host.append(figure);});
}
function choosePhotos(input){
 const d=jobDraft(activeIncident);let error='';for(const file of input.files){if(d.stored.length+d.local.filter(p=>!p.id).length>=6){error=t('Puedes guardar hasta seis fotos.','You can save up to six photos.');break;}if((file.type&&!file.type.startsWith('image/'))||file.size>30*1024*1024||!file.size){error=t('Elige una imagen de hasta 30 MB. Se reducirá antes de subir.','Choose an image up to 30 MB. It will be resized before upload.');continue;}d.local.push({file,preview:URL.createObjectURL(file)});}input.value='';$('#photo-status').textContent=error;renderPhotoDraft();
}
$('#take-photo').onclick=()=>$('#camera-photo').click();$('#choose-photos').onclick=()=>$('#gallery-photos').click();for(const id of ['camera-photo','gallery-photos'])$('#'+id).onchange=e=>choosePhotos(e.target);
async function preparePhoto(file){
 const image=new Image(),url=URL.createObjectURL(file);
 try{image.src=url;await image.decode();if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>60000000)throw Error();const ratio=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob||blob.size>8*1024*1024)throw Error();return blob;}
 catch{throw Error(t('No podemos preparar esta foto. Prueba JPEG, PNG o WebP. Tus otras fotos y el texto siguen aquí.','We cannot prepare this photo. Try JPEG, PNG or WebP. Your other photos and text are still here.'));}finally{URL.revokeObjectURL(url);}
}
async function sendPhoto(id,blob){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
 try{const response=await fetch(API+'/incidents/'+encodeURIComponent(id)+'/photos',{method:'POST',credentials:'include',headers:{'Content-Type':blob.type},body:blob,signal:controller.signal});const data=await response.json();if(!response.ok||!data.photo?.id)throw Error(data.error||t('Subida sin confirmar. Reintenta.','Upload unconfirmed. Retry.'));return data.photo;}
 catch(e){throw Error(e.name==='AbortError'?t('La subida ha tardado demasiado. La foto sigue aquí; reintenta.','The upload timed out. Your photo is still here; retry.'):e.message);}finally{clearTimeout(timeout);}
}
// Uncertain closures are reconciled with authenticated reads only; never resend a write.
const CLOSURE_RETURN_KEY='yk_installer_closure_return_v1',CLOSURE_RETURN_TTL=30*60*1000;
function readClosureReturn(){
 try{const value=JSON.parse(sessionStorage.getItem(CLOSURE_RETURN_KEY)||'null'),now=Date.now();
  if(value&&Object.keys(value).sort().join(',')==='expires,id,ownerTag'&&typeof value.id==='string'&&/^[\w:-]{1,128}$/.test(value.id)&&/^[a-f0-9]{64}$/.test(value.ownerTag)&&Number.isFinite(value.expires)&&value.expires>now&&value.expires<=now+CLOSURE_RETURN_TTL)return value;
  sessionStorage.removeItem(CLOSURE_RETURN_KEY);
 }catch{}return null;
}
const uncertainClosures=new Map(),recoveringClosures=new Set();let closureRecoveryTimer,closureResume=readClosureReturn(),resumingClosure=false;
async function closureOwnerTag(owner){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('installer-closure:'+owner))),b=>b.toString(16).padStart(2,'0')).join('');}
function forgetClosureReturn(){closureResume=null;try{sessionStorage.removeItem(CLOSURE_RETURN_KEY);}catch{}}
async function rememberClosureReturn(id,owner){
 try{const ownerTag=await closureOwnerTag(owner);if(user?.id!==owner)return;closureResume={id,ownerTag,expires:Date.now()+CLOSURE_RETURN_TTL};try{sessionStorage.setItem(CLOSURE_RETURN_KEY,JSON.stringify(closureResume));}catch{}}catch{}
}
async function resumeClosureAfterLogin(){
 const pending=closureResume,owner=user?.id;
 if(!pending||resumingClosure||!owner)return;
 resumingClosure=true;
 try{
  if(pending.expires<=Date.now()||pending.ownerTag!==await closureOwnerTag(owner)){forgetClosureReturn();return;}
  if(user?.id!==owner||closureResume!==pending)return;
  const data=await api('/incidents/'+encodeURIComponent(pending.id));
  if(user?.id!==owner||closureResume!==pending)return;
  if(!data.incident.mine){forgetClosureReturn();return;}
  forgetClosureReturn();
  activeFilter=data.incident.status==='resolved'?'resolved':'assigned';filterChosen=true;render(latestInbox);
  detailId=pending.id;detailData=data;detailError='';detailLoading=false;jobDraft(pending.id).stored=data.photos;
  $('#intervention-dialog').showModal();navigation({view:'detail',id:pending.id});renderIntervention();
 }catch(error){
  if(user?.id!==owner)return;
  if(error.status===401)signedOut(t('Tu sesión ha caducado. Vuelve a entrar para continuar.','Your session has expired. Sign in to continue.'));
  else if(error.status===403||error.status===404)forgetClosureReturn();
  else $('#dashboard-status').textContent=t('No podemos recuperar la intervención pendiente. Lo intentaremos al volver la conexión.','We cannot restore the pending job. We will retry when connected.');
 }finally{resumingClosure=false;}
}
function scheduleClosureRecovery(){
 clearTimeout(closureRecoveryTimer);
 if(uncertainClosures.size)closureRecoveryTimer=setTimeout(recoverClosures,3000);
}
async function confirmRecoveredClosure(id,data,owner){
 if(user?.id!==owner||!data.incident.mine||data.incident.status!=='resolved')return false;
 uncertainClosures.delete(id);if(closureResume?.id===id)forgetClosureReturn();jobDraft(id).stored=data.photos;
 if(await refresh()){activeFilter='resolved';filterChosen=true;render(latestInbox);}
 if(user?.id!==owner)return true;
 $('#dashboard-status').classList.remove('status-error');$('#dashboard-status').textContent=t('El servidor confirma que la intervención está resuelta.','The server confirms this job is resolved.');
 if(activeIncident===id&&$('#resolution-dialog').open){
  $('#resolution-dialog').close();detailId=id;detailData=data;detailError='';detailLoading=false;
  if(!$('#intervention-dialog').open)$('#intervention-dialog').showModal();
  navigation({view:'detail',id},true);renderIntervention();
 }
 if(detailId===id)await reloadIntervention();
 scheduleClosureRecovery();return true;
}
async function recoverClosures(){
 for(const [id,owner] of uncertainClosures){
  if(user?.id!==owner){uncertainClosures.delete(id);continue;}
  if(recoveringClosures.has(id)||uploadingPhotos.has(id)||pendingActions.has(id))continue;
  recoveringClosures.add(id);
  try{
   const data=await api('/incidents/'+encodeURIComponent(id));
   if(user?.id!==owner||uncertainClosures.get(id)!==owner)continue;
   if(await confirmRecoveredClosure(id,data,owner))continue;
   // The server is reachable but has not confirmed a closure. Preserve the draft for a manual retry.
   uncertainClosures.delete(id);if(closureResume?.id===id)forgetClosureReturn();
   if(activeIncident===id&&$('#resolution-dialog').open)$('#resolution-status').textContent=t('El servidor no confirma el cierre. Texto y fotos conservados; puedes reintentar.','The server has not confirmed closure. Text and photos retained; you can retry.');
  }catch(error){if(error.status===401&&user?.id===owner)signedOut(t('Tu sesión ha caducado. Vuelve a entrar para continuar.','Your session has expired. Sign in to continue.'));}
  finally{recoveringClosures.delete(id);}
 }
 scheduleClosureRecovery();
}
window.addEventListener('online',()=>{recoverClosures();resumeClosureAfterLogin();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){recoverClosures();resumeClosureAfterLogin();}});
async function submitResolution(e){
 e.preventDefault();const id=activeIncident;if(pendingActions.has(id)||uploadingPhotos.has(id))return;
 const owner=user?.id;let closureAttempted=false;
 const d=jobDraft(id),dialog=$('#resolution-dialog');d.resolution=e.target.elements.resolution.value;d.evidence_url=e.target.elements.evidence_url.value;
 if(inboxError){$('#resolution-status').textContent=t('Actualiza la bandeja antes de cerrar. Tus datos siguen aquí.','Refresh the inbox before closing. Your data is still here.');return;}
 dialogBusy(dialog,true);uploadingPhotos.add(id);render(latestInbox);$('#resolution-status').textContent='';
 try{
  // Refresh server ownership and restore previously uploaded photos before a retry.
  const data=await api('/incidents/'+encodeURIComponent(id));if(uncertainClosures.has(id)&&await confirmRecoveredClosure(id,data,owner))return;if(!data.incident.mine||data.incident.status!=='assigned')throw Error(t('Actualiza la ficha: el trabajo ya no está en curso a tu nombre.','Refresh the job: it is no longer in progress under your name.'));
  d.stored=data.photos;
  if(!d.local.length&&!d.stored.length&&!d.evidence_url)throw Error(t('Añade una foto del trabajo terminado.','Add a photo of the completed work.'));
  for(let index=0;index<d.local.length;index++){const p=d.local[index];if(p.id&&d.stored.some(s=>s.id===p.id))continue;$('#photo-status').textContent=t('Subiendo foto ','Uploading photo ')+(index+1)+t(' de ',' of ')+d.local.length+'…';p.blob=p.blob||await preparePhoto(p.file);const photo=await sendPhoto(id,p.blob);p.id=photo.id;if(!d.stored.some(s=>s.id===p.id))d.stored.push(photo);renderPhotoDraft();}
  $('#photo-status').textContent=d.stored.length?t('Fotos guardadas. Comprobando el cierre…','Photos saved. Confirming closure…'):'';
  const body={resolution:d.resolution,...(d.stored.length?{evidence_ids:d.stored.map(p=>p.id)}:{evidence_url:d.evidence_url})};
  uploadingPhotos.delete(id);
  closureAttempted=true;await rememberClosureReturn(id,owner);
  const r=await mutateIncident(id,()=>api('/incidents/'+encodeURIComponent(id)+'/resolve',body),t('Solución y evidencia guardadas. Intervención resuelta.','Solution and evidence saved. Job resolved.'),'resolved');
  if(r.ok){if(closureResume?.id===id)forgetClosureReturn();closeJobDialog('resolution-dialog');await reloadIntervention();}
  else{
   // A lost response is not proof of either success or failure. Ask the owning server.
   let data;try{data=await api('/incidents/'+encodeURIComponent(id));}catch{}
   if(data&&(!data.incident.mine||data.incident.status!=='resolved')){if(closureResume?.id===id)forgetClosureReturn();closureAttempted=false;}
   if(!data||!await confirmRecoveredClosure(id,data,owner))throw Error(r.error);
  }
 }catch(error){if(closureAttempted&&user?.id===owner){uncertainClosures.set(id,owner);scheduleClosureRecovery();}
 $('#resolution-status').textContent=error.message+' '+t('Texto y fotos conservados. Reintenta cuando tengas conexión.','Text and photos retained. Retry when connected.');$('#photo-status').textContent=t('Cierre sin confirmar.','Closure unconfirmed.');$('#resolution-status').scrollIntoView({block:'nearest'});}
 finally{uploadingPhotos.delete(id);dialogBusy(dialog,false);renderPhotoDraft();if(user)render(latestInbox);}
}
// History contains view identifiers only. Drafts remain in this document's memory.
const navVisit=crypto.randomUUID();let navRestoring=false,navReady=false;
function navigation(view,replace=false){
 if(!navReady||navRestoring)return;
 const current=history.state?.installer;
 if(!replace&&current?.visit===navVisit&&Object.keys(view).every(k=>current[k]===view[k]))return;
 const index=replace?(current?.visit===navVisit?current.index:0):(current?.visit===navVisit?current.index+1:1);
 history[replace?'replaceState':'pushState']({...history.state,installer:{...view,visit:navVisit,index}},'',location.href);syncNavigation();
}
function wizardNavigation(replace=false){navigation({view:'wizard',mode,step:signupStep},replace);}
function jobDialogNavigation(view,id){navigation({view,id,parent:$('#intervention-dialog').open});}
function closeJobDialog(id){
 if(pendingActions.has(activeIncident)||uploadingPhotos.has(activeIncident))return;
 const current=history.state?.installer;
 if(current?.visit===navVisit&&['detail','progress','resolution'].includes(current.view))history.back();
 else{$('#'+id).close();if(id==='intervention-dialog'){detailSequence++;detailId=null;}}
}
window.addEventListener('popstate',event=>{
 const target=event.state?.installer;
 if(saving||pendingActions.size||uploadingPhotos.size){const currentIndex=lastNavigation?.index??0;const delta=currentIndex-(target?.visit===navVisit?target.index:currentIndex-1);if(delta)history.go(delta);return;}
 navRestoring=true;
 try{
  for(const id of ['resolution-dialog','progress-dialog','intervention-dialog'])$('#'+id).close();detailSequence++;detailId=null;
  if(target?.visit===navVisit&&target.view==='wizard'&&(!user||target.mode==='edit')){
   if(user){$('#dashboard').hidden=true;$('#advanced-integrations').hidden=true;}$('#onboarding').hidden=false;
   setMode(user?'edit':target.mode==='login'?'login':'register');let step=target.step||0;
   if(mode!=='login'){for(let i=0;i<step;i++){setStep(i,false);if(!validateStep(i)){step=i;break;}}}setStep(step);
  }else if(user){
   if($('#dashboard').hidden)showUser();
   if(target?.visit===navVisit&&['detail','progress','resolution'].includes(target.view)){
    const incident=latestInbox.find(i=>i.id===target.id);
    if(target.view==='detail'||target.parent)openIntervention(target.id);
    if(incident?.mine&&incident.status==='assigned'){if(target.view==='progress')openProgress(incident);if(target.view==='resolution')openResolution(incident);}
   }
  }else {$('#onboarding').hidden=false;setMode('login');setStep(0,false);}
 }finally{navRestoring=false;lastNavigation=history.state?.installer;}
});
let lastNavigation=null;
function syncNavigation(){lastNavigation=history.state?.installer;}

$('#close-intervention').onclick=()=>closeJobDialog('intervention-dialog');
$('#cancel-progress').onclick=()=>closeJobDialog('progress-dialog');
$('#cancel-resolution').onclick=()=>closeJobDialog('resolution-dialog');
for(const id of ['intervention-dialog','progress-dialog','resolution-dialog'])$('#'+id).addEventListener('cancel',e=>{e.preventDefault();closeJobDialog(id);});
$('#progress-form').onsubmit=async e=>{
 e.preventDefault();const id=activeIncident;if(pendingActions.has(id))return;const dialog=$('#progress-dialog'),draft=jobDraft(id);draft.note=e.target.elements.note.value;dialogBusy(dialog,true);$('#progress-status').textContent='';
 try{const r=await mutateIncident(id,()=>api('/incidents/'+encodeURIComponent(id)+'/progress',{note:draft.note}),t('Avance guardado y comunicado al comercio.','Progress saved and shared with the retailer.'));if(r.ok){draft.note='';closeJobDialog('progress-dialog');await reloadIntervention();}else $('#progress-status').textContent=r.error;}finally{dialogBusy(dialog,false);}
};
$('#resolution-form').onsubmit=submitResolution;
$$('[data-filter]').forEach(button=>{button.onclick=()=>selectWorkFilter(button.dataset.filter);button.onkeydown=e=>{const buttons=$$('[data-filter]'),index=buttons.indexOf(button);let next;if(e.key==='ArrowRight')next=(index+1)%buttons.length;else if(e.key==='ArrowLeft')next=(index-1+buttons.length)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();selectWorkFilter(buttons[next].dataset.filter,true);};});
$$('[data-open-filter]').forEach(button=>button.onclick=()=>{selectWorkFilter(button.dataset.openFilter);$('#work-title').scrollIntoView({behavior:'smooth'});});
$('#toggle-availability').onclick=async()=>{if(!user||availabilityBusy||user.demo)return;const owner=user.id;availabilityBusy=true;renderProfile();$('#availability-status').textContent='';try{const result=await api('/me',profilePatch(user,{available:!user.available}),'PATCH');if(!user||user.id!==owner)return;user=result.profile;renderProfile();render(latestInbox);$('#availability-status').textContent=user.available?t('Disponibilidad activada.','Availability enabled.'):t('Disponibilidad en pausa.','Availability paused.');}catch(e){if(e.status===401)signedOut(t('Tu sesión ha caducado. Vuelve a entrar para continuar.','Your session has expired. Sign in to continue.'));else if(user)$('#availability-status').textContent=e.message;}finally{availabilityBusy=false;if(user)renderProfile();}};
navReady=true;wizardNavigation(true);language(lang);initMap();
let sessionChecking=false;
async function checkSession(){
 if(sessionChecking)return;sessionChecking=true;$('#session-check').hidden=false;$('#session-check').setAttribute('aria-busy','true');$('#session-status').textContent=t('Comprobando tu sesión…','Checking your session…');$('#retry-session').hidden=true;$('#onboarding').hidden=true;$('#login-top').disabled=true;
 try{const result=await api('/me');user=result.profile;$('#session-check').hidden=true;showUser();}
 catch(e){if(e.status===401){$('#session-check').hidden=true;$('#onboarding').hidden=false;}
 else{$('#session-status').textContent=t('No podemos comprobar tu sesión. Revisa la conexión y vuelve a intentarlo.','We cannot check your session. Check your connection and try again.');$('#retry-session').hidden=false;}}
 finally{sessionChecking=false;$('#login-top').disabled=false;$('#session-check').setAttribute('aria-busy','false');}
}
$('#retry-session').onclick=checkSession;checkSession();
setInterval(()=>{if(!document.hidden)refresh();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
// An explicit sign-up link takes priority over a remembered login.
if(closureResume)setMode('login');
else if(new URLSearchParams(location.search).get('alta')==='1')setMode('register');
else if(rememberedUser())setMode('login');
wizardNavigation(true);
})();
