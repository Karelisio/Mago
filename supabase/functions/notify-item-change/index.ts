// Reçoit le webhook de notify_item_change() (trigger Postgres sur items),
// résout les destinataires (membres de la liste hors auteur du changement),
// construit un aperçu compact de la liste et pousse un message FCM
// data-only à chaque appareil connu. Déployée avec --no-verify-jwt : c'est
// pg_net qui appelle cette fonction, pas une session utilisateur.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendFcmDataMessage } from './_shared/fcm.ts';

interface Payload {
  list_id: string;
  item_id: string;
  op: 'INSERT' | 'UPDATE';
  actor_id: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sharedSecret = Deno.env.get('WEBHOOK_SHARED_SECRET');
  if (!sharedSecret || req.headers.get('x-webhook-secret') !== sharedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = (await req.json()) as Payload;
  if (!payload.list_id || !payload.actor_id) {
    return new Response('Bad request', { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: members, error: membersError } = await supabase
    .from('list_members')
    .select('user_id')
    .eq('list_id', payload.list_id)
    .neq('user_id', payload.actor_id);
  if (membersError) {
    return new Response(`Erreur membres : ${membersError.message}`, { status: 500 });
  }

  const recipientIds = (members ?? []).map((m) => m.user_id);
  if (recipientIds.length === 0) {
    return new Response('Aucun destinataire', { status: 200 });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('device_tokens')
    .select('id, fcm_token, user_id')
    .in('user_id', recipientIds);
  if (tokensError) {
    return new Response(`Erreur tokens : ${tokensError.message}`, { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response('Aucun appareil enregistré', { status: 200 });
  }

  const { data: list } = await supabase.from('lists').select('name').eq('id', payload.list_id).single();

  const { data: items } = await supabase
    .from('items')
    .select('*')
    .eq('list_id', payload.list_id)
    .eq('is_relevant', true);

  const remaining = (items ?? []).filter((i) => !i.completed);
  const total = items?.length ?? 0;

  const serviceAccount = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')!);
  const projectId = Deno.env.get('FCM_PROJECT_ID')!;

  // Le snapshot contient les lignes complètes (mêmes noms de colonnes que
  // Postgres) : si le/la destinataire coche un article depuis le widget
  // app fermée, ces lignes sont mises en attente telles quelles dans la
  // même queue de sync hors-ligne que le reste de l'app (voir
  // offlineQueue.ts côté client, et MagoWidgetProvider.kt côté natif) —
  // d'où user_id qui doit être celui du destinataire, pas de l'auteur.
  const staleTokenIds: string[] = [];
  for (const { id, fcm_token, user_id } of tokens) {
    const snapshot = {
      list_id: payload.list_id,
      list_name: list?.name ?? '',
      user_id,
      total,
      items: remaining.slice(0, 5),
    };
    const data = { snapshot: JSON.stringify(snapshot) };
    const result = await sendFcmDataMessage(serviceAccount, projectId, fcm_token, data, payload.list_id);
    if (!result.ok && (result.status === 404 || result.errorCode === 'UNREGISTERED')) {
      staleTokenIds.push(id);
    }
  }

  if (staleTokenIds.length > 0) {
    await supabase.from('device_tokens').delete().in('id', staleTokenIds);
  }

  return new Response('OK', { status: 200 });
});
