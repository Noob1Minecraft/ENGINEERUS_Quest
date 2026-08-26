import { apiFetch } from '../utils/api';

export type BetaParticipant = {
  status: 'active' | 'paused' | 'completed';
  cohort: string;
  source: string | null;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BetaFeedbackInput = {
  category: 'bug' | 'confusing_ux' | 'feature_request' | 'ai_answer_quality' | 'project_engimatch' | 'other';
  rating: number;
  product_area: 'onboarding' | 'dashboard' | 'profile' | 'ai_tutor' | 'quests' | 'projects' | 'engimatch' | 'messages' | 'authentication' | 'other';
  message: string;
};

export async function loadBetaState(): Promise<BetaParticipant> {
  return (await apiFetch<{ participant: BetaParticipant }>('/api/beta/state')).participant;
}

export async function startBetaOnboarding(): Promise<BetaParticipant> {
  return (await apiFetch<{ participant: BetaParticipant }>('/api/beta/onboarding/start', { method: 'POST' })).participant;
}

export async function completeBetaOnboarding(): Promise<BetaParticipant> {
  return (await apiFetch<{ participant: BetaParticipant }>('/api/beta/onboarding/complete', { method: 'POST' })).participant;
}

export async function submitBetaFeedback(input: BetaFeedbackInput): Promise<void> {
  await apiFetch('/api/beta/feedback', { method: 'POST', body: JSON.stringify(input) });
}

export async function recordBetaView(eventName: 'engimatch_viewed' | 'direct_chat_opened'): Promise<void> {
  await apiFetch('/api/beta/events', { method: 'POST', body: JSON.stringify({ event_name: eventName }) });
}
