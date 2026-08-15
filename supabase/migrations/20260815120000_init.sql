-- Gut Tracker core schema.
--
-- Two shapes of table live here:
--   * Libraries (symptom_types, food_tags) hold curated rows with user_id IS NULL that
--     everyone can read, alongside per-user custom rows.
--   * Everything else is strictly user-owned and gated by user_id = auth.uid().
--
-- meal_tags carries a denormalised user_id so its RLS policy stays a plain column
-- comparison instead of a subquery on every read.

-- gen_random_uuid() is Postgres core from 13 onward, so no extension is needed.

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text,
  timezone      text        not null default 'UTC',
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- libraries

create table public.symptom_types (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users on delete cascade,
  slug         text not null,
  name         text not null,
  description  text,
  category     text not null default 'other'
               check (category in ('gas','stool','pain','systemic','skin','other')),
  scale        text not null default 'severity'
               check (scale in ('severity','binary')),
  is_red_flag  boolean not null default false,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now()
);

create unique index symptom_types_global_slug_key
  on public.symptom_types (slug) where user_id is null;
create unique index symptom_types_user_slug_key
  on public.symptom_types (user_id, slug) where user_id is not null;

create table public.food_tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  category    text not null default 'other',
  aliases     text[] not null default '{}',
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);

create unique index food_tags_global_slug_key
  on public.food_tags (slug) where user_id is null;
create unique index food_tags_user_slug_key
  on public.food_tags (user_id, slug) where user_id is not null;

-- What each user has chosen to track. Drives onboarding and the quick-pick chips.

create table public.tracked_symptoms (
  user_id         uuid not null references auth.users on delete cascade,
  symptom_type_id uuid not null references public.symptom_types on delete cascade,
  sort_order      int not null default 100,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  primary key (user_id, symptom_type_id)
);

create table public.tracked_tags (
  user_id    uuid not null references auth.users on delete cascade,
  tag_id     uuid not null references public.food_tags on delete cascade,
  sort_order int not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);

-- ---------------------------------------------------------------- log data

-- occurred_on is always present; occurred_at is optional. The analysis engine
-- uses timestamps when it has them and falls back to day resolution when it
-- does not, so a user who never sets a time still gets results.

create table public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  occurred_on date not null,
  occurred_at timestamptz,
  slot        text check (slot in ('breakfast','lunch','dinner','snack','drink')),
  description text not null default '',
  is_outside  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index meals_user_day_idx on public.meals (user_id, occurred_on desc);

create table public.meal_tags (
  meal_id uuid not null references public.meals on delete cascade,
  tag_id  uuid not null references public.food_tags on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (meal_id, tag_id)
);

create index meal_tags_user_tag_idx on public.meal_tags (user_id, tag_id);

create table public.symptom_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  symptom_type_id uuid not null references public.symptom_types on delete cascade,
  occurred_on     date not null,
  occurred_at     timestamptz,
  severity        smallint not null check (severity between 0 and 5),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index symptom_logs_user_day_idx on public.symptom_logs (user_id, occurred_on desc);

-- Optional confounders. Off by default; surfaced only if the user turns them on.
create table public.daily_factors (
  user_id         uuid not null references auth.users on delete cascade,
  day             date not null,
  sleep_hours     numeric(3,1) check (sleep_hours >= 0 and sleep_hours <= 24),
  stress          smallint check (stress between 1 and 5),
  exercised       boolean,
  medication      text,
  menstrual_phase text,
  notes           text,
  primary key (user_id, day)
);

-- A deliberate eliminate-then-reintroduce experiment, usually suggested by the
-- engine to break a confound (e.g. eat garlic without onion three times).
create table public.challenges (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  tag_id           uuid not null references public.food_tags on delete cascade,
  exclude_tag_id   uuid references public.food_tags on delete set null,
  symptom_type_id  uuid not null references public.symptom_types on delete cascade,
  status           text not null default 'active'
                   check (status in ('active','completed','abandoned')),
  target_exposures int  not null default 3,
  started_on       date not null default current_date,
  ended_on         date,
  verdict          text check (verdict in ('confirmed','cleared','inconclusive')),
  notes            text,
  created_at       timestamptz not null default now()
);

create index challenges_user_status_idx on public.challenges (user_id, status);

-- ---------------------------------------------------------------- triggers

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meals_touch_updated_at
  before update on public.meals
  for each row execute function public.touch_updated_at();

create trigger symptom_logs_touch_updated_at
  before update on public.symptom_logs
  for each row execute function public.touch_updated_at();

-- Give every new auth user a profile row so the app never has to upsert one.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RLS

alter table public.profiles         enable row level security;
alter table public.symptom_types    enable row level security;
alter table public.food_tags        enable row level security;
alter table public.tracked_symptoms enable row level security;
alter table public.tracked_tags     enable row level security;
alter table public.meals            enable row level security;
alter table public.meal_tags        enable row level security;
alter table public.symptom_logs     enable row level security;
alter table public.daily_factors    enable row level security;
alter table public.challenges       enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Library tables: curated rows are readable by everyone, writable by no one.
create policy "read library and own symptom types" on public.symptom_types
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy "write own symptom types" on public.symptom_types
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own symptom types" on public.symptom_types
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own symptom types" on public.symptom_types
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "read library and own food tags" on public.food_tags
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy "write own food tags" on public.food_tags
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own food tags" on public.food_tags
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own food tags" on public.food_tags
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own tracked symptoms" on public.tracked_symptoms
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tracked tags" on public.tracked_tags
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own meals" on public.meals
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own meal tags" on public.meal_tags
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own symptom logs" on public.symptom_logs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own daily factors" on public.daily_factors
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own challenges" on public.challenges
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
