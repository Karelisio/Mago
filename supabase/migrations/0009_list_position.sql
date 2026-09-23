-- Ordre manuel des listes au sein d'un même type (boutons monter/descendre
-- dans Lists.tsx). Swap de position entre deux listes voisines, pas de
-- renumérotation globale à chaque déplacement.
alter table lists add column position double precision;

with ranked as (
  select id, row_number() over (partition by type order by created_at asc) as rn
  from lists
)
update lists set position = ranked.rn
from ranked where lists.id = ranked.id;

alter table lists alter column position set default 0;
alter table lists alter column position set not null;
