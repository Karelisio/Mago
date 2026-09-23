export type ListType = 'courses' | 'diy' | 'cadeaux' | 'autre';
export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface ListRow {
  id: string;
  name: string;
  type: ListType;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ListMemberRow {
  id: string;
  list_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

export interface ItemRow {
  id: string;
  list_id: string;
  name: string;
  qty: number | null;
  unit: string | null;
  category: string | null;
  completed: boolean;
  is_relevant: boolean;
  added_by: string;
  created_at: string;
  updated_at: string;
}

export interface InviteRow {
  id: string;
  from_user: string;
  to_email: string;
  list_id: string;
  status: InviteStatus;
  created_at: string;
}

export interface PartnershipRow {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
}

export interface PartnerInviteRow {
  id: string;
  from_user: string;
  to_email: string;
  status: InviteStatus;
  created_at: string;
}
