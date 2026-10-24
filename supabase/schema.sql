-- Evenly database schema
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Also enable: Authentication → Sign In / Providers → "Allow anonymous sign-ins".

create extension if not exists pgcrypto;

-- ───────────── Tables ─────────────

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  emoji       text not null default '💸',
  currency    text not null default 'GBP',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  pay_link    text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists members_group_idx on public.members(group_id);

-- One row per phone/browser that opened a group link.
-- member_id = "who am I" in this group on that device.
create table if not exists public.group_devices (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  member_id   uuid references public.members(id) on delete set null,
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Expenses and settle-up payments live in one table.
-- paid_by / split are JSON maps { member_id: amount } in the transaction currency.
-- fx_rate converts the transaction currency into the group currency.
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  kind        text not null default 'expense' check (kind in ('expense', 'payment')),
  description text not null default '',
  category    text not null default 'other',
  amount      numeric(14,2) not null check (amount >= 0),
  currency    text not null,
  fx_rate     numeric(20,10) not null default 1 check (fx_rate > 0),
  date        date not null default current_date,
  paid_by     jsonb not null,
  split       jsonb not null,
  split_meta  jsonb not null default '{}'::jsonb,
  notes       text not null default '',
  created_by  uuid references public.members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists transactions_group_idx on public.transactions(group_id, date);

create table if not exists public.activity (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups(id) on delete cascade,
  member_id   uuid references public.members(id) on delete set null,
  action      text not null,
  summary     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists activity_group_idx on public.activity(group_id, created_at desc);

-- ───────────── Access rules ─────────────
-- A device can see a group only after opening its link (join_group).

create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_devices where group_id = gid and user_id = auth.uid());
$$;

alter table public.groups        enable row level security;
alter table public.members       enable row level security;
alter table public.group_devices enable row level security;
alter table public.transactions  enable row level security;
alter table public.activity      enable row level security;

create policy "groups_select" on public.groups for select using (public.is_group_member(id));
create policy "groups_update" on public.groups for update
  using (public.is_group_member(id)) with check (public.is_group_member(id));

create policy "members_select" on public.members for select using (public.is_group_member(group_id));
create policy "members_insert" on public.members for insert with check (public.is_group_member(group_id));
create policy "members_update" on public.members for update
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

create policy "devices_select_own" on public.group_devices for select using (user_id = auth.uid());
create policy "devices_update_own" on public.group_devices for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and (
      member_id is null or exists (
        select 1 from public.members m where m.id = member_id and m.group_id = group_devices.group_id
      )
    )
  );
create policy "devices_delete_own" on public.group_devices for delete using (user_id = auth.uid());

create policy "tx_select" on public.transactions for select using (public.is_group_member(group_id));
create policy "tx_insert" on public.transactions for insert with check (public.is_group_member(group_id));
create policy "tx_update" on public.transactions for update
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "tx_delete" on public.transactions for delete using (public.is_group_member(group_id));

create policy "activity_select" on public.activity for select using (public.is_group_member(group_id));
create policy "activity_insert" on public.activity for insert with check (public.is_group_member(group_id));

-- ───────────── Functions the app calls ─────────────

create or replace function public.create_group(
  p_name text, p_emoji text, p_currency text, p_members text[], p_me int
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid; mid uuid; me_id uuid; i int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into groups (name, emoji, currency, created_by)
    values (p_name, coalesce(nullif(p_emoji, ''), '💸'), p_currency, auth.uid())
    returning id into gid;
  for i in 1 .. coalesce(array_length(p_members, 1), 0) loop
    insert into members (group_id, name) values (gid, p_members[i]) returning id into mid;
    if i = p_me then me_id := mid; end if;
  end loop;
  insert into group_devices (group_id, user_id, member_id) values (gid, auth.uid(), me_id);
  insert into activity (group_id, member_id, action, summary) values (gid, me_id, 'created', 'created the group');
  return gid;
end $$;

create or replace function public.join_group(gid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from groups where id = gid) then return false; end if;
  insert into group_devices (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return true;
end $$;

-- ───────────── Live updates ─────────────
alter publication supabase_realtime add table public.transactions, public.members, public.activity;
