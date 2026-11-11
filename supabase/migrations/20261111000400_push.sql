-- Phones that agreed to hear from Spal. One row per phone.
create table if not exists push_subscription (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table push_subscription enable row level security;
create policy push_subscription_owner on push_subscription for all
  using (shop_id in (select id from shop where owner_id = auth.uid()))
  with check (shop_id in (select id from shop where owner_id = auth.uid()));

-- One reminder of each kind per shop per day, so nobody is nagged. Written only by the server.
create table if not exists nudge_log (
  shop_id uuid not null references shop(id) on delete cascade,
  kind text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (shop_id, kind, day)
);
alter table nudge_log enable row level security;
