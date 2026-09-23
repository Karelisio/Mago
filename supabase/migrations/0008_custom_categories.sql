-- Catégories gérées par les utilisateurs (listes et articles), à la place
-- des ensembles fixes codés en dur côté client. Partagées entre tous les
-- utilisateurs authentifiés de l'app : Mago sert un seul couple en
-- pratique, donc pas de scoping par "couple_id" (qui n'existe pas dans le
-- schéma) — une vraie app multi-tenant voudrait scoper ça, mais ce serait
-- de la sur-ingénierie pour l'usage réel de cette app.

create table list_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

create table item_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid references auth.users not null,
  created_at timestamptz default now()
);

alter table list_categories enable row level security;
alter table item_categories enable row level security;

-- Lecture ouverte à tout utilisateur connecté (partagé entre le couple) ;
-- écriture/suppression aussi ouvertes à tout utilisateur connecté (modèle
-- de confiance total entre partenaires déjà en place partout ailleurs dans
-- ce schéma, ex: list_members/items).
create policy list_categories_select on list_categories for select
  using (auth.uid() is not null);
create policy list_categories_insert on list_categories for insert
  with check (created_by = auth.uid());
create policy list_categories_delete on list_categories for delete
  using (auth.uid() is not null);

create policy item_categories_select on item_categories for select
  using (auth.uid() is not null);
create policy item_categories_insert on item_categories for insert
  with check (created_by = auth.uid());
create policy item_categories_delete on item_categories for delete
  using (auth.uid() is not null);

-- lists.type devient une catégorie libre gérée par l'utilisateur : plus de
-- CHECK figé sur 4 valeurs.
alter table lists drop constraint if exists lists_type_check;

-- Seed avec les valeurs par défaut déjà utilisées, pour ne rien casser
-- visuellement après la migration (attribué au premier compte existant,
-- faute d'un concept de "compte système").
insert into list_categories (name, created_by)
select v.name, u.id
from (values ('courses'), ('diy'), ('cadeaux'), ('autre')) as v(name)
cross join lateral (select id from auth.users order by created_at limit 1) as u
on conflict (name) do nothing;

insert into item_categories (name, created_by)
select v.name, u.id
from (values ('Produits frais'), ('Laiterie'), ('Viande'), ('Pantry'), ('Autres')) as v(name)
cross join lateral (select id from auth.users order by created_at limit 1) as u
on conflict (name) do nothing;
