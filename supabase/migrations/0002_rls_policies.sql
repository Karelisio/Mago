-- Helper function to check membership without recursive RLS issues
create or replace function is_list_member(p_list_id uuid, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from list_members
    where list_id = p_list_id and user_id = p_user_id
  );
$$ language sql security definer stable;

alter table lists enable row level security;
alter table list_members enable row level security;
alter table items enable row level security;
alter table invites enable row level security;

-- lists: member can select; only owner can insert (owner_id = self); member can update; owner can delete
create policy lists_select on lists for select
  using (is_list_member(id, auth.uid()));

create policy lists_insert on lists for insert
  with check (owner_id = auth.uid());

create policy lists_update on lists for update
  using (is_list_member(id, auth.uid()))
  with check (is_list_member(id, auth.uid()));

create policy lists_delete on lists for delete
  using (owner_id = auth.uid());

-- list_members: member of the list can see the roster
create policy list_members_select on list_members for select
  using (is_list_member(list_id, auth.uid()));

create policy list_members_delete on list_members for delete
  using (user_id = auth.uid());

-- items: any member can select/insert/update; no delete policy (soft-delete only via update)
create policy items_select on items for select
  using (is_list_member(list_id, auth.uid()));

create policy items_insert on items for insert
  with check (is_list_member(list_id, auth.uid()) and added_by = auth.uid());

create policy items_update on items for update
  using (is_list_member(list_id, auth.uid()))
  with check (is_list_member(list_id, auth.uid()));

-- invites: visible to sender or to the invited email
create policy invites_select on invites for select
  using (
    from_user = auth.uid()
    or lower(to_email) = lower((select email from auth.users where id = auth.uid()))
  );

create policy invites_insert on invites for insert
  with check (from_user = auth.uid() and is_list_member(list_id, auth.uid()));

create policy invites_update on invites for update
  using (from_user = auth.uid())
  with check (from_user = auth.uid());
