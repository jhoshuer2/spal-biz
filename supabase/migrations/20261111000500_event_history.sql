-- Corrections keep a copy of how a record was before, so a fix or a removal can always be undone.
create table if not exists event_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  capture_id uuid references capture(id) on delete cascade,
  event_id uuid not null,
  action text not null check (action in ('update','delete')),
  before jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists event_history_capture on event_history (capture_id);
alter table event_history enable row level security;
create policy event_history_owner on event_history for all
  using (shop_id in (select id from shop where owner_id = auth.uid()))
  with check (shop_id in (select id from shop where owner_id = auth.uid()));
