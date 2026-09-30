-- Durcissement des droits trouvé lors d'une revue de code complète.

-- 1. Jumelage : accept_partner_invite ajoutait le partenaire à TOUTES les
-- listes existantes de l'autre, y compris celles créées privées (0011) —
-- une liste privée devenait partagée rétroactivement au jumelage. Même
-- règle que add_owner_as_member() : on saute les listes privées. Refuse
-- aussi le jumelage avec soi-même (faute de frappe sur son propre email
-- suivie d'« Accepter » : partenariat impossible à défaire).
create or replace function public.accept_partner_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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

  if inv.from_user = me then
    raise exception 'impossible de se jumeler avec soi-même';
  end if;

  if get_partner(me) is not null or get_partner(inv.from_user) is not null then
    raise exception 'un des deux a déjà un partenaire';
  end if;

  insert into partnerships (user_a, user_b) values (inv.from_user, me);

  insert into list_members (list_id, user_id, role)
  select l.id, me, 'editor' from lists l where l.owner_id = inv.from_user and not l.is_private
  on conflict (list_id, user_id) do nothing;

  insert into list_members (list_id, user_id, role)
  select l.id, inv.from_user, 'editor' from lists l where l.owner_id = me and not l.is_private
  on conflict (list_id, user_id) do nothing;

  update partner_invites set status = 'accepted' where id = invite_id;
end;
$$;

-- Même corps que 0010, plus le refus explicite de s'inviter soi-même.
create or replace function public.send_partner_invite(to_email text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_id uuid;
  my_email text;
  existing_incoming partner_invites%rowtype;
begin
  if get_partner(auth.uid()) is not null then
    raise exception 'vous avez déjà un partenaire';
  end if;

  select email into my_email from auth.users where id = auth.uid();

  if lower(trim(to_email)) = lower(my_email) then
    raise exception 'impossible de s''inviter soi-même';
  end if;

  select pi.* into existing_incoming
    from partner_invites pi
    where pi.status = 'pending' and lower(pi.to_email) = lower(my_email)
    order by pi.created_at desc
    limit 1;

  if existing_incoming.id is not null and exists (
    select 1 from auth.users u
    where u.id = existing_incoming.from_user and lower(u.email) = lower(to_email)
  ) then
    perform accept_partner_invite(existing_incoming.id);
    return existing_incoming.id;
  end if;

  insert into partner_invites (from_user, to_email)
  values (auth.uid(), lower(to_email))
  returning id into new_id;

  return new_id;
end;
$$;

alter table partnerships
  add constraint partnerships_distinct_users check (user_a <> user_b);

-- 2. invites : la policy UPDATE ne revérifiait ni list_id ni to_email. Un
-- compte pouvait créer une invitation vers son propre email sur SA liste,
-- la réécrire vers l'id d'une autre liste, puis l'accepter via
-- accept_invite() (security definer) et devenir membre de cette liste.
-- list_id, to_email et from_user deviennent non modifiables depuis l'API
-- (seul le statut peut changer), et le WITH CHECK revérifie l'appartenance.
drop policy if exists invites_update on invites;
create policy invites_update on invites for update
  using (from_user = auth.uid())
  with check (from_user = auth.uid() and is_list_member(list_id, auth.uid()));

create or replace function public.invites_protect_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.list_id is distinct from old.list_id
    or new.to_email is distinct from old.to_email
    or new.from_user is distinct from old.from_user
  ) then
    raise exception 'modification non autorisée';
  end if;
  return new;
end;
$$;

create trigger trg_invites_protect_columns
  before update on invites
  for each row execute function public.invites_protect_columns();

-- 3. lists : n'importe quel membre (partenaire ou invité ponctuel) pouvait
-- réécrire owner_id à son nom puis supprimer la liste. Les écritures de la
-- file de sync renvoient la ligne complète avec le même owner_id : seule
-- une vraie modification est refusée.
create or replace function public.lists_protect_owner()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user in ('authenticated', 'anon') and new.owner_id is distinct from old.owner_id then
    raise exception 'modification non autorisée';
  end if;
  return new;
end;
$$;

create trigger trg_lists_protect_owner
  before update on lists
  for each row execute function public.lists_protect_owner();

-- Fonctions trigger-only : revoke from public (voir CLAUDE.md) ET from
-- anon/authenticated, que les privilèges par défaut de Supabase ajoutent
-- explicitement sur toute nouvelle fonction.
revoke execute on function public.invites_protect_columns() from public, anon, authenticated;
revoke execute on function public.lists_protect_owner() from public, anon, authenticated;
