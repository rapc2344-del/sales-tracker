-- Database schema (Supabase Postgres)
-- Run this in the Supabase SQL Editor:

create table if not exists models (
  id bigserial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into models (name) values ('Nadya')
on conflict (name) do nothing;

create table if not exists sales (
  id bigserial primary key,
  name text not null,
  username text,
  amount numeric not null,
  sale_type text,
  model text,
  tier text not null default 'none' check (tier in ('free', 'vip', 'none')),
  date timestamptz not null default now(),
  raw_text text,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_sales_model on sales(model);
create index if not exists idx_sales_tier on sales(tier);
create index if not exists idx_sales_date on sales(date desc);

-- Saved summaries (created when exporting / saving data)
create table if not exists saved_summaries (
  id bigserial primary key,
  export_filename text not null,
  total_revenue numeric not null default 0,
  none_subtotal numeric not null default 0,
  vip_subtotal numeric not null default 0,
  free_subtotal numeric not null default 0,
  sales_count integer not null default 0,
  by_model jsonb default '[]'::jsonb,
  by_sale_type jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_summaries_created on saved_summaries(created_at desc);
