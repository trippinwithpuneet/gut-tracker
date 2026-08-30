-- Schedules the daily reminder job. Run ONCE, by hand, in the Supabase SQL editor.
--
-- This is deliberately not a migration. `npm run db:check` replays every migration
-- into an in-process PGlite database, which has neither pg_cron nor pg_net, so a
-- migration containing them would fail CI on every push. Scheduling is also a
-- property of one deployment rather than of the schema: a self-hoster who does not
-- want reminders should not be forced to install cron to apply the app's tables.
--
-- Runs hourly rather than daily because reminder times are per-user and per-timezone
-- — 21:00 is a different instant in Mumbai and in Lisbon. The function decides who is
-- actually due; this just wakes it up.
--
-- Before running, replace:
--   <PROJECT_REF>  your project ref, from the project URL
-- and store the service-role key in Vault rather than pasting it here (below).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Keep the service-role key out of the job definition: anything written into
-- cron.job is readable by anyone who can read that table.
-- Run this once, then reference it by name:
--
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'reminder_service_key');

select cron.schedule(
  'send-daily-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'reminder_service_key'
      )
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Useful afterwards:
--   select * from cron.job;                                  -- is it scheduled?
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select cron.unschedule('send-daily-reminders');          -- turn it off
