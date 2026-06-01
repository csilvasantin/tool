/* ============================================================================
 * Yokup — configuración del frontend.
 *
 * BACKEND:
 *   'local'    -> mock en localStorage (demo, sin servidor). Valor por defecto.
 *   'supabase' -> la web habla DIRECTO con Supabase (PostgREST) con la anon key.
 *                 Tablas: db/schema-demo.sql + db/rls-demo.sql. SIN worker.
 *   'api'      -> Cloudflare Worker yokup-api + Supabase (arquitectura con worker).
 *
 * Para 'supabase' (lo que estamos montando):
 *   1. Crear proyecto Supabase y ejecutar db/schema-demo.sql (incluye RLS demo).
 *   2. Project Settings → API: copiar Project URL y la anon key (PÚBLICA).
 *   3. Rellenar SUPABASE_URL / SUPABASE_ANON_KEY abajo y poner BACKEND: 'supabase'.
 *
 * La anon key es pública por diseño (va en el navegador). La service_role NUNCA aquí.
 * ==========================================================================*/
window.YOKUP_CONFIG = {
  BACKEND: 'supabase',                   // 'local' | 'supabase' | 'api'

  // Backend 'supabase' (directo):
  SUPABASE_URL: 'https://aswwjkfejdfglpxlgbjl.supabase.co',                      // ej: https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzd3dqa2ZlamRmZ2xweGxnYmpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTkxNDYsImV4cCI6MjA5NTg3NTE0Nn0.bHaSsgewInO9jI8bwb5E15CokHoo2br6wFQAPS60sVk',                 // anon/public key (NO la service_role)

  // Backend 'api' (worker), opcional:
  YOKUP_API: 'https://yokup-api.<tu-subdominio>.workers.dev',
};

// Forzar backend con ?backend=supabase|api|local en la URL (útil para probar).
(function(){
  try{
    const p = new URLSearchParams(location.search).get('backend');
    if (['api','local','supabase'].includes(p)) window.YOKUP_CONFIG.BACKEND = p;
  }catch(e){}
})();
