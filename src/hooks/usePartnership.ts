import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { PartnerInviteRow, PartnershipRow } from '../lib/database.types';
import { useAuth } from '../contexts/AuthContext';

export function usePartnership() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const partnership = useQuery({
    queryKey: ['partnership'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partnerships')
        .select('*')
        .or(`user_a.eq.${session!.user.id},user_b.eq.${session!.user.id}`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PartnershipRow | null;
    },
    enabled: !!session,
  });

  const sentInvite = useQuery({
    queryKey: ['partner_invites', 'sent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_invites')
        .select('*')
        .eq('from_user', session!.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        // Plusieurs invitations en attente possibles (renvoyée, autre email) :
        // sans limit(1), maybeSingle() échoue (PGRST116) et l'état « en
        // attente » disparaissait.
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PartnerInviteRow | null;
    },
    enabled: !!session,
  });

  const receivedInvites = useQuery({
    queryKey: ['partner_invites', 'received'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_invites')
        .select('*')
        .eq('to_email', session!.user.email ?? '')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PartnerInviteRow[];
    },
    enabled: !!session?.user.email,
  });

  async function sendPartnerInvite(toEmail: string) {
    const { error } = await supabase.rpc('send_partner_invite', { to_email: toEmail.trim().toLowerCase() });
    if (!error) {
      // Si l'autre nous avait déjà invité·e, le serveur accepte directement
      // son invitation (migration 0010) : jumelage créé et listes partagées.
      void queryClient.invalidateQueries({ queryKey: ['partner_invites'] });
      void queryClient.invalidateQueries({ queryKey: ['partnership'] });
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
    }
    return { error: error?.message ?? null };
  }

  async function acceptPartnerInvite(inviteId: string) {
    const { error } = await supabase.rpc('accept_partner_invite', { invite_id: inviteId });
    if (!error) {
      void queryClient.invalidateQueries({ queryKey: ['partner_invites', 'received'] });
      void queryClient.invalidateQueries({ queryKey: ['partnership'] });
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
    }
    return { error: error?.message ?? null };
  }

  async function declinePartnerInvite(inviteId: string) {
    const { error } = await supabase.rpc('decline_partner_invite', { invite_id: inviteId });
    if (!error) void queryClient.invalidateQueries({ queryKey: ['partner_invites', 'received'] });
    return { error: error?.message ?? null };
  }

  return { partnership, sentInvite, receivedInvites, sendPartnerInvite, acceptPartnerInvite, declinePartnerInvite };
}
