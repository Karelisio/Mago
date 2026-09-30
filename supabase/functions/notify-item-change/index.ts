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

// Doit rester identique à WIDGET_MAX_ITEMS dans useWidgetSync.ts (chemin
// app ouverte) et au nombre de lignes de res/layout/widget_list_glance.xml
// / MagoWidgetProvider.kt (rowIds).
const WIDGET_MAX_ITEMS = 20;

// La charge data d'un message FCM est limitée à 4 Ko (clés comprises) ; un
// message plus gros est refusé et le widget n'est plus mis à jour. On garde
// de la marge, et on retire des articles en fin d'aperçu tant que le message
// dépasse ce budget (remaining/total restent exacts).
const FCM_DATA_BUDGET_BYTES = 3500;
const encoder = new TextEncoder();

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

  // Seulement les colonnes utiles au widget, dans le même ordre que l'app
  // (useItems.ts) : des lignes complètes (select('*')) dépassaient la limite
  // de 4 Ko dès une dizaine d'articles, et plus aucun push n'arrivait.
  const { data: items } = await supabase
    .from('items')
    .select('id, list_id, name, qty, unit, completed, category')
    .eq('list_id', payload.list_id)
    .eq('is_relevant', true)
    .order('category', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  const unchecked = (items ?? [])
    .filter((i) => !i.completed)
    .map(({ id, list_id, name, qty, unit, completed }) => ({ id, list_id, name, qty, unit, completed }));
  const total = items?.length ?? 0;

  const serviceAccount = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')!);
  const projectId = Deno.env.get('FCM_PROJECT_ID')!;

  // Même format que useWidgetSync.ts (chemin app ouverte) : articles non
  // cochés réduits à {id, list_id, name, qty, unit, completed} (noms de
  // colonnes Postgres), remaining = nombre total d'articles non cochés. Si
  // le/la destinataire coche un article depuis le widget app fermée, le
  // natif met en file un patch signé de user_id (voir MagoWidgetProvider.kt
  // et offlineQueue.ts) — d'où user_id qui doit être celui du destinataire,
  // pas de l'auteur.
  const staleTokenIds: string[] = [];
  for (const { id, fcm_token, user_id } of tokens) {
    const snapshotItems = unchecked.slice(0, WIDGET_MAX_ITEMS);
    const snapshot = {
      list_id: payload.list_id,
      list_name: list?.name ?? '',
      user_id,
      total,
      remaining: unchecked.length,
      items: snapshotItems,
    };
    let data = { snapshot: JSON.stringify(snapshot) };
    while (snapshotItems.length > 0 && encoder.encode(JSON.stringify(data)).length > FCM_DATA_BUDGET_BYTES) {
      snapshotItems.pop();
      data = { snapshot: JSON.stringify(snapshot) };
    }
    const result = await sendFcmDataMessage(serviceAccount, projectId, fcm_token, data, payload.list_id);
    if (!result.ok) {
      console.error('Envoi FCM échoué', { tokenId: id, status: result.status, errorCode: result.errorCode });
      // Token périmé (appli désinstallée, token régénéré) : seul cas où on le
      // supprime — une erreur passagère ou un message refusé ne doit pas
      // désinscrire l'appareil.
      if (result.status === 404 || result.errorCode === 'UNREGISTERED') {
        staleTokenIds.push(id);
      }
    }
  }

  if (staleTokenIds.length > 0) {
    await supabase.from('device_tokens').delete().in('id', staleTokenIds);
  }

  return new Response('OK', { status: 200 });
});
