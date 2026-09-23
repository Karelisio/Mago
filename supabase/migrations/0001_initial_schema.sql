-- Extensions
create extension if not exists "pgcrypto";

-- lists
create table lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'courses' check (type in ('courses','diy','cadeaux','autre')),
  owner_id uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- list_members : les deux users ont les mêmes droits d'édition
create table list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references lists on delete cascade not null,
  user_id uuid references auth.users not null,
  role text default 'editor' not null,
  joined_at timestamptz default now(),
  unique(list_id, user_id)
);

-- items
create table items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references lists on delete cascade not null,
  name text not null,
  qty numeric,
  unit text,
  category text,
  completed boolean default false not null,
  is_relevant boolean default true not null,
  added_by uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- invites
create table invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid references auth.users not null,
  to_email text not null,
  list_id uuid references lists on delete cascade not null,
  status text default 'pending' not null check (status in ('pending','accepted','declined')),
  created_at timestamptz default now()
);

create index idx_list_members_list_id on list_members(list_id);
create index idx_list_members_user_id on list_members(user_id);
create index idx_items_list_id on items(list_id);
create index idx_invites_to_email on invites(to_email);
create index idx_invites_from_user on invites(from_user);

-- updated_at triggers
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_lists_updated_at before update on lists
  for each row execute function set_updated_at();

create trigger trg_items_updated_at before update on items
  for each row execute function set_updated_at();

-- owner automatically becomes a member
create or replace function add_owner_as_member()
returns trigger as $$
begin
  insert into list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'editor')
  on conflict (list_id, user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_lists_add_owner after insert on lists
  for each row execute function add_owner_as_member();

-- RPC: accept invite
create or replace function accept_invite(invite_id uuid)
returns void as $$
declare
  inv invites%rowtype;
  me_email text;
begin
  select * into inv from invites where id = invite_id;
  if inv is null then
    raise exception 'invite not found';
  end if;

  select email into me_email from auth.users where id = auth.uid();
  if me_email is null or lower(me_email) != lower(inv.to_email) then
    raise exception 'not authorized to accept this invite';
  end if;

  if inv.status != 'pending' then
    raise exception 'invite is not pending';
  end if;

  insert into list_members (list_id, user_id, role)
  values (inv.list_id, auth.uid(), 'editor')
  on conflict (list_id, user_id) do nothing;

  update invites set status = 'accepted' where id = invite_id;
end;
$$ language plpgsql security definer;

-- RPC: decline invite
create or replace function decline_invite(invite_id uuid)
returns void as $$
declare
  inv invites%rowtype;
  me_email text;
begin
  select * into inv from invites where id = invite_id;
  if inv is null then
    raise exception 'invite not found';
  end if;

  select email into me_email from auth.users where id = auth.uid();
  if me_email is null or lower(me_email) != lower(inv.to_email) then
    raise exception 'not authorized to decline this invite';
  end if;

  update invites set status = 'declined' where id = invite_id;
end;
$$ language plpgsql security definer;
