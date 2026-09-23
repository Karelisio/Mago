-- Jetons FCM par appareil, pour pouvoir pousser une notif data-only au widget
-- écran d'accueil quand un·e partenaire modifie une liste (Phase 5 : widget).

create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  fcm_token text not null,
  platform text not null default 'android' check (platform in ('android')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, fcm_token)
);

create index idx_device_tokens_user_id on device_tokens(user_id);

create trigger trg_device_tokens_updated_at before update on device_tokens
  for each row execute function set_updated_at();

alter table device_tokens enable row level security;

-- Chaque utilisateur ne gère que ses propres tokens via le client anon/authenticated.
-- L'Edge Function qui doit lire les tokens du/de la partenaire passe par la
-- service_role key, qui contourne RLS — pas besoin de policy pour ce chemin-là.
create policy device_tokens_select on device_tokens for select
  using (user_id = auth.uid());

create policy device_tokens_insert on device_tokens for insert
  with check (user_id = auth.uid());

create policy device_tokens_update on device_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy device_tokens_delete on device_tokens for delete
  using (user_id = auth.uid());
