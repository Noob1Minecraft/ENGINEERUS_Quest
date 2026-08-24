import React, { useEffect, useState } from 'react';
import { BriefcaseBusiness, LoaderCircle, Send, UserPlus, UsersRound } from 'lucide-react';
import type { EngiMatchProject, EngiMatchTeammate, Language, MyProject, ProjectRole } from '../types';
import { ApiError } from '../utils/api';
import { findProjectMatches, findTeammates } from '../engimatch/engimatchApi';
import { applyToProjectRole, inviteToProjectRole, listMyProjects, listProjectRoles } from '../projects/projectApi';

type Props = { authenticated: boolean; lang: Language; onRequireAuth: () => void };
const COPY = {
  ru: { title: 'EngiMatch', subtitle: 'Детерминированный подбор реальных участников и открытых ролей.', teammate: 'Найти участника', project: 'Найти проект', selectProject: 'Выберите проект', selectRole: 'Выберите открытую роль', invite: 'Пригласить', apply: 'Подать заявку', noMatches: 'Подходящие совпадения не найдены.', signIn: 'Войдите, чтобы использовать EngiMatch.', missing: 'Не хватает обязательных навыков', score: 'Совпадение' },
  kk: { title: 'EngiMatch', subtitle: 'Нақты қатысушылар мен ашық рөлдерді детерминирленген іріктеу.', teammate: 'Қатысушы табу', project: 'Жоба табу', selectProject: 'Жобаны таңдаңыз', selectRole: 'Ашық рөлді таңдаңыз', invite: 'Шақыру', apply: 'Өтінім беру', noMatches: 'Сәйкес нәтижелер табылмады.', signIn: 'EngiMatch пайдалану үшін кіріңіз.', missing: 'Міндетті дағдылар жетіспейді', score: 'Сәйкестік' },
  en: { title: 'EngiMatch', subtitle: 'Deterministic matching of real members and open roles.', teammate: 'Find teammate', project: 'Find project', selectProject: 'Select a project', selectRole: 'Select an open role', invite: 'Invite', apply: 'Apply', noMatches: 'No eligible matches found.', signIn: 'Sign in to use EngiMatch.', missing: 'Missing required skills', score: 'Match' },
} satisfies Record<Language, Record<string, string>>;

function errorText(error: unknown): string { return error instanceof ApiError ? error.message : 'EngiMatch is temporarily unavailable.'; }

export function EngiMatchTab({ authenticated, lang, onRequireAuth }: Props) {
  const copy = COPY[lang];
  const [mode, setMode] = useState<'teammate' | 'project'>('teammate');
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [roleId, setRoleId] = useState('');
  const [teammates, setTeammates] = useState<EngiMatchTeammate[]>([]);
  const [projectMatches, setProjectMatches] = useState<EngiMatchProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [acted, setActed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authenticated) return;
    listMyProjects({ limit: 25 }).then(({ projects: rows }) => setProjects(rows.filter(({ status }) => status === 'open'))).catch((reason) => setError(errorText(reason)));
  }, [authenticated]);
  useEffect(() => {
    setRoleId(''); setRoles([]); setTeammates([]);
    if (!projectId) return;
    listProjectRoles(projectId).then((rows) => setRoles(rows.filter((role) => role.status === 'open' && role.positions_available > 0))).catch((reason) => setError(errorText(reason)));
  }, [projectId]);

  async function loadTeammates(): Promise<void> { if (!roleId) return; setLoading(true); setError(''); try { setTeammates((await findTeammates(roleId)).matches); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }
  async function loadProjects(): Promise<void> { setLoading(true); setError(''); try { setProjectMatches((await findProjectMatches()).matches); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }
  useEffect(() => { if (authenticated && mode === 'project') void loadProjects(); }, [authenticated, mode]);
  async function invite(match: EngiMatchTeammate): Promise<void> { setError(''); try { await inviteToProjectRole(roleId, match.profile.id, 'EngiMatch verified match'); setActed((current) => new Set(current).add(match.profile.id)); await loadTeammates(); } catch (reason) { setError(errorText(reason)); } }
  async function apply(match: EngiMatchProject): Promise<void> { setError(''); try { await applyToProjectRole(match.role.id, 'EngiMatch verified match'); setActed((current) => new Set(current).add(match.role.id)); await loadProjects(); } catch (reason) { setError(errorText(reason)); } }

  if (!authenticated) return <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center"><UsersRound className="mx-auto mb-3 h-8 w-8 text-blue-600" /><p className="text-sm text-slate-600">{copy.signIn}</p><button type="button" onClick={onRequireAuth} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">Sign in</button></section>;
  const rows = mode === 'teammate' ? teammates : projectMatches;
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-black">{copy.title}</h1><p className="text-sm text-slate-500">{copy.subtitle}</p></div>
    <div className="flex gap-2 rounded-2xl bg-slate-100 p-1"><button type="button" onClick={() => setMode('teammate')} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${mode === 'teammate' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}>{copy.teammate}</button><button type="button" onClick={() => setMode('project')} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${mode === 'project' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}>{copy.project}</button></div>
    {mode === 'teammate' && <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]"><select aria-label={copy.selectProject} value={projectId} onChange={(event) => setProjectId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">{copy.selectProject}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><select aria-label={copy.selectRole} value={roleId} onChange={(event) => setRoleId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">{copy.selectRole}</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.title}</option>)}</select><button type="button" disabled={!roleId || loading} onClick={() => void loadTeammates()} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{copy.teammate}</button></div>}
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
    {loading ? <div className="flex justify-center p-10"><LoaderCircle className="h-7 w-7 animate-spin text-blue-600" /></div> : rows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{copy.noMatches}</div> : <div className="grid gap-4 md:grid-cols-2">{mode === 'teammate' ? teammates.map((match) => <article key={match.profile.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-3"><div><h2 className="font-black">{match.profile.display_name || match.profile.username || 'Engineer'}</h2><p className="text-xs text-slate-500">{match.profile.primary_discipline?.[`label_${lang}`] ?? '—'}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{copy.score}: {match.score}</span></div><ul className="mt-3 space-y-1 text-xs text-slate-600">{match.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>{match.missing_required_skills.length > 0 && <p className="mt-2 text-xs text-amber-700">{copy.missing}: {match.missing_required_skills.join(', ')}</p>}<button type="button" disabled={acted.has(match.profile.id)} onClick={() => void invite(match)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><UserPlus className="h-4 w-4" />{copy.invite}</button></article>) : projectMatches.map((match) => <article key={match.role.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-3"><div><h2 className="font-black">{match.project.title}</h2><p className="text-xs font-semibold text-blue-700">{match.role.title}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{copy.score}: {match.score}</span></div><ul className="mt-3 space-y-1 text-xs text-slate-600">{match.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>{match.missing_required_skills.length > 0 && <p className="mt-2 text-xs text-amber-700">{copy.missing}: {match.missing_required_skills.join(', ')}</p>}<button type="button" disabled={acted.has(match.role.id)} onClick={() => void apply(match)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{copy.apply}</button></article>)}</div>}
    <p className="text-[11px] text-slate-400"><BriefcaseBusiness className="mr-1 inline h-3 w-3" />Scoring: engi-match-v1. Database eligibility and deterministic ordering are authoritative.</p>
  </section>;
}
