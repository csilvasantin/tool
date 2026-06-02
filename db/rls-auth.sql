-- ============================================================================
-- Yokup — RLS con autenticación (sustituye al modo demo abierto).
-- anon: SOLO lectura (la web pública muestra el panel/tablón).
-- authenticated: lectura + escritura (crear/actualizar requiere sesión).
-- Ejecutar después de schema-demo.sql. Reemplaza las políticas "demo_all".
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['interventions','technicians','ratings','stores'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "demo_all" on public.%I;', t);
    execute format('drop policy if exists "read_all" on public.%I;', t);
    execute format('drop policy if exists "write_auth" on public.%I;', t);
    -- Lectura para todos (anon + autenticado)
    execute format($f$
      create policy "read_all" on public.%I for select to anon, authenticated using (true);
    $f$, t);
    -- Escritura (insert/update/delete) solo para autenticados
    execute format($f$
      create policy "write_auth" on public.%I for all to authenticated using (true) with check (true);
    $f$, t);
  end loop;
end $$;

-- Privilegios: anon solo SELECT; authenticated todo.
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
