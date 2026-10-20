-- Run in Supabase SQL Editor. This project intentionally uses only the browser-safe anon key.
create extension if not exists pgcrypto;

create table if not exists public.street_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 18),
  avatar_color text not null default '#e28b68',
  updated_at timestamptz not null default now()
);

create table if not exists public.street_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 18),
  body text not null default '' check (char_length(body) <= 180),
  image_url text,
  spot_id text not null default 'wall' check (spot_id in ('wall')),
  created_at timestamptz not null default now(),
  constraint post_has_content check (char_length(trim(body)) > 0 or image_url is not null)
);

create table if not exists public.street_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','user')),
  target_id uuid not null,
  reason text not null check (char_length(trim(reason)) between 3 and 240),
  status text not null default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create table if not exists public.street_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.street_friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.street_likes (
  post_id uuid not null references public.street_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.street_profiles enable row level security;
alter table public.street_posts enable row level security;
alter table public.street_reports enable row level security;
alter table public.street_blocks enable row level security;
alter table public.street_friendships enable row level security;
alter table public.street_likes enable row level security;

drop policy if exists "profiles readable by signed in players" on public.street_profiles;
create policy "profiles readable by signed in players" on public.street_profiles for select to authenticated using (true);
drop policy if exists "players write own profile" on public.street_profiles;
create policy "players write own profile" on public.street_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "players update own profile" on public.street_profiles;
create policy "players update own profile" on public.street_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "posts visible unless blocked" on public.street_posts;
create policy "posts visible unless blocked" on public.street_posts for select to authenticated using (
  not exists (select 1 from public.street_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = author_id) or (b.blocker_id = author_id and b.blocked_id = auth.uid()))
);
drop policy if exists "players create own posts" on public.street_posts;
create policy "players create own posts" on public.street_posts for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "players delete own posts" on public.street_posts;
create policy "players delete own posts" on public.street_posts for delete to authenticated using (author_id = auth.uid());

drop policy if exists "players report content" on public.street_reports;
create policy "players report content" on public.street_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "players see own reports" on public.street_reports;
create policy "players see own reports" on public.street_reports for select to authenticated using (reporter_id = auth.uid());

drop policy if exists "players see own blocks" on public.street_blocks;
create policy "players see own blocks" on public.street_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "players block others" on public.street_blocks;
create policy "players block others" on public.street_blocks for insert to authenticated with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
drop policy if exists "players unblock others" on public.street_blocks;
create policy "players unblock others" on public.street_blocks for delete to authenticated using (blocker_id = auth.uid());

drop policy if exists "friends visible to participants" on public.street_friendships;
create policy "friends visible to participants" on public.street_friendships for select to authenticated using (user_id = auth.uid() or friend_id = auth.uid());
drop policy if exists "players add friends" on public.street_friendships;
create policy "players add friends" on public.street_friendships for insert to authenticated with check (user_id = auth.uid() and friend_id <> auth.uid());
drop policy if exists "players remove friends" on public.street_friendships;
create policy "players remove friends" on public.street_friendships for delete to authenticated using (user_id = auth.uid() or friend_id = auth.uid());

drop policy if exists "likes visible to signed in players" on public.street_likes;
create policy "likes visible to signed in players" on public.street_likes for select to authenticated using (true);
drop policy if exists "players like as themselves" on public.street_likes;
create policy "players like as themselves" on public.street_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "players remove own likes" on public.street_likes;
create policy "players remove own likes" on public.street_likes for delete to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('street-posts','street-posts',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "signed in players read street photos" on storage.objects;
create policy "signed in players read street photos" on storage.objects for select to authenticated using (bucket_id = 'street-posts');
drop policy if exists "players upload own street photos" on storage.objects;
create policy "players upload own street photos" on storage.objects for insert to authenticated with check (bucket_id = 'street-posts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "players delete own street photos" on storage.objects;
create policy "players delete own street photos" on storage.objects for delete to authenticated using (bucket_id = 'street-posts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Enable Realtime for the wall feed. Presence itself uses the Realtime channel in the client.
do $$ begin
  alter publication supabase_realtime add table public.street_posts;
exception when duplicate_object then null;
end $$;
