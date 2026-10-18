package com.admira.admirito;

import android.test.AndroidTestCase;

public class SuiteAuthNavigationTest extends AndroidTestCase {
 public void testGoogleAndLiveHandoffCanReturnToSuite() {
  assertTrue(SuiteAuthNavigation.allows("https://accounts.google.com/"));
  assertTrue(SuiteAuthNavigation.allows("https://fleet.admira.live/api/auth/handoff?code=opaque"));
  assertTrue(SuiteAuthNavigation.allows("https://fleet.admira.live:443/api/auth/handoff?code=opaque"));
 }
 public void testOtherFleetRoutesAndLookalikesRemainBlocked() {
  String[] blocked={"http://fleet.admira.live/api/auth/handoff", "https://fleet.admira.live/api/auth/handoff/", "https://fleet.admira.live/api/auth/handoff/../control", "https://fleet.admira.live/api/control", "https://fleet.admira.live.evil.test/api/auth/handoff", "https://fleet.admira.live@evil.test/api/auth/handoff", "https://user@fleet.admira.live/api/auth/handoff", "https://fleet.admira.live:8443/api/auth/handoff", "https://fleet.admira.live/api/auth/%68andoff", "javascript:alert(1)", "https://accounts.google.com.evil.test/"};
  for(String url:blocked)assertFalse(url,SuiteAuthNavigation.allows(url));
 }
}
