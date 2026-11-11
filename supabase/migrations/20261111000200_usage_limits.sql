-- Daily usage per account, so one account cannot run up the paid AI and transcription bills.
-- Counted atomically in the database. No policies on the table: it is only reachable through bump_usage().
create table if not exists usage_counter (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null,
  n int not null default 0,
  primary key (user_id, day, kind)
);
alter table usage_counter enable row level security;

-- Adds one use for the signed-in account today (Lagos time). Returns true while the account is within its cap.
create or replace function bump_usage(p_kind text, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then return false; end if;
  insert into usage_counter (user_id, day, kind, n)
  values (auth.uid(), (now() at time zone 'Africa/Lagos')::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set n = usage_counter.n + 1
  returning n into v;
  return v <= p_max;
end $$;

revoke all on function bump_usage(text, int) from public, anon;
grant execute on function bump_usage(text, int) to authenticated;
