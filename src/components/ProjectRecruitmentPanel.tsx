import React, { useEffect, useMemo, useState } from 'react';
import { Check, CircleDot, MessageCircle, Plus, Send, UserPlus, X } from 'lucide-react';
import type {
  Language,
  ProfileTaxonomies,
  ProjectApplication,
  ProjectDetail,
  ProjectInvitation,
  ProjectRole,
  ProjectRequestStatus,
  PublicProfile,
  RoleSkillRequirement,
  TaxonomyItem,
} from '../types';
import { searchProfiles } from '../profile/profileApi';
import {
  acceptProjectApplication,
  acceptProjectInvitation,
  applyToProjectRole,
  cancelProjectInvitation,
  closeProjectRole,
  createProjectRole,
  inviteToProjectRole,
  listMyProjectApplications,
  listMyProjectInvitations,
  listProjectApplications,
  listProjectInvitations,
  listProjectRoles,
  rejectProjectApplication,
  rejectProjectInvitation,
  updateProjectRole,
  withdrawProjectApplication,
  type CreateProjectRoleInput,
  type RoleSkillInput,
} from '../projects/projectApi';
import { ApiError } from '../utils/api';
import { createDirectConversation } from '../directChat/directChatApi';
import { Button, EmptyState, LoadingState } from './ui';

const COPY = {
  ru: {
    roles: 'Роли в проекте', rolesHint: 'Задачи команды и подтверждённое участие.', addRole: 'Добавить роль', noRoles: 'Командные роли пока не созданы.',
    roleTitle: 'Название роли', description: 'Что предстоит делать', discipline: 'Направление', positions: 'Мест', status: 'Статус', skills: 'Обязательные и дополнительные навыки',
    required: 'обязательно', optional: 'желательно', open: 'Открыта', filled: 'Команда собрана', closed: 'Закрыта', saveRole: 'Сохранить роль', cancel: 'Отмена', edit: 'Изменить', close: 'Закрыть набор',
    progress: 'мест занято', selectProfile: 'Выберите доступного участника', inviteNote: 'Коротко опишите контекст приглашения', invite: 'Пригласить',
    noNote: 'Комментарий не добавлен.', accept: 'Принять', reject: 'Отклонить', message: 'Написать', messageOwner: 'Написать координатору', apply: 'Подать заявку', applicationNote: 'Коротко расскажите, чем можете помочь',
    application: 'Заявка', sentInvites: 'Отправленные приглашения', withdraw: 'Отозвать', requests: 'Заявки и приглашения', myApplications: 'Мои заявки', myInvitations: 'Мои приглашения',
    noApplications: 'У вас пока нет активных заявок.', noInvitations: 'Новых приглашений пока нет.', pending: 'Ожидает решения', accepted: 'Принято', rejected: 'Отклонено', withdrawn: 'Отозвано', cancelled: 'Отменено', expired: 'Истекло', loading: 'Загружаем проектные запросы…',
  },
  kk: {
    roles: 'Жобадағы рөлдер', rolesHint: 'Команда міндеттері және расталған қатысу.', addRole: 'Рөл қосу', noRoles: 'Командалық рөлдер әзірге жоқ.',
    roleTitle: 'Рөл атауы', description: 'Орындалатын жұмыс', discipline: 'Бағыт', positions: 'Орын саны', status: 'Күйі', skills: 'Міндетті және қосымша дағдылар',
    required: 'міндетті', optional: 'қалаулы', open: 'Ашық', filled: 'Команда жиналды', closed: 'Жабық', saveRole: 'Рөлді сақтау', cancel: 'Бас тарту', edit: 'Өзгерту', close: 'Қабылдауды жабу',
    progress: 'орын толды', selectProfile: 'Қолжетімді қатысушыны таңдаңыз', inviteNote: 'Шақыру мәнмәтінін қысқаша жазыңыз', invite: 'Шақыру',
    noNote: 'Түсіндірме қосылмаған.', accept: 'Қабылдау', reject: 'Қабылдамау', message: 'Жазу', messageOwner: 'Үйлестірушіге жазу', apply: 'Өтінім беру', applicationNote: 'Қалай көмектесе алатыныңызды қысқаша жазыңыз',
    application: 'Өтінім', sentInvites: 'Жіберілген шақырулар', withdraw: 'Қайтарып алу', requests: 'Өтінімдер мен шақырулар', myApplications: 'Менің өтінімдерім', myInvitations: 'Менің шақыруларым',
    noApplications: 'Белсенді өтінімдеріңіз әзірге жоқ.', noInvitations: 'Жаңа шақырулар әзірге жоқ.', pending: 'Шешім күтілуде', accepted: 'Қабылданды', rejected: 'Қабылданбады', withdrawn: 'Қайтарылды', cancelled: 'Күші жойылды', expired: 'Мерзімі өтті', loading: 'Жоба сұраулары жүктелуде…',
  },
  en: {
    roles: 'Project roles', rolesHint: 'Team responsibilities and verified participation.', addRole: 'Add role', noRoles: 'No team roles have been created yet.',
    roleTitle: 'Role title', description: 'What the collaborator will work on', discipline: 'Discipline', positions: 'Positions', status: 'Status', skills: 'Required and optional skills',
    required: 'required', optional: 'optional', open: 'Open', filled: 'Team complete', closed: 'Closed', saveRole: 'Save role', cancel: 'Cancel', edit: 'Edit', close: 'Close recruitment',
    progress: 'positions filled', selectProfile: 'Select an eligible collaborator', inviteNote: 'Briefly explain the invitation context', invite: 'Invite',
    noNote: 'No note was added.', accept: 'Accept', reject: 'Reject', message: 'Message', messageOwner: 'Message coordinator', apply: 'Apply', applicationNote: 'Briefly explain how you can contribute',
    application: 'Application', sentInvites: 'Sent invitations', withdraw: 'Withdraw', requests: 'Applications and invitations', myApplications: 'My applications', myInvitations: 'My invitations',
    noApplications: 'You do not have any active applications yet.', noInvitations: 'There are no new invitations.', pending: 'Awaiting decision', accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn', cancelled: 'Cancelled', expired: 'Expired', loading: 'Loading project requests…',
  },
} satisfies Record<Language, Record<string, string>>;

type RoleForm = {
  title: string;
  description: string;
  discipline_id: string;
  positions_total: number;
  status: 'open' | 'filled' | 'closed';
  skills: RoleSkillInput[];
};

const EMPTY_ROLE: RoleForm = {
  title: '', description: '', discipline_id: '', positions_total: 1, status: 'open', skills: [],
};

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'The project request could not be completed.';
}

function profileName(profile: PublicProfile | ProjectApplication['applicant'] | ProjectInvitation['invitee']): string {
  return profile?.display_name || profile?.username || 'Engineer';
}

function taxonomyLabel(item: TaxonomyItem, lang: Language): string {
  return item[`label_${lang}`] || item.label_ru || item.slug;
}

function requestStatusLabel(status: ProjectRequestStatus, lang: Language): string {
  return COPY[lang][status];
}

function rolePayload(form: RoleForm): CreateProjectRoleInput {
  return {
    title: form.title.trim(),
    description: form.description,
    discipline_id: form.discipline_id || null,
    positions_total: form.positions_total,
    skills: form.skills,
  };
}

function RoleEditor({
  form, taxonomies, saving, lang, onChange, onSave, onCancel,
}: {
  form: RoleForm;
  taxonomies: ProfileTaxonomies;
  saving: boolean;
  lang: Language;
  onChange: (form: RoleForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const copy = COPY[lang];
  const change = (next: Partial<RoleForm>) => onChange({ ...form, ...next });
  function toggleSkill(skillId: string): void {
    const exists = form.skills.some(({ skill_id }) => skill_id === skillId);
    change({ skills: exists ? form.skills.filter(({ skill_id }) => skill_id !== skillId) : [...form.skills, { skill_id: skillId, requirement: 'required', weight: 1 }] });
  }
  function updateSkill(skillId: string, next: Partial<RoleSkillInput>): void {
    change({ skills: form.skills.map((skill) => skill.skill_id === skillId ? { ...skill, ...next } : skill) });
  }
  return (
    <div className="eq-role-editor">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700 sm:col-span-2">{copy.roleTitle}
          <input aria-label="Role title" maxLength={120} value={form.title} onChange={(event) => change({ title: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-xs font-bold text-slate-700 sm:col-span-2">{copy.description}
          <textarea aria-label="Role description" maxLength={2000} value={form.description} onChange={(event) => change({ description: event.target.value })} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-xs font-bold text-slate-700">{copy.discipline}
          <select aria-label="Role discipline" value={form.discipline_id} onChange={(event) => change({ discipline_id: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
            <option value="">—</option>
            {taxonomies.disciplines.map((item) => <option key={item.id} value={item.id}>{taxonomyLabel(item, lang)}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">{copy.positions}
          <input aria-label="Role positions" type="number" min={1} max={20} value={form.positions_total} onChange={(event) => change({ positions_total: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-xs font-bold text-slate-700">{copy.status}
          <select aria-label="Role status" value={form.status} onChange={(event) => change({ status: event.target.value as 'open' | 'closed' })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
            <option value="open">{copy.open}</option><option value="filled" disabled>{copy.filled}</option><option value="closed">{copy.closed}</option>
          </select>
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-black text-slate-700">{copy.skills}</legend>
        {taxonomies.skills.map((skill) => {
          const selected = form.skills.find(({ skill_id }) => skill_id === skill.id);
          return <div key={skill.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs">
            <input aria-label={`Use ${taxonomyLabel(skill, lang)}`} type="checkbox" checked={Boolean(selected)} onChange={() => toggleSkill(skill.id)} />
            <span className="font-semibold text-slate-700">{taxonomyLabel(skill, lang)}</span>
            <select aria-label={`${taxonomyLabel(skill, lang)} requirement`} disabled={!selected} value={selected?.requirement ?? 'required'} onChange={(event) => updateSkill(skill.id, { requirement: event.target.value as RoleSkillRequirement })} className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40">
              <option value="required">{copy.required}</option><option value="optional">{copy.optional}</option>
            </select>
            <input aria-label={`${taxonomyLabel(skill, lang)} weight`} disabled={!selected} type="number" min={1} max={100} value={selected?.weight ?? 1} onChange={(event) => updateSkill(skill.id, { weight: Number(event.target.value) })} className="w-16 rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40" />
          </div>;
        })}
      </fieldset>
      <div className="flex gap-2">
        <button type="button" disabled={saving || !form.title.trim()} onClick={onSave} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? '…' : copy.saveRole}</button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold">{copy.cancel}</button>
      </div>
    </div>
  );
}

function RoleStatus({ role, lang }: { role: ProjectRole; lang: Language }) {
  return <span className="eq-status-label"><CircleDot aria-hidden="true" />{COPY[lang][role.status]}</span>;
}

export function ProjectRecruitmentPanel({
  project, owner, taxonomies, lang, onOpenConversation,
}: {
  project: ProjectDetail;
  owner: boolean;
  taxonomies: ProfileTaxonomies;
  lang: Language;
  onOpenConversation?: (conversationId: string) => void;
}) {
  const copy = COPY[lang];
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [applications, setApplications] = useState<ProjectApplication[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [candidates, setCandidates] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoleForm>(EMPTY_ROLE);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [invitees, setInvitees] = useState<Record<string, string>>({});

  async function refresh(): Promise<void> {
    const [roleRows, applicationRows, invitationRows, candidateRows] = await Promise.all([
      listProjectRoles(project.id),
      owner ? listProjectApplications(project.id) : listMyProjectApplications(),
      owner ? listProjectInvitations(project.id) : Promise.resolve([]),
      owner ? searchProfiles({ available: true, limit: 25 }).then(({ profiles }) => profiles) : Promise.resolve([]),
    ]);
    setRoles(roleRows);
    setApplications(owner ? applicationRows : applicationRows.filter(({ project_id }) => project_id === project.id));
    setInvitations(invitationRows);
    setCandidates(candidateRows.filter(({ id }) => id !== project.owner?.id));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().catch((requestError) => { if (active) setError(errorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [project.id, owner]);

  const applicationsByRole = useMemo(() => new Map(roles.map((role) => [
    role.id, applications.filter(({ role_id }) => role_id === role.id),
  ])), [roles, applications]);

  async function action(run: () => Promise<unknown>, success: string): Promise<void> {
    setSaving(true); setError(''); setNotice('');
    try { await run(); await refresh(); setNotice(success); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSaving(false); }
  }

  async function openConversation(profileId: string): Promise<void> {
    setSaving(true); setError('');
    try {
      const { conversation_id } = await createDirectConversation(profileId, project.id);
      onOpenConversation?.(conversation_id);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSaving(false); }
  }

  async function saveRole(): Promise<void> {
    await action(async () => {
      if (editingId) {
        await updateProjectRole(editingId, {
          ...rolePayload(form),
          ...(form.status === 'filled' ? {} : { status: form.status }),
        });
      } else {
        await createProjectRole(project.id, rolePayload(form));
      }
      setCreating(false); setEditingId(null); setForm(EMPTY_ROLE);
    }, editingId ? 'Role updated.' : 'Role created.');
  }

  function editRole(role: ProjectRole): void {
    setEditingId(role.id); setCreating(false);
    setForm({
      title: role.title, description: role.description, discipline_id: role.discipline_id ?? '',
      positions_total: role.positions_total, status: role.status,
      skills: role.skills.map(({ skill, requirement, weight }) => ({ skill_id: skill.id, requirement, weight })),
    });
  }

  if (loading) return <LoadingState label={copy.loading} />;
  return (
    <section className="eq-recruitment" aria-labelledby="project-roles-title">
      <div className="flex items-center justify-between gap-3">
        <div><h3 id="project-roles-title" className="text-base font-black">{copy.roles}</h3><p className="text-xs text-slate-500">{copy.rolesHint}</p></div>
        {owner && ['draft', 'open', 'in_progress'].includes(project.status) && <Button onClick={() => { setCreating(true); setEditingId(null); setForm(EMPTY_ROLE); }}><Plus aria-hidden="true" />{copy.addRole}</Button>}
      </div>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">{notice}</div>}
      {(creating || editingId) && owner && <RoleEditor form={form} taxonomies={taxonomies} saving={saving} lang={lang} onChange={setForm} onSave={() => void saveRole()} onCancel={() => { setCreating(false); setEditingId(null); }} />}
      {roles.length === 0 && !creating ? <EmptyState title={copy.noRoles} /> : <div className="eq-role-list">{roles.map((role) => {
        const myApplication = owner ? undefined : applicationsByRole.get(role.id)?.[0];
        return <article key={role.id} className="eq-role-row">
          <div className="flex items-start justify-between gap-3"><div><h4 className="font-black text-slate-900">{role.title}</h4><p className="text-xs font-semibold text-blue-700">{role.discipline?.[`label_${lang}`] ?? '—'}</p></div><RoleStatus role={role} lang={lang} /></div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">{role.description || '—'}</p>
          <p className="mt-2 text-xs font-bold text-slate-600">{role.positions_filled}/{role.positions_total} {copy.progress}</p>
          <div className="eq-role-skills">{role.skills.map(({ skill, requirement }) => <span key={skill.id}><strong>{requirement === 'required' ? copy.required : copy.optional}</strong>{skill[`label_${lang}`]}</span>)}</div>
          {owner ? <div className="mt-3 space-y-3">
            <div className="flex gap-2"><Button variant="secondary" onClick={() => editRole(role)}>{copy.edit}</Button><Button variant="ghost" disabled={saving || role.status === 'closed'} onClick={() => void action(() => closeProjectRole(role.id), 'Role closed.')}>{copy.close}</Button></div>
            {role.status === 'open' && <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select aria-label={`${copy.invite}: ${role.title}`} value={invitees[role.id] ?? ''} onChange={(event) => setInvitees((current) => ({ ...current, [role.id]: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">{copy.selectProfile}</option>{candidates.map((profile) => <option key={profile.id} value={profile.id}>{profileName(profile)}</option>)}</select>
              <input aria-label={`${copy.inviteNote}: ${role.title}`} maxLength={1000} value={notes[`invite-${role.id}`] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [`invite-${role.id}`]: event.target.value }))} placeholder={copy.inviteNote} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" />
              <Button disabled={saving || !invitees[role.id]} onClick={() => void action(() => inviteToProjectRole(role.id, invitees[role.id], notes[`invite-${role.id}`] ?? ''), 'Invitation sent.')}><UserPlus aria-hidden="true" />{copy.invite}</Button>
            </div>}
            {(applicationsByRole.get(role.id) ?? []).map((application) => <div key={application.id} className="eq-request-row"><div><strong>{profileName(application.applicant)}</strong><span className="eq-status-label"><CircleDot aria-hidden="true" />{requestStatusLabel(application.status, lang)}</span></div><p>{application.note || copy.noNote}</p>{application.status === 'pending' && <div className="eq-request-row__actions"><Button disabled={saving} onClick={() => void action(() => acceptProjectApplication(application.id), 'Application accepted.')}><Check aria-hidden="true" />{copy.accept}</Button><Button variant="secondary" disabled={saving} onClick={() => void action(() => rejectProjectApplication(application.id), 'Application rejected.')}><X aria-hidden="true" />{copy.reject}</Button></div>}{application.status === 'accepted' && application.applicant && <Button variant="secondary" disabled={saving} onClick={() => void openConversation(application.applicant!.id)}><MessageCircle aria-hidden="true" />{copy.message}</Button>}</div>)}
          </div> : <div className="mt-3">
            {myApplication ? <div className="eq-role-application"><span>{copy.application}: <strong>{requestStatusLabel(myApplication.status, lang)}</strong></span>{myApplication.status === 'accepted' && project.owner && <Button variant="secondary" disabled={saving} onClick={() => void openConversation(project.owner!.id)}><MessageCircle aria-hidden="true" />{copy.messageOwner}</Button>}</div> : role.status === 'open' && project.status === 'open' ? <div className="eq-application-compose"><input aria-label={`${copy.applicationNote}: ${role.title}`} maxLength={1000} value={notes[role.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [role.id]: event.target.value }))} placeholder={copy.applicationNote} /><Button disabled={saving} onClick={() => void action(() => applyToProjectRole(role.id, notes[role.id] ?? ''), 'Application sent.')}><Send aria-hidden="true" />{copy.apply}</Button></div> : <div className="text-xs font-bold text-slate-500">{copy.status}: {COPY[lang][role.status]}</div>}
          </div>}
        </article>;
      })}</div>}
      {owner && invitations.length > 0 && <div className="eq-sent-invitations"><h4>{copy.sentInvites}</h4>{invitations.map((invitation) => <div key={invitation.id} className="eq-request-row"><div><strong>{profileName(invitation.invitee)}</strong><span className="eq-status-label"><CircleDot aria-hidden="true" />{requestStatusLabel(invitation.status, lang)}</span></div>{invitation.status === 'pending' && <Button variant="ghost" disabled={saving} onClick={() => void action(() => cancelProjectInvitation(invitation.id), 'Invitation cancelled.')}>{copy.cancel}</Button>}{invitation.status === 'accepted' && invitation.invitee && <Button variant="secondary" disabled={saving} onClick={() => void openConversation(invitation.invitee!.id)}><MessageCircle aria-hidden="true" />{copy.message}</Button>}</div>)}</div>}
    </section>
  );
}

export function ProjectRequestsPanel({ lang, onOpenConversation }: { lang: Language; onOpenConversation?: (conversationId: string) => void }) {
  const copy = COPY[lang];
  const [applications, setApplications] = useState<ProjectApplication[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(): Promise<void> {
    const [applicationRows, invitationRows] = await Promise.all([listMyProjectApplications(), listMyProjectInvitations()]);
    setApplications(applicationRows); setInvitations(invitationRows);
  }
  useEffect(() => { refresh().catch((requestError) => setError(errorMessage(requestError))).finally(() => setLoading(false)); }, []);
  async function action(run: () => Promise<unknown>): Promise<void> {
    setError('');
    try { await run(); await refresh(); } catch (requestError) { setError(errorMessage(requestError)); }
  }
  async function openConversation(profileId: string, projectId: string): Promise<void> {
    setError('');
    try { const { conversation_id } = await createDirectConversation(profileId, projectId); onOpenConversation?.(conversation_id); }
    catch (requestError) { setError(errorMessage(requestError)); }
  }
  if (loading) return <LoadingState label={copy.loading} />;
  return <section className="eq-requests" aria-labelledby="project-requests-title">
    <h2 id="project-requests-title">{copy.requests}</h2>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
    <section className="eq-requests__group" aria-labelledby="my-applications-title"><h3 id="my-applications-title">{copy.myApplications}</h3>{applications.length === 0 ? <EmptyState title={copy.noApplications} /> : applications.map((application) => <article key={application.id} className="eq-request-row"><div><strong>{application.role?.project?.title ?? 'Project'}</strong><span>{application.role?.title ?? 'Role'}</span><span className="eq-status-label"><CircleDot aria-hidden="true" />{requestStatusLabel(application.status, lang)}</span></div><div className="eq-request-row__actions">{application.status === 'pending' && <Button variant="ghost" onClick={() => void action(() => withdrawProjectApplication(application.id))}>{copy.withdraw}</Button>}{application.status === 'accepted' && application.role?.project && <Button variant="secondary" onClick={() => void openConversation(application.role!.project!.owner_id, application.project_id)}><MessageCircle aria-hidden="true" />{copy.messageOwner}</Button>}</div></article>)}</section>
    <section className="eq-requests__group" aria-labelledby="my-invitations-title"><h3 id="my-invitations-title">{copy.myInvitations}</h3>{invitations.length === 0 ? <EmptyState title={copy.noInvitations} /> : invitations.map((invitation) => { const expired = invitation.status === 'pending' && Date.parse(invitation.expires_at) <= Date.now(); return <article key={invitation.id} className="eq-request-row"><div><strong>{invitation.role?.project?.title ?? 'Project'}</strong><span>{invitation.role?.title ?? 'Role'}</span><span className="eq-status-label"><CircleDot aria-hidden="true" />{expired ? copy.expired : requestStatusLabel(invitation.status, lang)}</span></div><div className="eq-request-row__actions">{invitation.status === 'pending' && <>{!expired && <Button onClick={() => void action(() => acceptProjectInvitation(invitation.id))}>{copy.accept}</Button>}<Button variant="secondary" onClick={() => void action(() => rejectProjectInvitation(invitation.id))}>{copy.reject}</Button></>}{invitation.status === 'accepted' && invitation.inviter && <Button variant="secondary" onClick={() => void openConversation(invitation.inviter!.id, invitation.project_id)}><MessageCircle aria-hidden="true" />{copy.message}</Button>}</div></article>; })}</section>
  </section>;
}
