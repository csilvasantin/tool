/* ============================================================================
 * Yokup — configuración del frontend.
 *
 * BACKEND:
 *   'local'    -> mock en localStorage (demo, sin servidor).
 *   'api'      -> Cloudflare Worker yokup-api + D1 (SQLite). MODO ACTUAL (producción).
 *   'supabase' -> la web habla DIRECTO con Supabase (PostgREST) con la anon key.
 *                 ⚠️ ROLLBACK / OBSOLETO: el proyecto Supabase original ya no existe
 *                 (NXDOMAIN). Se mantiene la config solo como referencia de rollback.
 *
 * Modo 'api' (actual): el navegador habla SOLO con el Worker yokup-api, que lee/escribe
 * la base D1 'yokup-db'. No hay claves en el navegador; el control de datos vive en el
 * Worker (fase 2 añadirá auth Google/whitelist estilo admira.live).
 *
 * Forzar backend en la URL con ?backend=api|local|supabase (útil para probar).
 * ==========================================================================*/
window.YOKUP_CONFIG = {
  BACKEND: 'api',                        // 'local' | 'api' | 'supabase'

  // Backend 'api' (Cloudflare Worker + D1) — MODO ACTUAL:
  YOKUP_API: 'https://yokup-api.csilvasantin.workers.dev',

  // Worker admira-telegram: tablero central de incidencias/tareas (source=yokup) y
  // Central de Incidencias por Voz (POST /api/voz-incidencia). Usado por voz.html.
  ADMIRA_API: 'https://admira-telegram.csilvasantin.workers.dev',

  // Backend 'supabase' (directo) — OBSOLETO, solo rollback histórico (proyecto caído):
  SUPABASE_URL: 'https://aswwjkfejdfglpxlgbjl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzd3dqa2ZlamRmZ2xweGxnYmpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTkxNDYsImV4cCI6MjA5NTg3NTE0Nn0.bHaSsgewInO9jI8bwb5E15CokHoo2br6wFQAPS60sVk',
};

// Forzar backend con ?backend=supabase|api|local en la URL (útil para probar).
(function(){
  try{
    const p = new URLSearchParams(location.search).get('backend');
    if (['api','local','supabase'].includes(p)) window.YOKUP_CONFIG.BACKEND = p;
  }catch(e){}
})();
