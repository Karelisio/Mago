-- Cas vécu en prod : les deux membres d'un couple s'envoient une invitation
-- en même temps (chacun croit être le seul à devoir agir), sans email pour
-- les prévenir de l'invitation reçue — les deux restent bloqués en pending
-- indéfiniment, chacun attendant que l'autre accepte la sienne.
--
-- Si la personne qu'on invite nous a déjà envoyé une invitation en attente,
-- send_partner_invite accepte directement la sienne (accept_partner_invite,
-- security definer existant, inchangé) plutôt que de créer un doublon. Le
-- paramètre to_email n'est pas renommé : PostgREST route les appels RPC par
-- nom de paramètre (supabase.rpc('send_partner_invite', { to_email })), un
-- renommage casserait l'appel côté client. La colonne partner_invites.to_email
-- est donc systématiquement qualifiée (pi.to_email) pour éviter l'ambiguïté
-- avec le paramètre de même nom (plpgsql.variable_conflict = error par défaut).
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

-- Trouvé en relisant les advisors après ce changement (réflexe imposé par
-- CLAUDE.md) : la migration 0004 n'avait revoke ces RPC que pour anon/
-- authenticated, pas pour public — insuffisant, PUBLIC accorde EXECUTE par
-- défaut sur toute nouvelle fonction, donc anon pouvait toujours les
-- appeler via PostgREST (inoffensif ici : ces fonctions vérifient
-- auth.uid() en interne et échouent proprement pour anon, mais autant
-- fermer l'accès proprement plutôt que de compter dessus).
revoke execute on function public.accept_invite(uuid) from public;
revoke execute on function public.decline_invite(uuid) from public;
revoke execute on function public.accept_partner_invite(uuid) from public;
revoke execute on function public.decline_partner_invite(uuid) from public;
revoke execute on function public.send_partner_invite(text) from public;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.decline_invite(uuid) to authenticated;
grant execute on function public.accept_partner_invite(uuid) to authenticated;
grant execute on function public.decline_partner_invite(uuid) to authenticated;
grant execute on function public.send_partner_invite(text) to authenticated;
