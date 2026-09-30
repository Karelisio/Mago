-- 0014 — Performance RLS + lecture des invitations.
--
-- 1. auth.uid() évalué une seule fois par requête au lieu d'une fois par
--    ligne ((select auth.uid()), advisor « auth_rls_initplan ») : même
--    sémantique.
-- 2. invites_select / partner_invites_select lisaient auth.users, où le rôle
--    authenticated n'a aucun droit : tout SELECT sur ces deux tables échouait
--    (« permission denied for table users »), donc aucune invitation — de
--    liste ou de jumelage — ne pouvait s'afficher dans l'app. L'e-mail vient
--    maintenant du JWT (auth.jwt() ->> 'email').
-- 3. Un index par clé étrangère (advisor « unindexed_foreign_keys »).

-- device_tokens
alter policy device_tokens_delete on public.device_tokens
  using (user_id = (select auth.uid()));
alter policy device_tokens_insert on public.device_tokens
  with check (user_id = (select auth.uid()));
alter policy device_tokens_select on public.device_tokens
  using (user_id = (select auth.uid()));
alter policy device_tokens_update on public.device_tokens
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- invites
alter policy invites_insert on public.invites
  with check (from_user = (select auth.uid())
              and public.is_list_member(list_id, (select auth.uid())));
alter policy invites_select on public.invites
  using (from_user = (select auth.uid())
         or lower(to_email) = lower((select auth.jwt()) ->> 'email'));
alter policy invites_update on public.invites
  using (from_user = (select auth.uid()))
  with check (from_user = (select auth.uid())
              and public.is_list_member(list_id, (select auth.uid())));

-- partner_invites
alter policy partner_invites_insert on public.partner_invites
  with check (from_user = (select auth.uid()));
alter policy partner_invites_select on public.partner_invites
  using (from_user = (select auth.uid())
         or lower(to_email) = lower((select auth.jwt()) ->> 'email'));
alter policy partner_invites_update on public.partner_invites
  using (from_user = (select auth.uid()))
  with check (from_user = (select auth.uid()));

-- partnerships
alter policy partnerships_select on public.partnerships
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

-- Catégories (partagées entre tous les comptes connectés, voir 0008)
alter policy item_categories_delete on public.item_categories
  using ((select auth.uid()) is not null);
alter policy item_categories_insert on public.item_categories
  with check (created_by = (select auth.uid()));
alter policy item_categories_select on public.item_categories
  using ((select auth.uid()) is not null);
alter policy list_categories_delete on public.list_categories
  using ((select auth.uid()) is not null);
alter policy list_categories_insert on public.list_categories
  with check (created_by = (select auth.uid()));
alter policy list_categories_select on public.list_categories
  using ((select auth.uid()) is not null);

-- items
alter policy items_insert on public.items
  with check (public.is_list_member(list_id, (select auth.uid()))
              and added_by = (select auth.uid())
              and last_modified_by = (select auth.uid()));
alter policy items_select on public.items
  using (public.is_list_member(list_id, (select auth.uid())));
alter policy items_update on public.items
  using (public.is_list_member(list_id, (select auth.uid())))
  with check (public.is_list_member(list_id, (select auth.uid()))
              and last_modified_by = (select auth.uid()));

-- list_members
alter policy list_members_delete on public.list_members
  using (user_id = (select auth.uid()));
alter policy list_members_select on public.list_members
  using (public.is_list_member(list_id, (select auth.uid())));

-- lists
alter policy lists_delete on public.lists
  using (owner_id = (select auth.uid()));
alter policy lists_insert on public.lists
  with check (owner_id = (select auth.uid()));
alter policy lists_select on public.lists
  using (public.is_list_member(id, (select auth.uid())));
alter policy lists_update on public.lists
  using (public.is_list_member(id, (select auth.uid())))
  with check (public.is_list_member(id, (select auth.uid())));

-- notes
alter policy notes_delete_own on public.notes
  using ((select auth.uid()) = user_id);
alter policy notes_insert_own on public.notes
  with check ((select auth.uid()) = user_id);
alter policy notes_select_own on public.notes
  using ((select auth.uid()) = user_id);
alter policy notes_update_own on public.notes
  using ((select auth.uid()) = user_id);

-- Index des clés étrangères
create index if not exists invites_list_id_idx on public.invites (list_id);
create index if not exists item_categories_created_by_idx on public.item_categories (created_by);
create index if not exists items_added_by_idx on public.items (added_by);
create index if not exists items_last_modified_by_idx on public.items (last_modified_by);
create index if not exists list_categories_created_by_idx on public.list_categories (created_by);
create index if not exists lists_owner_id_idx on public.lists (owner_id);
