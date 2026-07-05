-- ============================================================================
-- Yokup — esquema DEMO para acceso directo navegador → Supabase (sin worker).
--
-- Calca 1:1 las formas de datos que produce el frontend (web/data.js):
--   · IDs de texto ('iv-1001', 'tech-123', 'store-123') en vez de UUID.
--   · Intervención "plana" (store_name, region, surface, surface_type) en vez de FKs.
-- Esto permite que la web estática inserte/lea con supabase-js + anon key sin capa
-- intermedia. El esquema normalizado "de producción" sigue en schema.sql (para cuando
-- haya worker/auth real). Aplicar este archivo + rls-demo.sql.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists interventions (
  id            text primary key,
  store_id      text,
  store_name    text,
  region        text,
  surface       text,
  surface_type  text,
  type          text not null default 'incidencia',
  origin        text not null default 'manual',
  status        text not null default 'nueva',
  priority      text not null default 'media',
  title         text not null,
  description   text,
  technician_id text,
  source_event  text,
  created_at    timestamptz not null default now()
);

create table if not exists technicians (
  id          text primary key,
  name        text not null,
  kind        text,                 -- 'freelance' | 'empresa'
  contact     text,
  zones       text[] default '{}',
  skills      text[] default '{}',
  status      text not null default 'pendiente',
  rating_avg  numeric(3,2) default 0,
  rating_n    integer default 0,
  created_at  timestamptz not null default now()
);

create table if not exists ratings (
  id              text primary key,
  intervention_id text,
  technician_id   text,
  store_id        text,
  stars           smallint check (stars between 1 and 5),
  comment         text,
  created_at      timestamptz not null default now()
);

-- Puntos de venta dados de alta manualmente desde la web (los del catálogo Admira
-- siguen viniendo de omnipublicity-api, no se guardan aquí).
create table if not exists stores (
  id          text primary key,
  name        text not null,
  kind        text,
  addr        text,
  region      text,
  contact     text,
  equipment   text[] default '{}',
  from_admira boolean default false,
  created_at  timestamptz not null default now()
);

-- Buzón de webhooks (ingesta Admira, F1). Idempotencia por (source, event_id).
-- Lo escribe SOLO el worker yokup-api con service_role (salta RLS); no lo toca el navegador.
create table if not exists webhook_inbox (
  id           uuid primary key default gen_random_uuid(),
  source       text not null default 'admira',
  event_id     text,                             -- id externo para dedupe
  signature_ok boolean not null default false,
  payload_raw  jsonb not null,
  processed    boolean not null default false,
  error        text,
  received_at  timestamptz not null default now()
);
create unique index if not exists uq_inbox_event on webhook_inbox(source, event_id) where event_id is not null;
-- RLS activado SIN política: el rol anónimo queda denegado (deny-by-default); solo
-- el service_role del worker puede leer/escribir (bypassea RLS). No exponer payloads crudos.
alter table public.webhook_inbox enable row level security;

-- ---- RLS modo demo (acceso anónimo) — ver advertencia en rls-demo.sql ----
do $$
declare t text;
begin
  foreach t in array array['interventions','technicians','ratings','stores'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists "demo_all" on public.%I;
      create policy "demo_all" on public.%I for all to anon, authenticated
        using (true) with check (true);
    $f$, t, t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
