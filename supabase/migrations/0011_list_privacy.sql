-- Liste privée à la création : jusqu'ici add_owner_as_member() ajoutait
-- systématiquement le partenaire comme membre de TOUTE nouvelle liste dès
-- que le jumelage existait (0003_partnerships.sql), rendant le partage
-- "tout ou rien". is_private permet de créer une liste que seul son
-- créateur·rice voit (RLS lists_select repose sur list_members, donc il
-- suffit de ne pas y ajouter le partenaire).
alter table lists add column is_private boolean not null default false;

create or replace function add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  partner_id uuid;
begin
  insert into list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'editor')
  on conflict (list_id, user_id) do nothing;

  if not new.is_private then
    partner_id := get_partner(new.owner_id);
    if partner_id is not null then
      insert into list_members (list_id, user_id, role)
      values (new.id, partner_id, 'editor')
      on conflict (list_id, user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- Même piège que 0010 : 0004 n'avait revoke add_owner_as_member() que pour
-- anon/authenticated, pas pour public (qui accorde EXECUTE par défaut).
-- Fonction trigger-only ("jamais appelé en RPC", voir 0004) : aucun rôle
-- n'a besoin de l'exécuter directement.
revoke execute on function public.add_owner_as_member() from public;
