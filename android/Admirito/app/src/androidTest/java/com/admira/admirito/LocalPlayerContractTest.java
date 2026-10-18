package com.admira.admirito;
import android.test.AndroidTestCase;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
public class LocalPlayerContractTest extends AndroidTestCase {
 public void testExplicitCommandsRejectMissingAndInjectedTargets(){
  LocalPlayer.Request r=LocalPlayer.Request.parse("/player starbucks alsea-sbux-021 IoT_1");assertEquals("IoT_1",r.device);assertNull(LocalPlayer.Request.parse("/player"));
  for(String text:Arrays.asList("/player x y","/player x y https://evil.example","/player x y x;alert(1)","/player x y z extra")){try{LocalPlayer.Request.parse(text);fail(text);}catch(IllegalArgumentException expected){}}
 }
 public void testCanonicalMembershipAndSourcePreference()throws Exception{
  JSONObject body=new JSONObject("{\"locations\":[{\"id\":\"alsea-sbux-021\",\"name\":\"Fixture ES\",\"iot\":[{\"idIoT\":\"IoT_1\",\"name\":\"iPad\",\"player\":\"ipad-admin-mupi\",\"instance\":\"other-id\"}]},{\"id\":\"mexico-starbucks\",\"name\":\"Starbucks\"},{\"id\":\"books\",\"name\":\"Fixture EN\",\"project_id\":\"books\",\"surfaces\":[{\"idIoT\":\"Books_1\",\"screen\":\"books-screen\"}]}]}");
  List<LocalPlayer.Site> sites=LocalPlayer.catalog(body);assertEquals(2,sites.size());for(LocalPlayer.Site s:sites){if(s.id.equals("alsea-sbux-021")){assertTrue(s.projects.contains("starbucks"));assertEquals("ipad-admin-mupi",s.devices.get(0).screen);assertEquals("IoT_1",s.devices.get(0).id);}else{assertTrue(s.projects.contains("books"));assertEquals("Books_1",s.devices.get(0).id);}}
 }
 public void testEmptyAndUnsafeAssignmentsFailClosed()throws Exception{
  for(String body:Arrays.asList("{\"ok\":true,\"draft\":{\"items\":[]}}","{\"ok\":false}","{\"ok\":true,\"draft\":{\"items\":[{\"asset\":\"http://unsafe.example/a.mp4\",\"assetType\":\"video\"}]}}")){try{LocalPlayer.playlist(body.getBytes(StandardCharsets.UTF_8));fail(body);}catch(Exception expected){}}
  assertEquals("ES / EN",LocalPlayer.playlist("{\"ok\":true,\"draft\":{\"name\":\"ES / EN\",\"items\":[{\"asset\":\"https://example.com/a.mp4\",\"assetType\":\"video\"}]}}".getBytes(StandardCharsets.UTF_8)));
 }
}
