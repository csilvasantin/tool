package com.admira.admirito;
import android.test.ActivityInstrumentationTestCase2;
import android.view.*;
import android.webkit.WebView;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
public class FoldLayoutTest extends ActivityInstrumentationTestCase2<MainActivity> {
 public FoldLayoutTest(){super(MainActivity.class);}
 private WebView find(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}return null;}
 private String js(String code)throws Exception{AtomicReference<String> result=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);getInstrumentation().runOnMainSync(()->find(getActivity().getWindow().getDecorView()).evaluateJavascript(code,r->{result.set(r);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return result.get();}
 public void testBothOrientations()throws Exception{MainActivity activity=getActivity();int previous=activity.getRequestedOrientation();try{for(int orientation:new int[]{android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT,android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE}){getInstrumentation().runOnMainSync(()->activity.setRequestedOrientation(orientation));Thread.sleep(900);testMascotsAndViewport();}}finally{getInstrumentation().runOnMainSync(()->activity.setRequestedOrientation(previous));}}
 public void testMascotsAndViewport()throws Exception{getActivity();long deadline=System.currentTimeMillis()+10000;while(!"true".equals(js("Boolean(document.querySelector('#pet')?.contentDocument?.querySelector('svg'))"))&&System.currentTimeMillis()<deadline)Thread.sleep(200);assertEquals("true",js("Boolean(document.querySelector('#pet').contentDocument.querySelector('svg'))"));
  for(String agent:new String[]{"admirito","bugito","supervisor"}){js("update({agent:'"+agent+"'})");Thread.sleep(350);assertEquals("true",js("document.querySelector('[data-agent="+agent+"]').getAttribute('aria-pressed')==='true'"));assertEquals("true",js("Boolean(document.querySelector('#pet').contentDocument.querySelector('svg'))"));}
  assertEquals("true",js("document.documentElement.scrollWidth<=innerWidth+1"));assertEquals("true",js("document.querySelector('#stage').getBoundingClientRect().height>innerHeight*.35"));
  js("document.querySelector('#pet').contentWindow.setPetPresentation(1,-1,true)");assertEquals("true",js("document.querySelector('#pet').contentDocument.querySelector('.da-nube-ojos').parentNode.getAttribute('transform').includes('7 -5')"));
  js("update({agent:'admirito'})");
 }
}
