-- Runs the reminders check every 10 minutes from inside Supabase. Free, and no GitHub or other service involved.
-- Run this once in the Supabase SQL Editor. BEFORE running it, replace PASTE_YOUR_CRON_SECRET with the same value
-- you set as CRON_SECRET in Vercel. Do not share that value in chat or commit it.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- The secret goes in Supabase's encrypted Vault, so it is not written into the job itself.
select vault.create_secret('PASTE_YOUR_CRON_SECRET', 'spal_cron_secret');

select cron.schedule(
  'spal-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://spal-biz.vercel.app/api/cron/nudges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'spal_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- To check it works (run these separately, a minute or two after the job has run):
--   select status_code, content, created from net._http_response order by created desc limit 5;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- To stop it:   select cron.unschedule('spal-reminders');
