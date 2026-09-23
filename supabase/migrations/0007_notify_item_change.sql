-- Déclenche un push FCM data-only vers les autres membres d'une liste quand un
-- article est ajouté ou substantiellement modifié (Phase 5 : widget écran
-- d'accueil temps réel). La logique métier (résolution des tokens, appel FCM)
-- vit dans l'Edge Function notify-item-change ; ce trigger se contente de
-- notifier son URL via pg_net, en best-effort (jamais bloquant/cassant pour
-- l'écriture réelle sur items).

create extension if not exists pg_net;

-- Étape manuelle unique, à faire une fois en dehors de cette migration (pour
-- que le secret ne finisse jamais en clair dans l'historique git) :
--   select vault.create_secret('<valeur aléatoire>', 'webhook_shared_secret');
-- La même valeur doit être configurée côté Edge Function via
--   supabase secrets set WEBHOOK_SHARED_SECRET=<même valeur>

create or replace function notify_item_change()
returns trigger as $$
declare
  webhook_secret text;
begin
  if tg_op = 'UPDATE' and
     new.completed is not distinct from old.completed and
     new.is_relevant is not distinct from old.is_relevant and
     new.name is not distinct from old.name and
     new.qty is not distinct from old.qty and
     new.unit is not distinct from old.unit
  then
    return new;
  end if;

  begin
    select decrypted_secret into webhook_secret
      from vault.decrypted_secrets where name = 'webhook_shared_secret';

    if webhook_secret is not null then
      perform net.http_post(
        url := 'https://xssochyjgxwwmvtweusv.supabase.co/functions/v1/notify-item-change',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
        body := jsonb_build_object(
          'list_id', new.list_id,
          'item_id', new.id,
          'op', tg_op,
          'actor_id', new.last_modified_by
        )
      );
    end if;
  exception when others then
    -- Ne jamais faire échouer l'écriture réelle sur items pour un problème de
    -- notification (Vault indisponible, pg_net non prêt, etc.).
    null;
  end;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_items_notify_change after insert or update on items
  for each row execute function notify_item_change();

-- Fonction trigger-only, jamais appelée en RPC direct (même traitement que
-- add_owner_as_member dans 0004_security_hardening.sql). Revoke from public
-- (pas seulement anon/authenticated) : Postgres accorde EXECUTE à PUBLIC par
-- défaut sur toute nouvelle fonction, et un revoke sur anon/authenticated
-- seul ne suffit pas tant que PUBLIC l'a encore.
revoke execute on function notify_item_change() from public;
