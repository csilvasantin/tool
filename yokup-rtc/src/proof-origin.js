export const RTC_MEDIA_ORIGIN = 'https://yokup-rtc.csilvasantin.workers.dev';
export const OWN_MEDIA_ORIGINS = new Set([RTC_MEDIA_ORIGIN, 'https://api.yokup.com']);

export function missionProofOrigin(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.pathname.startsWith('/media/fleet/') && OWN_MEDIA_ORIGINS.has(url.origin)) return url.origin;
  } catch (_) {}
  return RTC_MEDIA_ORIGIN;
}
