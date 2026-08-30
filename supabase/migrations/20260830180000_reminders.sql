-- Daily logging reminders.
--
-- A diary dies from forgetting, not from bad analysis, and a skipped day is dropped
-- as missing data rather than counted as good — so forgetting does not weaken a
-- verdict, it postpones one. This is the machinery that sends one notification a day.
--
-- Reminders are a signed-in-only feature. Push needs a server to send it, and there
-- is no server in local mode; the UI says so plainly rather than offering a switch
-- that cannot work.

-- ------------------------------------------------------------ subscriptions

-- One row per browser/device, not per user: a push subscription is issued by the
-- browser's push service and is meaningless anywhere else, so enabling reminders on
-- a phone does not enable them on a laptop.
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  -- The push service's URL for this device. Unique because re-subscribing the same
  -- browser should replace its row, not accumulate duplicates that all deliver.
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count   int not null default 0
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------- preferences

alter table public.profiles
  add column reminder_enabled      boolean not null default false,
  -- Hour of the day in the user's own timezone, which profiles.timezone already holds.
  add column reminder_hour         smallint check (reminder_hour between 0 and 23),
  -- Idempotence, not intelligence: stops a cron retry or a DST shift from sending
  -- the same day's reminder twice. Stored as the user's local date.
  add column reminder_last_sent_on date;

-- ------------------------------------------------------------------------ RLS

alter table public.push_subscriptions enable row level security;

create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
