-- partnerships: jumelage de couple, partage automatique de toutes les listes
create table partnerships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references auth.users not null,
  user_b uuid references auth.users not null,
  created_at timestamptz default now(),
  unique (user_a, user_b)
);

create index idx_partnerships_user_a on partnerships(user_a);
create index idx_partnerships_user_b on partnerships(user_b);

-- partner_invites: flow d'invitation pour établir un jumelage (comme invites, sans list_id)
create table partner_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid references auth.users not null,
  to_email text not null,
  status text default 'pending' not null check (status in ('pending','accepted','declined')),
  created_at timestamptz default now()
);

create index idx_partner_invites_to_email on partner_invites(to_email);
create index idx_partner_invites_from_user on partner_invites(from_user);

alter table partnerships enable row level security;
alter table partner_invites enable row level security;

-- Renvoie le partenaire actif d'un user, s'il existe
create or replace function get_partner(p_user_id uuid)
returns uuid as $$
  select case
    when user_a = p_user_id then user_b
    when user_b = p_user_id then user_a
  end
  from partnerships
  where user_a = p_user_id or user_b = p_user_id
  limit 1;
$$ language sql security definer stable;

create policy partnerships_select on partnerships for select
  using (user_a = auth.uid() or user_b = auth.uid());

create policy partner_invites_select on partner_invites for select
  using (
    from_user = auth.uid()
    or lower(to_email) = lower((select email from auth.users where id = auth.uid()))
  );

create policy partner_invites_insert on partner_invites for insert
  with check (from_user = auth.uid());

create policy partner_invites_update on partner_invites for update
  using (from_user = auth.uid())
  with check (from_user = auth.uid());

-- RPC: envoyer une invitation de jumelage
create or replace function send_partner_invite(to_email text)
returns uuid as $$
declare
  new_id uuid;
begin
  if get_partner(auth.uid()) is not null then
    raise exception 'vous avez déjà un partenaire';
  end if;

  insert into partner_invites (from_user, to_email)
  values (auth.uid(), lower(to_email))
  returning id into new_id;

  return new_id;
end;
$$ language plpgsql security definer;

-- RPC: accepter -> crée le jumelage + rejoint rétroactivement toutes les listes existantes de l'autre
create or replace function accept_partner_invite(invite_id uuid)
returns void as $$
declare
  inv partner_invites%rowtype;
  me_email text;
  me uuid := auth.uid();
begin
  select * into inv from partner_invites where id = invite_id;
  if inv is null then
    raise exception 'invite not found';
  end if;

  select email into me_email from auth.users where id = me;
  if me_email is null or lower(me_email) != lower(inv.to_email) then
    raise exception 'not authorized to accept this invite';
  end if;

  if inv.status != 'pending' then
    raise exception 'invite is not pending';
  end if;

  if get_partner(me) is not null or get_partner(inv.from_user) is not null then
    raise exception 'un des deux a déjà un partenaire';
  end if;

  insert into partnerships (user_a, user_b) values (inv.from_user, me);

  insert into list_members (list_id, user_id, role)
  select l.id, me, 'editor' from lists l where l.owner_id = inv.from_user
  on conflict (list_id, user_id) do nothing;

  insert into list_members (list_id, user_id, role)
  select l.id, inv.from_user, 'editor' from lists l where l.owner_id = me
  on conflict (list_id, user_id) do nothing;

  update partner_invites set status = 'accepted' where id = invite_id;
end;
$$ language plpgsql security definer;

-- RPC: refuser
create or replace function decline_partner_invite(invite_id uuid)
returns void as $$
declare
  inv partner_invites%rowtype;
  me_email text;
begin
  select * into inv from partner_invites where id = invite_id;
  if inv is null then
    raise exception 'invite not found';
  end if;

  select email into me_email from auth.users where id = auth.uid();
  if me_email is null or lower(me_email) != lower(inv.to_email) then
    raise exception 'not authorized to decline this invite';
  end if;

  update partner_invites set status = 'declined' where id = invite_id;
end;
$$ language plpgsql security definer;

-- Étend le trigger existant (migration 0001) : le partenaire actif rejoint
-- automatiquement toute nouvelle liste créée par l'un des deux.
create or replace function add_owner_as_member()
returns trigger as $$
declare
  partner_id uuid;
begin
  insert into list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'editor')
  on conflict (list_id, user_id) do nothing;

  partner_id := get_partner(new.owner_id);
  if partner_id is not null then
    insert into list_members (list_id, user_id, role)
    values (new.id, partner_id, 'editor')
    on conflict (list_id, user_id) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer;
