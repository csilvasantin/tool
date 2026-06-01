-- ============================================================================
-- Yokup — RLS para acceso directo desde el navegador (modo DEMO).
-- Ejecutar DESPUÉS de schema.sql.
--
-- ⚠️  AVISO DE SEGURIDAD (leer):
--   Yokup todavía NO tiene autenticación de usuarios. Para que el frontend estático
--   hable directamente con Supabase usando la *anon key* (pública), estas políticas
--   permiten lectura/escritura al rol anónimo. Es aceptable para una DEMO pública,
--   pero significa que cualquiera con la anon key puede leer/escribir estas tablas.
--   Antes de producción real: añadir Supabase Auth (roles centro/técnico/operador) y
--   sustituir estas políticas por unas basadas en auth.uid()/rol. Ver docs/00-definicion.md.
-- ============================================================================

-- Activa RLS en todas las tablas (deny-by-default) y luego abre el acceso demo.
do $$
declare t text;
begin
  foreach t in array array[
    'store','surface','technician','intervention','intervention_event',
    'offer','rating','webhook_inbox'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    -- Política demo: acceso total al rol anónimo y autenticado.
    execute format($f$
      drop policy if exists "demo_all" on public.%I;
      create policy "demo_all" on public.%I
        for all to anon, authenticated
        using (true) with check (true);
    $f$, t, t);
  end loop;
end $$;

-- Asegura los privilegios de tabla para los roles del API (PostgREST).
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
