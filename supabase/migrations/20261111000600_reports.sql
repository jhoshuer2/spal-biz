-- Errors and feedback from the app, so problems can be seen without anyone copying logs.
-- Owners can only add rows. Nobody but the project owner (dashboard or the admin page) can read them.
create table if not exists app_report (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  shop_id uuid references shop(id) on delete set null,
  kind text not null check (kind in ('error','feedback')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists app_report_recent on app_report (created_at desc);
alter table app_report enable row level security;
create policy app_report_insert on app_report for insert to authenticated with check (user_id = auth.uid());
