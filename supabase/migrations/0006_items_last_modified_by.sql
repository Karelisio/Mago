-- added_by seul ne suffit pas pour savoir qui notifier lors d'un changement :
-- il reste figé sur l'auteur de la création, donc si B coche un article ajouté
-- par A, "where user_id <> added_by" notifierait B de sa propre action et
-- jamais A. last_modified_by est mis à jour par le client à chaque écriture
-- (insert et update), et c'est cette colonne que le trigger de la Phase 5
-- utilisera pour exclure l'auteur du changement des destinataires.

alter table items add column last_modified_by uuid references auth.users;
update items set last_modified_by = added_by where last_modified_by is null;
alter table items alter column last_modified_by set not null;

-- Comme pour added_by à l'insert, on empêche un client de mentir sur qui a
-- fait la dernière modification.
drop policy items_insert on items;
create policy items_insert on items for insert
  with check (is_list_member(list_id, auth.uid()) and added_by = auth.uid() and last_modified_by = auth.uid());

drop policy items_update on items;
create policy items_update on items for update
  using (is_list_member(list_id, auth.uid()))
  with check (is_list_member(list_id, auth.uid()) and last_modified_by = auth.uid());
