package com.admira.admirito;

import java.net.URI;

/** Authentication destinations may navigate, but never receive the suite command bridge. */
final class SuiteAuthNavigation {
 private SuiteAuthNavigation() {}
 static boolean allows(String value) {
  try {
   URI url = new URI(value);
   if (!"https".equals(url.getScheme()) || url.getRawUserInfo() != null
       || (url.getPort() != -1 && url.getPort() != 443)) return false;
   if ("accounts.google.com".equals(url.getHost())) return true;
   // Live exchanges its one-use Google handoff here before returning to /analizar.
   return "fleet.admira.live".equals(url.getHost())
       && "/api/auth/handoff".equals(url.getRawPath());
  } catch (Exception ignored) { return false; }
 }
}
