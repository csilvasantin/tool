/* ============================================================================
 * Yokup — configuración del frontend.
 *
 * BACKEND:
 *   'local' -> mock en localStorage (demo, sin servidor). Es el valor por defecto.
 *   'api'   -> Cloudflare Worker yokup-api + Supabase (producción).
 *
 * Para enchufar Supabase:
 *   1. Crea el proyecto Supabase y aplica db/schema.sql.
 *   2. Despliega el worker (yokup/api) con sus secrets — ver api/README.md.
 *   3. Pon aquí YOKUP_API con la URL del worker y cambia BACKEND a 'api'.
 *
 * ESTADO (2026-06-01): web ya en producción (GitHub Pages, www.carlossilva.info/yokup/).
 * Falta SOLO el paso 3: desplegar el worker y pegar su URL abajo. El worker ya tiene
 * www.carlossilva.info en ALLOWED_ORIGINS, así que en cuanto pongas la URL real y
 * BACKEND:'api', el frontend de producción hablará con Supabase sin más cambios.
 * ==========================================================================*/
window.YOKUP_CONFIG = {
  BACKEND: 'local',                                  // 'local' | 'api'  ← cambiar a 'api' tras desplegar
  YOKUP_API: 'https://yokup-api.<tu-subdominio>.workers.dev',   // ← pega aquí la URL del deploy
};

// Permite forzar el backend con ?backend=api en la URL (útil para probar sin editar).
(function(){
  try{
    const p = new URLSearchParams(location.search).get('backend');
    if (p === 'api' || p === 'local') window.YOKUP_CONFIG.BACKEND = p;
  }catch(e){}
})();
