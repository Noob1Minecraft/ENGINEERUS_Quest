import { apiFetch } from '../utils/api';

export type AdminFeedbackStatus = 'new' | 'reviewed' | 'resolved';

export type AdminFeedback = {
  id: string;
  category: string;
  rating: number;
  product_area: string;
  message: string;
  status: AdminFeedbackStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  submitter_id: string;
  submitter_username: string | null;
  submitter_display_name: string | null;
  submitter_avatar_url: string | null;
};

export type AdminSummary = {
  user_id: string;
  role: 'admin';
  granted_at: string;
  granted_by: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type AdminUserSearchResult = Pick<AdminSummary, 'user_id' | 'username' | 'display_name' | 'avatar_url'> & {
  is_admin: boolean;
};

export async function loadAdminAccess(): Promise<boolean> {
  return (await apiFetch<{ is_admin: boolean }>('/api/admin/access')).is_admin;
}

export async function loadAdminFeedback(): Promise<AdminFeedback[]> {
  return (await apiFetch<{ feedback: AdminFeedback[] }>('/api/admin/feedback?limit=25')).feedback;
}

export async function updateAdminFeedbackStatus(id: string, status: AdminFeedbackStatus): Promise<AdminFeedback> {
  return (await apiFetch<{ feedback: AdminFeedback }>(`/api/admin/feedback/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })).feedback;
}

export async function loadAdmins(): Promise<AdminSummary[]> {
  return (await apiFetch<{ admins: AdminSummary[] }>('/api/admin/admins')).admins;
}

export async function searchAdminUsers(query: string): Promise<AdminUserSearchResult[]> {
  const parameters = new URLSearchParams({ query, limit: '20' });
  return (await apiFetch<{ users: AdminUserSearchResult[] }>(`/api/admin/users?${parameters}`)).users;
}

export async function grantAdmin(userId: string): Promise<AdminSummary> {
  return (await apiFetch<{ admin: AdminSummary }>(`/api/admin/users/${userId}/admin`, {
    method: 'POST',
    body: JSON.stringify({}),
  })).admin;
}

export async function revokeAdmin(userId: string): Promise<void> {
  await apiFetch(`/api/admin/users/${userId}/admin`, { method: 'DELETE' });
}
