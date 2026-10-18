package com.admira.admirito;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Public playlist reader. Source IoT identity is never used for telemetry or controls. */
final class LocalPlayer {
 static final class Request {
  final String project,location,device;
  Request(String p,String l,String d){project=p;location=l;device=d;}
  static Request parse(String command){
   String[] p=command.trim().split("\\s+");if(!p[0].equalsIgnoreCase("/player"))throw new IllegalArgumentException("Usa /player PROYECTO LOCAL ID_IOT");
   if(p.length==1)return null;
   if(p.length!=4)throw new IllegalArgumentException("Usa /player PROYECTO LOCAL ID_IOT");
   for(int i=1;i<4;i++)if(!p[i].matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,159}"))throw new IllegalArgumentException("Identificador no válido");
   return new Request(p[1],p[2],p[3]);
  }
 }
 static final class Device {final String id,name,screen;Device(String i,String n,String s){id=i;name=n;screen=s;}}
 static final class Site {final String id,name;final Set<String> projects;final List<Device> devices;Site(String i,String n,Set<String> p,List<Device>d){id=i;name=n;projects=p;devices=d;}}
 static String first(JSONObject j,String...keys){for(String k:keys){Object value=j.opt(k);if(value instanceof String&&!((String)value).isEmpty())return (String)value;}return "";}
 static List<Site> catalog(JSONObject body)throws JSONException{
  List<Site> sites=new ArrayList<>();JSONArray rows=body.getJSONArray("locations");
  for(int i=0;i<rows.length();i++){
   JSONObject row=rows.getJSONObject(i);String id=row.optString("id"),name=row.optString("name");Set<String> projects=new TreeSet<>();
   JSONArray pp=row.optJSONArray("projects");if(pp!=null)for(int j=0;j<pp.length();j++)if(pp.get(j) instanceof String)projects.add(pp.getString(j));
   String explicit=first(row,"project_id");if(!explicit.isEmpty())projects.add(explicit);
   if(id.startsWith("alsea-sbux-"))projects.add("starbucks");
   if(id.isEmpty()||name.isEmpty()||projects.isEmpty())continue;
   List<Device> devices=new ArrayList<>();Set<String> seen=new HashSet<>();
   for(String key:Arrays.asList("iot","surfaces")){JSONArray items=row.optJSONArray(key);if(items==null)continue;
    for(int j=0;j<items.length();j++){JSONObject item=items.getJSONObject(j);String screen=first(item,"player","instance","screen"),device=first(item,"idIoT","itil");if(device.isEmpty())device=screen;
     if(!screen.matches("[a-z0-9][a-z0-9_-]{1,79}")||device.isEmpty()||!seen.add(device))continue;
     devices.add(new Device(device,item.optString("name",device),screen));
    }
   }
   sites.add(new Site(id,name,projects,devices));
  }
  sites.sort((a,b)->a.name.compareToIgnoreCase(b.name));return sites;
 }
 static String playlist(byte[] data)throws Exception{
  JSONObject body=new JSONObject(new String(data,java.nio.charset.StandardCharsets.UTF_8));JSONObject draft=body.optJSONObject("draft");JSONArray items=draft==null?null:draft.optJSONArray("items");
  if(!body.optBoolean("ok")||items==null||items.length()==0)throw new IOException("Este IoT no tiene una playlist reproducible asignada.");
  for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);Uri u=Uri.parse(first(item,"asset","url"));String type=first(item,"assetType","type");if(type.isEmpty())type="image";
   if(!"https".equals(u.getScheme())||u.getHost()==null||!Arrays.asList("video","animation","audio","music","locucion","image").contains(type.toLowerCase(Locale.ROOT)))throw new IOException("La playlist contiene un medio no reproducible.");
  }
  return draft.optString("name","Playlist asignada");
 }
 static byte[] read(String url)throws Exception{
  HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setRequestProperty("User-Agent","Mozilla/5.0 AdmiritoFoldPlayer");c.setUseCaches(false);
  try{if(c.getResponseCode()!=200)throw new IOException("No se ha podido consultar Admira. Reintenta la conexión.");try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){if(out.size()+n>32*1024*1024)throw new IOException("Respuesta demasiado grande");out.write(b,0,n);}return out.toByteArray();}}finally{c.disconnect();}
 }
 private final Activity host;private final Dialog dialog;private final Handler main=new Handler(Looper.getMainLooper());private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final LinearLayout box;private final TextView status,identity;private final Spinner projects,locations,devices;private final Button start,resume;private final EditText search;
 private List<Site> all=new ArrayList<>(),visible=new ArrayList<>();private List<Device> choices=new ArrayList<>();private List<String> projectIDs=new ArrayList<>();
 private WebView player;private boolean loading,closed,suspended,foreground=true;private volatile byte[] confirmed;private final Request request;
 LocalPlayer(Activity a,Request r){host=a;request=r;dialog=new Dialog(a,android.R.style.Theme_Material_Light_NoActionBar_Fullscreen);
  box=new LinearLayout(a);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(16,12,16,12);box.setBackgroundColor(0xfff6f8f1);
  Button close=new Button(a);close.setText("Volver a Admirito");close.setOnClickListener(v->dialog.dismiss());box.addView(close);
  status=new TextView(a);status.setText("Cargando proyectos, locales e IoT…");status.setContentDescription("Estado del player");box.addView(status);
  projects=new Spinner(a);projects.setContentDescription("Proyecto");locations=new Spinner(a);locations.setContentDescription("Local");devices=new Spinner(a);devices.setContentDescription("Dispositivo IoT");search=new EditText(a);search.setSingleLine(true);search.setHint("Buscar local");
  label("Proyecto");box.addView(projects);box.addView(search);label("Local");box.addView(locations);label("Dispositivo IoT");box.addView(devices);
  identity=new TextView(a);box.addView(identity);start=new Button(a);start.setText("Reproducir en este Fold");start.setEnabled(false);box.addView(start);resume=new Button(a);resume.setText("Reanudar en este Fold");resume.setVisibility(View.GONE);box.addView(resume);
  TextView note=new TextView(a);note.setText("La playlist se reproduce aquí con identidad propia. El IoT de origen conserva su emisión y sus controles. Vídeo silenciado.");box.addView(note);
  projectIDs.add("");adapter(projects,Arrays.asList("Selecciona un proyecto"));adapter(locations,Arrays.asList("Selecciona un local"));adapter(devices,Arrays.asList("Selecciona un dispositivo"));
  projects.setOnItemSelectedListener(listener(()->sites()));locations.setOnItemSelectedListener(listener(()->deviceChoices()));devices.setOnItemSelectedListener(listener(()->{Device d=chosen();start.setEnabled(!loading&&d!=null);identity.setText(d==null?"":"IoT: "+d.id+" · Player: "+d.screen);}));
  search.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int af){}public void onTextChanged(CharSequence s,int st,int before,int count){sites();}public void afterTextChanged(android.text.Editable e){}});
  start.setOnClickListener(v->launch());resume.setOnClickListener(v->{suspended=false;resume.setVisibility(View.GONE);dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);player.evaluateJavascript("if(typeof setPaused==='function')setPaused(false);document.querySelectorAll('video,audio').forEach(x=>x.play().catch(()=>{}))",null);});
  ScrollView scroll=new ScrollView(a);scroll.addView(box);dialog.setContentView(scroll);dialog.setOnDismissListener(d->close());dialog.show();load();
 }
 private void label(String text){TextView v=new TextView(host);v.setText(text);box.addView(v);}
 private void adapter(Spinner spinner,List<String> rows){ArrayAdapter<String> a=new ArrayAdapter<>(host,android.R.layout.simple_spinner_item,rows);a.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);spinner.setAdapter(a);}
 private android.widget.AdapterView.OnItemSelectedListener listener(Runnable r){return new android.widget.AdapterView.OnItemSelectedListener(){public void onItemSelected(android.widget.AdapterView<?> p,View v,int n,long id){r.run();}public void onNothingSelected(android.widget.AdapterView<?> p){}};}
 private String project(){int p=projects.getSelectedItemPosition();return p>=0&&p<projectIDs.size()?projectIDs.get(p):"";}
 private Site site(){int p=locations.getSelectedItemPosition()-1;return p>=0&&p<visible.size()?visible.get(p):null;}
 private Device chosen(){int p=devices.getSelectedItemPosition()-1;return p>=0&&p<choices.size()?choices.get(p):null;}
 private void sites(){if(player!=null)return;String p=project(),q=search.getText().toString().toLowerCase(Locale.ROOT);visible=new ArrayList<>();List<String> names=new ArrayList<>(Arrays.asList("Selecciona un local"));for(Site s:all)if(s.projects.contains(p)&&(q.isEmpty()||s.name.toLowerCase(Locale.ROOT).contains(q)||s.id.toLowerCase(Locale.ROOT).contains(q))){visible.add(s);names.add(s.name);}adapter(locations,names);deviceChoices();}
 private void deviceChoices(){if(player!=null)return;Site s=site();choices=s==null?new ArrayList<>():s.devices;List<String> names=new ArrayList<>(Arrays.asList("Selecciona un dispositivo"));for(Device d:choices)names.add(d.name);adapter(devices,names);start.setEnabled(false);identity.setText(s!=null&&choices.isEmpty()?"Este local no tiene IoT asociado en el catálogo.":"");}
 private void load(){loading=true;worker.execute(()->{try{List<Site> data=catalog(new JSONObject(new String(read("https://api.admira.store/locations"),java.nio.charset.StandardCharsets.UTF_8)));main.post(()->{if(closed)return;all=data;Set<String> p=new TreeSet<>();for(Site s:all)p.addAll(s.projects);projectIDs=new ArrayList<>(Arrays.asList(""));projectIDs.addAll(p);List<String> names=new ArrayList<>(Arrays.asList("Selecciona un proyecto"));names.addAll(p);adapter(projects,names);loading=false;status.setText("Catálogo actualizado. Selecciona proyecto, local e IoT.");if(request!=null)applyRequest();});}catch(Exception e){main.post(()->{loading=false;status.setText("No se ha podido cargar el catálogo. Cierra y reintenta.");});}});}
 private void applyRequest(){for(Site s:all)if(s.id.equals(request.location)&&s.projects.contains(request.project))for(Device d:s.devices)if(d.id.equals(request.device)){identity.setText(request.project+" · "+s.id+" · "+d.id);prepare(d,request.project,s.id);return;}status.setText("La combinación proyecto, local e IoT no existe en el catálogo.");}
 private void launch(){Device d=chosen();Site s=site();if(d==null||s==null||loading)return;prepare(d,project(),s.id);}
 private void prepare(Device d,String project,String location){loading=true;start.setEnabled(false);projects.setEnabled(false);locations.setEnabled(false);devices.setEnabled(false);search.setEnabled(false);status.setText("Comprobando la playlist asignada…");
  worker.execute(()->{try{byte[] data=read("https://admira.tv/api/playlist?screen="+Uri.encode(d.screen));String name=playlist(data);main.post(()->{if(closed)return;confirmed=data;showPlayer(d,project,location,name);});}catch(Exception e){main.post(()->{if(closed)return;loading=false;projects.setEnabled(true);locations.setEnabled(true);devices.setEnabled(true);search.setEnabled(true);start.setEnabled(chosen()!=null);status.setText(e.getMessage()!=null?e.getMessage():"No se ha podido preparar la playlist.");});}});
 }
 private void showPlayer(Device d,String project,String location,String name){
  if(box.getParent() instanceof ViewGroup)((ViewGroup)box.getParent()).removeView(box);dialog.setContentView(box);
  for(View v:Arrays.asList(projects,locations,devices,search,start))v.setVisibility(View.GONE);
  // Remove setup labels once playback starts; retain only back, status, identity and resume.
  for(int i=box.getChildCount()-1;i>=0;i--){View v=box.getChildAt(i);if(v!=status&&v!=identity&&v!=resume&&i!=0)box.removeViewAt(i);}
  identity.setText(name+"\n"+project+" · "+location+" · "+d.id);
  String key="local-player-identity";android.content.SharedPreferences prefs=host.getSharedPreferences("player",0);String saved=prefs.getString(key,"");if(saved.isEmpty()){saved="virtual-admirito-fold-"+UUID.randomUUID().toString();prefs.edit().putString(key,saved).apply();}final String screen=saved;
  player=new WebView(host);player.setBackgroundColor(android.graphics.Color.BLACK);player.setVisibility(View.INVISIBLE);player.getSettings().setJavaScriptEnabled(true);player.getSettings().setDomStorageEnabled(true);player.getSettings().setMediaPlaybackRequiresUserGesture(false);player.getSettings().setAllowFileAccess(false);player.getSettings().setAllowContentAccess(false);player.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  player.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest req){Uri u=req.getUrl();return !("https".equals(u.getScheme())&&Arrays.asList("admira.tv","www.admira.tv").contains(u.getHost()));}
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest req){Uri u=req.getUrl();if("https".equals(u.getScheme())&&Arrays.asList("admira.tv","www.admira.tv").contains(u.getHost())&&"/api/playlist".equals(u.getPath())&&screen.equals(u.getQueryParameter("screen"))){try{byte[] next=read("https://admira.tv/api/playlist?screen="+Uri.encode(d.screen));playlist(next);confirmed=next;}catch(Exception ignored){}return new WebResourceResponse("application/json","UTF-8",new ByteArrayInputStream(confirmed));}return null;}
  });box.addView(player,new LinearLayout.LayoutParams(-1,0,1));dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  Uri url=Uri.parse("https://admira.tv/canal").buildUpon().appendQueryParameter("screen",screen).appendQueryParameter("circuit",screen).appendQueryParameter("playerType","virtual").appendQueryParameter("clean","1").appendQueryParameter("fit","screen").appendQueryParameter("muted","1").appendQueryParameter("rtb","0").appendQueryParameter("sincro","0").appendQueryParameter("name","Admirito · Fold").build();player.loadUrl(url.toString());main.postDelayed(poll,500);
 }
 private final Runnable poll=new Runnable(){public void run(){if(closed||player==null||!foreground)return;player.evaluateJavascript("(()=>{try{const assigned=typeof playlist!=='undefined'&&playlist.length>0&&playlist.every(i=>i._default===true),v=document.querySelector('#stage video,#stage audio'),im=document.querySelector('#stage img');return {assigned,time:v?.currentTime||0,ready:v?.readyState||0,paused:v?.paused??true,image:!!(im&&im.complete&&im.naturalWidth)};}catch(e){return {};}})()",value->{if(closed)return;try{JSONObject j=new JSONObject(value);boolean assigned=j.optBoolean("assigned"),playing=assigned&&j.optInt("ready")>=2&&!j.optBoolean("paused",true)&&j.optDouble("time")>.2;player.setVisibility(assigned?View.VISIBLE:View.INVISIBLE);if(!suspended)status.setText(playing?"Reproduciendo en este Fold · "+(int)j.optDouble("time")+" s":j.optBoolean("image")?"Imagen de la playlist en pantalla":"Cargando contenido de la playlist…");}catch(Exception ignored){}if(!closed&&foreground)main.postDelayed(this,1000);});}};
 boolean showing(){return !closed&&dialog.isShowing();}
 void pause(){foreground=false;main.removeCallbacks(poll);if(player!=null){suspended=true;status.setText("Player pausado al salir de la aplicación");resume.setVisibility(View.VISIBLE);player.evaluateJavascript("if(typeof setPaused==='function')setPaused(true);document.querySelectorAll('video,audio').forEach(x=>x.pause())",null);player.onPause();dialog.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}}
 void foreground(){foreground=true;if(player!=null){player.onResume();main.removeCallbacks(poll);main.post(poll);}}
 void close(){if(closed)return;closed=true;main.removeCallbacksAndMessages(null);worker.shutdownNow();if(player!=null){player.stopLoading();player.destroy();}if(dialog.isShowing())dialog.dismiss();}
}
