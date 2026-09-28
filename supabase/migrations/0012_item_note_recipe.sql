-- Imports externes (deep link mago://import, voir src/lib/externalImport.ts) :
-- chaque article peut porter une note et la recette dont il provient.
-- Colonnes optionnelles, rien ne change pour les articles saisis à la main.
alter table items add column note text;
alter table items add column recipe_title text;
