import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { InviteRow } from '../lib/database.types';
import { useAuth } from '../contexts/AuthContext';

export function useInvites() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const sent = useQuery({
    queryKey: ['invites', 'sent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('from_user', session!.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as InviteRow[];
    },
    enabled: !!session,
  });

  const received = useQuery({
    queryKey: ['invites', 'received'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('to_email', session!.user.email ?? '')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as InviteRow[];
    },
    enabled: !!session?.user.email,
  });

  async function sendInvite(listId: string, toEmail: string) {
    if (!session) return { error: 'Non connecté' };
    const { error } = await supabase.from('invites').insert({
      list_id: listId,
      to_email: toEmail.trim().toLowerCase(),
      from_user: session.user.id,
    });
    if (!error) void queryClient.invalidateQueries({ queryKey: ['invites', 'sent'] });
    return { error: error?.message ?? null };
  }

  async function acceptInvite(inviteId: string) {
    const { error } = await supabase.rpc('accept_invite', { invite_id: inviteId });
    if (!error) {
      void queryClient.invalidateQueries({ queryKey: ['invites', 'received'] });
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
    }
    return { error: error?.message ?? null };
  }

  async function declineInvite(inviteId: string) {
    const { error } = await supabase.rpc('decline_invite', { invite_id: inviteId });
    if (!error) void queryClient.invalidateQueries({ queryKey: ['invites', 'received'] });
    return { error: error?.message ?? null };
  }

  return { sent, received, sendInvite, acceptInvite, declineInvite };
}
