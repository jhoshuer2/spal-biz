-- Spal initial schema. Money is integer kobo. Every row belongs to a shop; a shop belongs to one auth user
-- (anonymous sign-in first, upgraded in place to a real account later, so auth.uid() never changes).

create extension if not exists pgcrypto;

create table shop (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  owner_name text,
  name text,
  sells text,
  language text not null default 'en',
  currency text not null default 'NGN',
  usual_close_time time,
  trust_level int not null default 0,
  created_at timestamptz not null default now()
);

create table customer (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  phone text,
  may_message boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table item (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  typical_price_kobo bigint,
  stock_hint text,
  created_at timestamptz not null default now()
);

-- Raw input. Never deleted, so it can be re-parsed as the parser improves.
create table capture (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  kind text not null check (kind in ('text','voice','photo')),
  text_content text,
  transcript text,
  media_path text,
  status text not null default 'new' check (status in ('new','parsed','needs_answer','failed')),
  created_at timestamptz not null default now()
);

-- Append-only ledger. A correction is a new row with `supersedes` set.
create table event (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  capture_id uuid references capture(id) on delete set null,
  kind text not null check (kind in ('sale','expense','credit_sale','payment_received','stock_note','day_total')),
  amount_kobo bigint,
  occurred_at timestamptz not null default now(),
  customer_id uuid references customer(id) on delete set null,
  item_id uuid references item(id) on delete set null,
  quantity numeric,
  due_date date,
  note text,
  confidence numeric check (confidence between 0 and 1),
  supersedes uuid references event(id),
  created_at timestamptz not null default now()
);
create index event_shop_time on event (shop_id, occurred_at desc);
create index event_customer on event (customer_id) where customer_id is not null;

create table day_close (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  day date not null,
  summary text,
  total_kobo bigint,
  closed_at timestamptz not null default now(),
  unique (shop_id, day)
);

-- Anything Spal wants to do. Nothing is sent without status = 'approved'.
create table proposal (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  kind text not null,
  customer_id uuid references customer(id) on delete set null,
  draft_text text,
  status text not null default 'pending' check (status in ('pending','approved','edited','declined','sent')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table memory (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  fact text not null,
  created_at timestamptz not null default now()
);

create table brief (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shop(id) on delete cascade,
  body text not null,
  topic text,
  shown_at timestamptz not null default now()
);

-- Open debts, derived from the ledger: credit sales minus payments, per customer.
create view debt with (security_invoker = true) as
select shop_id, customer_id,
       sum(case when kind = 'credit_sale' then amount_kobo
                when kind = 'payment_received' then -amount_kobo else 0 end) as owed_kobo,
       min(due_date) filter (where kind = 'credit_sale') as next_due
from event
where customer_id is not null
  and not exists (select 1 from event e2 where e2.supersedes = event.id)
group by shop_id, customer_id
having sum(case when kind = 'credit_sale' then amount_kobo
                when kind = 'payment_received' then -amount_kobo else 0 end) > 0;

-- Row-level security: a user touches only their own shop's rows.
alter table shop enable row level security;
create policy shop_owner on shop for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['customer','item','capture','event','day_close','proposal','memory','brief'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for all
      using (shop_id in (select id from shop where owner_id = auth.uid()))
      with check (shop_id in (select id from shop where owner_id = auth.uid()))$p$, t || '_owner', t);
  end loop;
end $$;

-- Private bucket for notebook and receipt photos and voice notes, one folder per shop id.
insert into storage.buckets (id, name, public) values ('captures', 'captures', false) on conflict do nothing;
create policy captures_owner on storage.objects for all
  using (bucket_id = 'captures' and (storage.foldername(name))[1] in (select id::text from shop where owner_id = auth.uid()))
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] in (select id::text from shop where owner_id = auth.uid()));
