-- ============================================================================
-- Yokup — esquema v1 (PostgreSQL / Supabase)
-- Plataforma de intervenciones técnicas sobre surfaces de puntos de venta.
-- Ver docs/00-definicion.md
-- ============================================================================

-- Extensiones --------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- Tipos enumerados ---------------------------------------------------------
do $$ begin
  create type surface_type    as enum ('pantalla','escaparate','mostrador','vending','pwa','audio','kiosk','otro');
  create type tech_kind       as enum ('freelance','empresa');
  create type tech_status     as enum ('pendiente','activo','suspendido','baja');
  create type interv_type     as enum ('incidencia','instalacion','desinstalacion','mantenimiento');
  create type interv_origin   as enum ('admira','manual');
  create type interv_status   as enum ('nueva','publicada','aceptada','en_curso','resuelta','valorada','cerrada','cancelada');
  create type interv_priority as enum ('baja','media','alta','critica');
  create type offer_status    as enum ('ofertada','aceptada','rechazada','expirada');
exception when duplicate_object then null; end $$;

-- Stores (espejo/cache de omnipublicity-api) -------------------------------
create table if not exists store (
  id          text primary key,                 -- mismo id que en OMNIP (ej: 'xtanco')
  name        text not null,
  kind        text,                              -- 'Estanco · Retail físico', etc.
  addr        text,
  region      text,                              -- para el marketplace por zona
  lng         double precision,
  lat         double precision,
  synced_at   timestamptz not null default now()
);

-- Surfaces = "equipos" -----------------------------------------------------
create table if not exists surface (
  id            uuid primary key default gen_random_uuid(),
  store_id      text not null references store(id) on delete cascade,
  name          text not null,                   -- 'LED Frontal'
  type          surface_type not null default 'otro',
  pixer_screens text[] default '{}',             -- enlaces a pixer (opcional)
  ext_ref       text,                            -- ref estable origen (store_id+name)
  created_at    timestamptz not null default now(),
  unique (store_id, name)
);

-- Técnicos -----------------------------------------------------------------
create table if not exists technician (
  id          uuid primary key default gen_random_uuid(),
  kind        tech_kind not null,
  name        text not null,
  email       text unique,
  phone       text,
  zones       text[] default '{}',               -- regiones que cubre
  skills      surface_type[] default '{}',       -- tipos de surface que atiende
  rating_avg  numeric(3,2) default 0,
  rating_n    integer default 0,
  status      tech_status not null default 'pendiente',
  created_at  timestamptz not null default now()
);

-- Intervenciones -----------------------------------------------------------
create table if not exists intervention (
  id            uuid primary key default gen_random_uuid(),
  store_id      text not null references store(id),
  surface_id    uuid references surface(id),
  type          interv_type not null,
  origin        interv_origin not null default 'manual',
  status        interv_status not null default 'nueva',
  priority      interv_priority not null default 'media',
  title         text not null,
  description   text,
  source_event  text,                            -- id del evento Admira (idempotencia)
  technician_id uuid references technician(id),   -- asignado tras aceptar oferta
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  closed_at     timestamptz
);
create index if not exists idx_interv_status on intervention(status);
create index if not exists idx_interv_store  on intervention(store_id);
create unique index if not exists uq_interv_source on intervention(source_event) where source_event is not null;

-- Timeline / auditoría -----------------------------------------------------
create table if not exists intervention_event (
  id              uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references intervention(id) on delete cascade,
  type            text not null,                 -- 'creada','publicada','oferta_aceptada',...
  actor           text,                          -- 'admira' | tech:<id> | store:<id> | op:<id>
  payload         jsonb,
  ts              timestamptz not null default now()
);
create index if not exists idx_event_interv on intervention_event(intervention_id, ts);

-- Marketplace: ofertas a técnicos -----------------------------------------
create table if not exists offer (
  id              uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references intervention(id) on delete cascade,
  technician_id   uuid not null references technician(id) on delete cascade,
  status          offer_status not null default 'ofertada',
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  unique (intervention_id, technician_id)
);

-- Valoraciones (el centro valora al técnico) -------------------------------
create table if not exists rating (
  id              uuid primary key default gen_random_uuid(),
  intervention_id uuid not null unique references intervention(id) on delete cascade,
  technician_id   uuid not null references technician(id),
  store_id        text not null references store(id),
  stars           smallint not null check (stars between 1 and 5),
  comment         text,
  created_at      timestamptz not null default now()
);

-- Ingesta de webhooks de Admira (idempotente) ------------------------------
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
