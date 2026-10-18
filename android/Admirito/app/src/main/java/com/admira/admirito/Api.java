package com.admira.admirito;
import android.content.Context;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.json.*;
final class Api {
 private final Vault vault; private JSONObject credential;
 Api(Context context) throws Exception {vault=new Vault(context);credential=vault.load();}
 synchronized String account(){return credential.optLong("expires")>System.currentTimeMillis()?credential.optString("account"):"";}
 synchronized void paired(String account) throws Exception {if(credential.optLong("expires")<=System.currentTimeMillis()||!credential.optString("cookie").startsWith("__Host-admira_agents="))throw new IOException("pairing_cookie_missing");credential.put("account",account);vault.save(credential);}
 synchronized void unlink(){credential=new JSONObject();vault.clear();}
 JSONObject json(String path,JSONObject body) throws Exception {return request(path,body==null?null:body.toString().getBytes(StandardCharsets.UTF_8),"application/json");}
 JSONObject request(String path,byte[] data,String mime) throws Exception {return request(path,data,mime,false);}
 JSONObject request(String path,byte[] data,String mime,boolean command) throws Exception {
  if(!path.startsWith("agents/"))throw new IOException("invalid_route");
  HttpURLConnection c=(HttpURLConnection)new URL("https://api.admira.biz/"+path).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(20000);c.setReadTimeout(110000);c.setRequestProperty("User-Agent","Mozilla/5.0 AdmiritoAndroid");c.setRequestProperty("Origin","https://www.admira.app");c.setRequestProperty("Accept","application/json");
  synchronized(this){if(credential.optLong("expires")>System.currentTimeMillis())c.setRequestProperty("Cookie",credential.optString("cookie"));}
  if(data!=null){c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type",mime);if(command&&path.equals("agents/transcribe"))c.setRequestProperty("X-Admirito-Language","es");try(OutputStream out=c.getOutputStream()){out.write(data);}}
  try {int code=c.getResponseCode();InputStream stream=code<400?c.getInputStream():c.getErrorStream();String text=stream==null?"{}":new String(read(stream),StandardCharsets.UTF_8);JSONObject result=new JSONObject(text);
   if(code>=400)throw new IOException(result.optString("error","http_"+code));
   for(java.util.Map.Entry<String,java.util.List<String>> header:c.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(header.getKey()))for(String cookie:header.getValue())if(cookie.startsWith("__Host-admira_agents=")){long seconds=0;for(String part:cookie.split(";"))if(part.trim().startsWith("Max-Age="))seconds=Long.parseLong(part.trim().substring(8));synchronized(this){credential.put("cookie",cookie.split(";")[0]);credential.put("expires",System.currentTimeMillis()+seconds*1000);vault.save(credential);}}
   return result;
  }finally{c.disconnect();}
 }
 byte[] cameraFrame() throws Exception {
  HttpURLConnection c=(HttpURLConnection)new URL("https://api.admira.biz/agents/lab-camera/frame").openConnection();
  c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(20000);c.setRequestProperty("User-Agent","Mozilla/5.0 AdmiritoAndroid");c.setRequestProperty("Origin","https://www.admira.app");
  synchronized(this){if(credential.optLong("expires")>System.currentTimeMillis())c.setRequestProperty("Cookie",credential.optString("cookie"));}
  try{if(c.getResponseCode()!=200||!"image/jpeg".equals(c.getContentType()))throw new IOException("camera_unavailable");return read(c.getInputStream());}finally{c.disconnect();}
 }
 static String text(java.nio.file.Path path) throws IOException {return new String(java.nio.file.Files.readAllBytes(path),StandardCharsets.UTF_8);}
 static byte[] read(InputStream in) throws IOException {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);return out.toByteArray();}
 static JSONObject object(Object... pairs) throws JSONException {JSONObject o=new JSONObject();for(int i=0;i<pairs.length;i+=2)o.put((String)pairs[i],pairs[i+1]);return o;}
}
