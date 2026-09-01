import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Send, UserPlus, UsersRound, Wrench } from 'lucide-react';
import type { EngiMatchProject, EngiMatchTeammate, Language, MyProject, ProjectRole } from '../types';
import { findProjectMatches, findTeammates } from '../engimatch/engimatchApi';
import { applyToProjectRole, inviteToProjectRole, listMyProjects, listProjectRoles } from '../projects/projectApi';
import { Button, EmptyState, LoadingState } from './ui';

type Props = { authenticated: boolean; lang: Language; onRequireAuth: () => void };
const COPY = {
  ru: {
    title: 'EngiMatch', subtitle: 'Подбор реальных участников и открытых ролей по инженерному профилю.', teammate: 'Найти участника', project: 'Найти проект',
    selectProject: 'Выберите проект', selectRole: 'Выберите открытую роль', invite: 'Пригласить в команду', apply: 'Подать заявку',
    noTeammates: 'Подходящие участники появятся, когда роль и профильные требования будут заполнены.', noProjects: 'Подходящих открытых ролей пока нет.',
    beforeSearch: 'Выберите проект и роль — мы покажем только доступных реальных участников.', signIn: 'Войдите, чтобы использовать EngiMatch.',
    missing: 'Стоит уточнить', reasons: 'Почему подходит', method: 'Подбор основан на данных профиля и роли. Решение о приглашении всегда остаётся за вами.', loading: 'Сопоставляем инженерные данные…', workshop: 'Матрица совместимости', signInAction: 'Войти', identity: 'Инженер / роль', evidence: 'Основания совпадения', fit: 'Совместимость', action: 'Действие',
  },
  kk: {
    title: 'EngiMatch', subtitle: 'Инженерлік профиль бойынша нақты қатысушылар мен ашық рөлдерді іріктеу.', teammate: 'Қатысушы табу', project: 'Жоба табу',
    selectProject: 'Жобаны таңдаңыз', selectRole: 'Ашық рөлді таңдаңыз', invite: 'Командаға шақыру', apply: 'Өтінім беру',
    noTeammates: 'Рөл мен профиль талаптары толтырылғанда сәйкес қатысушылар көрінеді.', noProjects: 'Сәйкес ашық рөлдер әзірге жоқ.',
    beforeSearch: 'Жоба мен рөлді таңдаңыз — тек қолжетімді нақты қатысушылар көрсетіледі.', signIn: 'EngiMatch пайдалану үшін кіріңіз.',
    missing: 'Нақтылау керек', reasons: 'Неліктен сәйкес', method: 'Іріктеу профиль мен рөл деректеріне негізделеді. Шақыру шешімі әрқашан сізде.', loading: 'Инженерлік деректер салыстырылуда…', workshop: 'Сәйкестік матрицасы', signInAction: 'Кіру', identity: 'Инженер / рөл', evidence: 'Сәйкестік негіздері', fit: 'Сәйкестік', action: 'Әрекет',
  },
  en: {
    title: 'EngiMatch', subtitle: 'Discover real collaborators and open roles from engineering profile data.', teammate: 'Find teammate', project: 'Find project',
    selectProject: 'Select a project', selectRole: 'Select an open role', invite: 'Invite to team', apply: 'Apply',
    noTeammates: 'Relevant collaborators will appear when the role and profile requirements are complete.', noProjects: 'No relevant open roles are available yet.',
    beforeSearch: 'Choose a project and role to see only real, eligible collaborators.', signIn: 'Sign in to use EngiMatch.',
    missing: 'Worth clarifying', reasons: 'Why this fits', method: 'Matching uses profile and role data. The invitation decision always remains yours.', loading: 'Comparing engineering context…', workshop: 'Compatibility matrix', signInAction: 'Sign in', identity: 'Engineer / role', evidence: 'Match evidence', fit: 'Compatibility', action: 'Action',
  },
} satisfies Record<Language, Record<string, string>>;

function errorText(lang: Language): string {
  return lang === 'ru'
    ? 'Не удалось обновить подбор. Повторите позже.'
    : lang === 'kk'
      ? 'Іріктеуді жаңарту мүмкін болмады. Кейінірек қайталап көріңіз.'
      : 'Matching could not be refreshed. Please try again.';
}

function fitScore(candidate: EngiMatchTeammate | EngiMatchProject): number {
  return Math.round(candidate.score);
}

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
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [acted, setActed] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<Set<string>>(new Set());
  const actingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    listMyProjects({ limit: 25 }).then(({ projects: rows }) => { if (active) setProjects(rows.filter(({ status }) => status === 'open')); }).catch(() => { if (active) setError(errorText(lang)); });
    return () => { active = false; };
  }, [authenticated, lang]);
  useEffect(() => {
    setRoleId(''); setRoles([]); setTeammates([]); setSearched(false);
    if (!projectId) return;
    let active = true;
    listProjectRoles(projectId).then((rows) => { if (active) setRoles(rows.filter((role) => role.status === 'open' && role.positions_available > 0)); }).catch(() => { if (active) setError(errorText(lang)); });
    return () => { active = false; };
  }, [lang, projectId]);

  async function loadTeammates(): Promise<void> { if (!roleId) return; setLoading(true); setSearched(true); setError(''); try { setTeammates((await findTeammates(roleId)).matches); } catch { setError(errorText(lang)); } finally { setLoading(false); } }
  async function loadProjects(): Promise<void> { setLoading(true); setSearched(true); setError(''); try { setProjectMatches((await findProjectMatches()).matches); } catch { setError(errorText(lang)); } finally { setLoading(false); } }
  useEffect(() => { setSearched(false); if (authenticated && mode === 'project') void loadProjects(); }, [authenticated, mode]);
  async function invite(match: EngiMatchTeammate): Promise<void> { const id = match.profile.id; if (actingRef.current.has(id) || acted.has(id)) return; actingRef.current.add(id); setActing((current) => new Set(current).add(id)); setError(''); try { await inviteToProjectRole(roleId, id, 'EngiMatch verified match'); setActed((current) => new Set(current).add(id)); await loadTeammates(); } catch { setError(errorText(lang)); } finally { actingRef.current.delete(id); setActing((current) => { const next = new Set(current); next.delete(id); return next; }); } }
  async function apply(match: EngiMatchProject): Promise<void> { const id = match.role.id; if (actingRef.current.has(id) || acted.has(id)) return; actingRef.current.add(id); setActing((current) => new Set(current).add(id)); setError(''); try { await applyToProjectRole(id, 'EngiMatch verified match'); setActed((current) => new Set(current).add(id)); await loadProjects(); } catch { setError(errorText(lang)); } finally { actingRef.current.delete(id); setActing((current) => { const next = new Set(current); next.delete(id); return next; }); } }

  if (!authenticated) return <section className="eq-collab-guest"><UsersRound aria-hidden="true" /><p>{copy.signIn}</p><Button onClick={onRequireAuth}>{copy.signInAction}</Button></section>;
  const rows = mode === 'teammate' ? teammates : projectMatches;
  return <section className="eq-match-workspace" aria-labelledby="engimatch-title">
    <header className="eq-collab-heading"><div><span className="eq-collab-kicker"><Wrench aria-hidden="true" />{copy.workshop}</span><h1 id="engimatch-title">{copy.title}</h1><p>{copy.subtitle}</p></div></header>
    <div className="eq-segmented" role="group" aria-label={copy.title}><button type="button" aria-pressed={mode === 'teammate'} onClick={() => setMode('teammate')}><UsersRound aria-hidden="true" />{copy.teammate}</button><button type="button" aria-pressed={mode === 'project'} onClick={() => setMode('project')}><BriefcaseBusiness aria-hidden="true" />{copy.project}</button></div>
    {mode === 'teammate' && <div className="eq-match-controls"><label><span>{copy.selectProject}</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{copy.selectProject}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label><span>{copy.selectRole}</span><select value={roleId} onChange={(event) => { setRoleId(event.target.value); setSearched(false); }}><option value="">{copy.selectRole}</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.title}</option>)}</select></label><Button disabled={!roleId || loading} onClick={() => void loadTeammates()}>{copy.teammate}<ArrowRight aria-hidden="true" /></Button></div>}
    {error && <div role="alert" className="eq-inline-alert eq-inline-alert--error">{error}</div>}
    {loading ? <LoadingState label={copy.loading} /> : rows.length === 0 ? <EmptyState title={mode === 'teammate' && !searched ? copy.beforeSearch : mode === 'teammate' ? copy.noTeammates : copy.noProjects} description={copy.method} /> : (
      <div className="eq-match-register">
        <div className="eq-match-register__head" aria-hidden="true"><span>{copy.identity}</span><span>{copy.evidence}</span><span>{copy.fit}</span><span>{copy.action}</span></div>
        <div className="eq-match-results">
          {mode === 'teammate' ? teammates.map((match) => <article key={match.profile.id} className="eq-match-row">
            <div className="eq-match-row__identity"><span aria-hidden="true">{(match.profile.display_name || match.profile.username || 'E').slice(0, 1)}</span><div><h2>{match.profile.display_name || match.profile.username || 'Engineer'}</h2><p>{match.profile.primary_discipline?.[`label_${lang}`] ?? '—'}</p></div></div>
            <div className="eq-match-row__evidence"><strong><CheckCircle2 aria-hidden="true" />{copy.reasons}</strong><ul>{match.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{match.missing_required_skills.length > 0 && <p><span>{copy.missing}:</span> {match.missing_required_skills.join(', ')}</p>}</div>
            <div className="eq-match-row__score"><strong>{fitScore(match)}</strong><span>/ 100</span></div>
            <Button disabled={acted.has(match.profile.id) || acting.has(match.profile.id)} onClick={() => void invite(match)}><UserPlus aria-hidden="true" />{copy.invite}</Button>
          </article>) : projectMatches.map((match) => <article key={match.role.id} className="eq-match-row">
            <div className="eq-match-row__identity"><BriefcaseBusiness aria-hidden="true" /><div><h2>{match.project.title}</h2><p>{match.role.title}</p></div></div>
            <div className="eq-match-row__evidence"><strong><CheckCircle2 aria-hidden="true" />{copy.reasons}</strong><ul>{match.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{match.missing_required_skills.length > 0 && <p><span>{copy.missing}:</span> {match.missing_required_skills.join(', ')}</p>}</div>
            <div className="eq-match-row__score"><strong>{fitScore(match)}</strong><span>/ 100</span></div>
            <Button disabled={acted.has(match.role.id) || acting.has(match.role.id)} onClick={() => void apply(match)}><Send aria-hidden="true" />{copy.apply}</Button>
          </article>)}
        </div>
      </div>
    )}
    <p className="eq-match-method">{copy.method} <span>engi-match-v1</span></p>
  </section>;
}
