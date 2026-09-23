-- Durcissement suite aux advisors Supabase après la migration des partnerships :
--
-- 1) search_path mutable sur toutes les fonctions (0011_function_search_path_mutable) :
--    fixe le search_path pour empêcher un search_path malveillant de faire résoudre
--    un nom de table/fonction non qualifié vers un objet différent de celui prévu.
--
-- 2) get_partner et is_list_member sont des fonctions internes (utilisées par les
--    triggers/RPC SECURITY DEFINER et par les policies RLS), pas des endpoints prévus
--    pour être appelés directement en RPC par un client. Un SECURITY DEFINER exécute
--    son corps (et donc ses appels de fonctions imbriquées) avec les droits du
--    propriétaire (postgres), donc retirer l'EXECUTE direct de get_partner ne casse
--    pas add_owner_as_member/send_partner_invite/accept_partner_invite qui l'appellent
--    en interne. is_list_member reste exécutable par `authenticated` car il est évalué
--    directement dans les policies RLS des requêtes normales sur `lists`/`items` — on
--    ferme uniquement l'accès `anon` (jamais utilisé, l'app impose l'auth) et l'appel
--    RPC direct qui permettait sinon à n'importe quel utilisateur connecté d'énumérer
--    le partenaire d'un user_id arbitraire.

alter function public.set_updated_at() set search_path = public;
alter function public.add_owner_as_member() set search_path = public;
alter function public.accept_invite(uuid) set search_path = public;
alter function public.decline_invite(uuid) set search_path = public;
alter function public.is_list_member(uuid, uuid) set search_path = public;
alter function public.get_partner(uuid) set search_path = public;
alter function public.send_partner_invite(text) set search_path = public;
alter function public.accept_partner_invite(uuid) set search_path = public;
alter function public.decline_partner_invite(uuid) set search_path = public;

-- Note : Postgres accorde EXECUTE à PUBLIC par défaut sur toute nouvelle fonction.
-- Retirer le droit à `anon`/`authenticated` individuellement ne suffit pas tant que
-- PUBLIC l'a encore : il faut révoquer PUBLIC puis regranter explicitement ce qui
-- doit rester utilisable. Vérifié sur le projet via has_function_privilege() et un
-- vrai insert/select `lists` sous le rôle `authenticated` : le trigger add_owner_as_member
-- et la policy lists_select fonctionnent toujours normalement après ce durcissement.
revoke execute on function public.get_partner(uuid) from public;
revoke execute on function public.is_list_member(uuid, uuid) from public;
grant execute on function public.is_list_member(uuid, uuid) to authenticated;

-- add_owner_as_member est un trigger (AFTER INSERT sur lists) : jamais appelé en RPC,
-- et son exécution en tant que trigger ne dépend pas d'un EXECUTE accordé au rôle qui
-- fait l'INSERT déclencheur.
revoke execute on function public.add_owner_as_member() from anon, authenticated;

-- Ces RPC ont un sens uniquement pour un utilisateur déjà connecté (elles vérifient
-- en interne que l'email de l'appelant correspond à l'invite) : anon n'en a aucun usage.
revoke execute on function public.accept_invite(uuid) from anon;
revoke execute on function public.decline_invite(uuid) from anon;
revoke execute on function public.send_partner_invite(text) from anon;
revoke execute on function public.accept_partner_invite(uuid) from anon;
revoke execute on function public.decline_partner_invite(uuid) from anon;
