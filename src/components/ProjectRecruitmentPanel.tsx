import React, { useEffect, useMemo, useState } from 'react';
import { Check, LoaderCircle, Plus, Send, UserPlus, X } from 'lucide-react';
import type {
  Language,
  ProfileTaxonomies,
  ProjectApplication,
  ProjectDetail,
  ProjectInvitation,
  ProjectRole,
  PublicProfile,
  RoleSkillRequirement,
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
  form, taxonomies, saving, onChange, onSave, onCancel,
}: {
  form: RoleForm;
  taxonomies: ProfileTaxonomies;
  saving: boolean;
  onChange: (form: RoleForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const change = (next: Partial<RoleForm>) => onChange({ ...form, ...next });
  function toggleSkill(skillId: string): void {
    const exists = form.skills.some(({ skill_id }) => skill_id === skillId);
    change({ skills: exists ? form.skills.filter(({ skill_id }) => skill_id !== skillId) : [...form.skills, { skill_id: skillId, requirement: 'required', weight: 1 }] });
  }
  function updateSkill(skillId: string, next: Partial<RoleSkillInput>): void {
    change({ skills: form.skills.map((skill) => skill.skill_id === skillId ? { ...skill, ...next } : skill) });
  }
  return (
    <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700 sm:col-span-2">Role title
          <input aria-label="Role title" maxLength={120} value={form.title} onChange={(event) => change({ title: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-xs font-bold text-slate-700 sm:col-span-2">Description
          <textarea aria-label="Role description" maxLength={2000} value={form.description} onChange={(event) => change({ description: event.target.value })} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-xs font-bold text-slate-700">Discipline
          <select aria-label="Role discipline" value={form.discipline_id} onChange={(event) => change({ discipline_id: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
            <option value="">—</option>
            {taxonomies.disciplines.map((item) => <option key={item.id} value={item.id}>{item.label_en}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">Positions
          <input aria-label="Role positions" type="number" min={1} max={20} value={form.positions_total} onChange={(event) => change({ positions_total: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-xs font-bold text-slate-700">Status
          <select aria-label="Role status" value={form.status} onChange={(event) => change({ status: event.target.value as 'open' | 'closed' })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
            <option value="open">Open</option><option value="filled" disabled>Filled (automatic)</option><option value="closed">Closed</option>
          </select>
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-black text-slate-700">Required and optional skills</legend>
        {taxonomies.skills.map((skill) => {
          const selected = form.skills.find(({ skill_id }) => skill_id === skill.id);
          return <div key={skill.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs">
            <input aria-label={`Use ${skill.label_en}`} type="checkbox" checked={Boolean(selected)} onChange={() => toggleSkill(skill.id)} />
            <span className="font-semibold text-slate-700">{skill.label_en}</span>
            <select aria-label={`${skill.label_en} requirement`} disabled={!selected} value={selected?.requirement ?? 'required'} onChange={(event) => updateSkill(skill.id, { requirement: event.target.value as RoleSkillRequirement })} className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40">
              <option value="required">Required</option><option value="optional">Optional</option>
            </select>
            <input aria-label={`${skill.label_en} weight`} disabled={!selected} type="number" min={1} max={100} value={selected?.weight ?? 1} onChange={(event) => updateSkill(skill.id, { weight: Number(event.target.value) })} className="w-16 rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40" />
          </div>;
        })}
      </fieldset>
      <div className="flex gap-2">
        <button type="button" disabled={saving || !form.title.trim()} onClick={onSave} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? '…' : 'Save role'}</button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold">Cancel</button>
      </div>
    </div>
  );
}

function RoleStatus({ role }: { role: ProjectRole }) {
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{role.status}</span>;
}

export function ProjectRecruitmentPanel({
  project, owner, taxonomies, lang,
}: {
  project: ProjectDetail;
  owner: boolean;
  taxonomies: ProfileTaxonomies;
  lang: Language;
}) {
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

  if (loading) return <div className="flex justify-center p-6"><LoaderCircle className="h-6 w-6 animate-spin text-blue-600" /></div>;
  return (
    <section className="mt-5 space-y-4 border-t border-slate-200 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-base font-black">Project roles</h3><p className="text-xs text-slate-500">Real roles and verified membership only.</p></div>
        {owner && ['draft', 'open', 'in_progress'].includes(project.status) && <button type="button" onClick={() => { setCreating(true); setEditingId(null); setForm(EMPTY_ROLE); }} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" />Add role</button>}
      </div>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">{notice}</div>}
      {(creating || editingId) && owner && <RoleEditor form={form} taxonomies={taxonomies} saving={saving} onChange={setForm} onSave={() => void saveRole()} onCancel={() => { setCreating(false); setEditingId(null); }} />}
      {roles.length === 0 && !creating ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">No project roles yet.</div> : roles.map((role) => {
        const myApplication = owner ? undefined : applicationsByRole.get(role.id)?.[0];
        return <article key={role.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3"><div><h4 className="font-black text-slate-900">{role.title}</h4><p className="text-xs font-semibold text-blue-700">{role.discipline?.[`label_${lang}`] ?? '—'}</p></div><RoleStatus role={role} /></div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">{role.description || '—'}</p>
          <p className="mt-2 text-xs font-bold text-slate-600">{role.positions_filled}/{role.positions_total} positions filled</p>
          <div className="mt-2 flex flex-wrap gap-1">{role.skills.map(({ skill, requirement, weight }) => <span key={skill.id} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold">{skill[`label_${lang}`]} · {requirement} · {weight}</span>)}</div>
          {owner ? <div className="mt-3 space-y-3">
            <div className="flex gap-2"><button type="button" onClick={() => editRole(role)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">Edit</button><button type="button" disabled={saving || role.status === 'closed'} onClick={() => void action(() => closeProjectRole(role.id), 'Role closed.')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-50">Close</button></div>
            {role.status === 'open' && <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select aria-label={`Invite candidate for ${role.title}`} value={invitees[role.id] ?? ''} onChange={(event) => setInvitees((current) => ({ ...current, [role.id]: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">Select real profile</option>{candidates.map((profile) => <option key={profile.id} value={profile.id}>{profileName(profile)}</option>)}</select>
              <input aria-label={`Invitation note for ${role.title}`} maxLength={1000} value={notes[`invite-${role.id}`] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [`invite-${role.id}`]: event.target.value }))} placeholder="Optional invitation note" className="rounded-xl border border-slate-200 px-3 py-2 text-xs" />
              <button type="button" disabled={saving || !invitees[role.id]} onClick={() => void action(() => inviteToProjectRole(role.id, invitees[role.id], notes[`invite-${role.id}`] ?? ''), 'Invitation sent.')} className="inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><UserPlus className="h-3.5 w-3.5" />Invite</button>
            </div>}
            {(applicationsByRole.get(role.id) ?? []).map((application) => <div key={application.id} className="rounded-xl bg-slate-50 p-3 text-xs"><div className="font-bold">{profileName(application.applicant)} · {application.status}</div><p className="mt-1 text-slate-600">{application.note || 'No note.'}</p>{application.status === 'pending' && <div className="mt-2 flex gap-2"><button type="button" disabled={saving} onClick={() => void action(() => acceptProjectApplication(application.id), 'Application accepted.')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-white"><Check className="h-3 w-3" />Accept</button><button type="button" disabled={saving} onClick={() => void action(() => rejectProjectApplication(application.id), 'Application rejected.')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1"><X className="h-3 w-3" />Reject</button></div>}</div>)}
          </div> : <div className="mt-3">
            {myApplication ? <div className="text-xs font-bold text-slate-600">Application: {myApplication.status}</div> : role.status === 'open' && project.status === 'open' ? <div className="flex gap-2"><input aria-label={`Application note for ${role.title}`} maxLength={1000} value={notes[role.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [role.id]: event.target.value }))} placeholder="Optional application note" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs" /><button type="button" disabled={saving} onClick={() => void action(() => applyToProjectRole(role.id, notes[role.id] ?? ''), 'Application sent.')} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"><Send className="h-3.5 w-3.5" />Apply</button></div> : <div className="text-xs font-bold text-slate-500">This role is {role.status}.</div>}
          </div>}
        </article>;
      })}
      {owner && invitations.length > 0 && <div><h4 className="mb-2 text-sm font-black">Sent invitations</h4>{invitations.map((invitation) => <div key={invitation.id} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><span>{profileName(invitation.invitee)} · {invitation.status}</span>{invitation.status === 'pending' && <button type="button" disabled={saving} onClick={() => void action(() => cancelProjectInvitation(invitation.id), 'Invitation cancelled.')} className="font-bold text-red-600">Cancel</button>}</div>)}</div>}
    </section>
  );
}

export function ProjectRequestsPanel() {
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
  if (loading) return <div className="flex justify-center p-8"><LoaderCircle className="h-6 w-6 animate-spin text-blue-600" /></div>;
  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
    <h2 className="text-lg font-black">Applications and invitations</h2>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
    <div><h3 className="mb-2 text-sm font-black">My applications</h3>{applications.length === 0 ? <p className="text-xs text-slate-500">No applications.</p> : applications.map((application) => <div key={application.id} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><span>{application.role?.project?.title ?? 'Project'} · {application.role?.title ?? 'Role'} · {application.status}</span>{application.status === 'pending' && <button type="button" onClick={() => void action(() => withdrawProjectApplication(application.id))} className="font-bold text-red-600">Withdraw</button>}</div>)}</div>
    <div><h3 className="mb-2 text-sm font-black">My invitations</h3>{invitations.length === 0 ? <p className="text-xs text-slate-500">No invitations.</p> : invitations.map((invitation) => { const expired = invitation.status === 'pending' && Date.parse(invitation.expires_at) <= Date.now(); return <div key={invitation.id} className="mb-2 rounded-xl bg-slate-50 p-3 text-xs"><div className="font-bold">{invitation.role?.project?.title ?? 'Project'} · {invitation.role?.title ?? 'Role'} · {expired ? 'expired' : invitation.status}</div>{invitation.status === 'pending' && <div className="mt-2 flex gap-2">{!expired && <button type="button" onClick={() => void action(() => acceptProjectInvitation(invitation.id))} className="rounded-lg bg-emerald-600 px-2 py-1 font-bold text-white">Accept</button>}<button type="button" onClick={() => void action(() => rejectProjectInvitation(invitation.id))} className="rounded-lg border border-slate-200 px-2 py-1 font-bold">Reject</button></div>}</div>; })}</div>
  </section>;
}
