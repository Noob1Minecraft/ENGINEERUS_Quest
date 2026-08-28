import React, { useEffect, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BriefcaseBusiness,
  CircleDot,
  Compass,
  Pencil,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import type {
  Language,
  MyProject,
  ProfileTaxonomies,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  ProjectVisibility,
  TaxonomyItem,
} from '../types';
import { ApiError, apiFetch } from '../utils/api';
import {
  archiveProject,
  createProject,
  discoverProjects,
  listMyProjects,
  loadProject,
  updateProject,
} from '../projects/projectApi';
import { ProjectRecruitmentPanel, ProjectRequestsPanel } from './ProjectRecruitmentPanel';
import { Button, EmptyState, LoadingState } from './ui';

type ProjectsTabProps = {
  authenticated: boolean;
  lang: Language;
  onRequireAuth: () => void;
  onOpenConversation?: (conversationId: string) => void;
};

type ProjectForm = {
  title: string;
  description: string;
  primary_discipline_id: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
};

const EMPTY_FORM: ProjectForm = {
  title: '',
  description: '',
  primary_discipline_id: '',
  status: 'draft',
  visibility: 'private',
};

const COPY = {
  ru: {
    title: 'Инженерные проекты', subtitle: 'Создавайте реальные проекты и находите открытые инициативы.',
    mine: 'Мои проекты', discover: 'Найти проекты', requests: 'Заявки', create: 'Создать проект', save: 'Сохранить',
    cancel: 'Отмена', edit: 'Редактировать', archive: 'Архивировать', loadMore: 'Показать ещё',
    emptyMine: 'Пока нет проектов. Создайте первый инженерный проект.', emptyDiscover: 'Подходящие открытые проекты не найдены.',
    signIn: 'Войдите, чтобы работать с проектами.', open: 'Открыть проект', back: 'К списку проектов', owner: 'Координатор',
    description: 'Задача проекта', visibility: 'Доступ', private: 'Приватный', authenticated: 'Участникам Engineerus', public: 'Публичный', search: 'Поиск', discipline: 'Направление', status: 'Статус', all: 'Все', loading: 'Загружаем проекты…',
  },
  kk: {
    title: 'Инженерлік жобалар', subtitle: 'Нақты жобалар құрыңыз және ашық бастамаларды табыңыз.',
    mine: 'Менің жобаларым', discover: 'Жобаларды табу', requests: 'Өтінімдер', create: 'Жоба құру', save: 'Сақтау',
    cancel: 'Бас тарту', edit: 'Өзгерту', archive: 'Мұрағаттау', loadMore: 'Тағы көрсету',
    emptyMine: 'Сізде әзірге жоба жоқ.', emptyDiscover: 'Сәйкес ашық жобалар табылмады.',
    signIn: 'Жобалармен жұмыс істеу үшін кіріңіз.', open: 'Жобаны ашу', back: 'Жобалар тізіміне', owner: 'Үйлестіруші',
    description: 'Жоба міндеті', visibility: 'Қолжетімділік', private: 'Жеке', authenticated: 'Engineerus қатысушыларына', public: 'Ашық', search: 'Іздеу', discipline: 'Бағыт', status: 'Күйі', all: 'Барлығы', loading: 'Жобалар жүктелуде…',
  },
  en: {
    title: 'Engineering projects', subtitle: 'Create real projects and discover open engineering initiatives.',
    mine: 'My Projects', discover: 'Discover Projects', requests: 'Requests', create: 'Create project', save: 'Save',
    cancel: 'Cancel', edit: 'Edit', archive: 'Archive', loadMore: 'Load more',
    emptyMine: 'You do not have any projects yet.', emptyDiscover: 'No matching open projects were found.',
    signIn: 'Sign in to work with projects.', open: 'Open project', back: 'Back to projects', owner: 'Coordinator',
    description: 'Project brief', visibility: 'Access', private: 'Private', authenticated: 'Engineerus members', public: 'Public', search: 'Search', discipline: 'Discipline', status: 'Status', all: 'All', loading: 'Loading projects…',
  },
} satisfies Record<Language, Record<string, string>>;

const STATUS_LABEL: Record<Language, Record<ProjectStatus, string>> = {
  ru: { draft: 'Черновик', open: 'Открыт', in_progress: 'В работе', completed: 'Завершён', cancelled: 'Отменён', archived: 'Архив' },
  kk: { draft: 'Жоба', open: 'Ашық', in_progress: 'Орындалуда', completed: 'Аяқталды', cancelled: 'Бас тартылды', archived: 'Мұрағат' },
  en: { draft: 'Draft', open: 'Open', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', archived: 'Archived' },
};

function label(item: TaxonomyItem, lang: Language): string {
  return item[`label_${lang}`] || item.label_ru || item.slug;
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : 'The request could not be completed. Please try again.';
}

function ownerName(project: ProjectSummary): string {
  return project.owner?.display_name || project.owner?.username || 'Engineer';
}

export function ProjectCard({
  project,
  lang,
  ownerView = false,
  onOpen,
}: {
  project: ProjectSummary | MyProject;
  lang: Language;
  ownerView?: boolean;
  onOpen?: (id: string) => void;
}) {
  return (
    <article className="eq-project-row">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3>{project.title}</h3>
          <p className="eq-project-row__discipline">
            {project.primary_discipline ? label(project.primary_discipline, lang) : '—'}
          </p>
        </div>
        <span className="eq-status-label"><CircleDot aria-hidden="true" />{STATUS_LABEL[lang][project.status]}</span>
      </div>
      <p className="eq-project-row__description">
        {project.description || '—'}
      </p>
      <div className="eq-project-row__meta">
        <span><UserRound aria-hidden="true" />{ownerView ? COPY[lang].mine : ownerName(project)}</span>
        <time dateTime={project.created_at}>{new Date(project.created_at).toLocaleDateString(lang)}</time>
      </div>
      {onOpen && (
        <button type="button" onClick={() => onOpen(project.id)} className="eq-project-row__action">
          {COPY[lang].open}<ArrowLeft aria-hidden="true" className="rotate-180" />
        </button>
      )}
    </article>
  );
}

function ProjectFields({
  form,
  disciplines,
  lang,
  onChange,
}: {
  form: ProjectForm;
  disciplines: TaxonomyItem[];
  lang: Language;
  onChange: (form: ProjectForm) => void;
}) {
  const field = (change: Partial<ProjectForm>) => onChange({ ...form, ...change });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2 text-xs font-bold text-slate-700">
        {lang === 'ru' ? 'Название' : lang === 'kk' ? 'Атауы' : 'Title'}
        <input required maxLength={120} value={form.title} onChange={(event) => field({ title: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
      </label>
      <label className="sm:col-span-2 text-xs font-bold text-slate-700">
        {lang === 'ru' ? 'Описание' : lang === 'kk' ? 'Сипаттама' : 'Description'}
        <textarea maxLength={5000} value={form.description} onChange={(event) => field({ description: event.target.value })} className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
      </label>
      <label className="text-xs font-bold text-slate-700">
        {lang === 'ru' ? 'Дисциплина' : lang === 'kk' ? 'Бағыт' : 'Discipline'}
        <select value={form.primary_discipline_id} onChange={(event) => field({ primary_discipline_id: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          <option value="">—</option>
          {disciplines.map((item) => <option key={item.id} value={item.id}>{label(item, lang)}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-700">{COPY[lang].status}
        <select value={form.status} onChange={(event) => field({ status: event.target.value as ProjectStatus })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          {(Object.keys(STATUS_LABEL[lang]) as ProjectStatus[]).map((value) => <option key={value} value={value}>{STATUS_LABEL[lang][value]}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-700">{COPY[lang].visibility}
        <select value={form.visibility} onChange={(event) => field({ visibility: event.target.value as ProjectVisibility })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          <option value="private">{COPY[lang].private}</option><option value="authenticated">{COPY[lang].authenticated}</option><option value="public">{COPY[lang].public}</option>
        </select>
      </label>
    </div>
  );
}

export const ProjectsTab: React.FC<ProjectsTabProps> = ({ authenticated, lang, onRequireAuth, onOpenConversation }) => {
  const copy = COPY[lang];
  const [mode, setMode] = useState<'mine' | 'discover' | 'requests'>('mine');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [taxonomies, setTaxonomies] = useState<ProfileTaxonomies | null>(null);
  const [mine, setMine] = useState<MyProject[]>([]);
  const [discovered, setDiscovered] = useState<ProjectSummary[]>([]);
  const [myCursor, setMyCursor] = useState<string | null>(null);
  const [discoverCursor, setDiscoverCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [selected, setSelected] = useState<ProjectDetail | MyProject | null>(null);
  const [filters, setFilters] = useState({ query: '', discipline: '', status: '' });

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      apiFetch<ProfileTaxonomies>('/api/profile-taxonomies'),
      listMyProjects(),
      discoverProjects(),
    ]).then(([taxonomyResult, ownerResult, discoveryResult]) => {
      if (!active) return;
      setTaxonomies(taxonomyResult);
      setMine(ownerResult.projects);
      setMyCursor(ownerResult.next_cursor);
      setDiscovered(discoveryResult.projects);
      setDiscoverCursor(discoveryResult.next_cursor);
    }).catch((requestError) => {
      if (active) setError(message(requestError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [authenticated]);

  async function refreshMine(): Promise<void> {
    const result = await listMyProjects();
    setMine(result.projects);
    setMyCursor(result.next_cursor);
  }

  async function runDiscovery(cursor?: string): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const result = await discoverProjects({
        query: filters.query.trim() || undefined,
        discipline: filters.discipline || undefined,
        status: (filters.status || undefined) as 'open' | 'in_progress' | 'completed' | undefined,
        cursor,
      });
      setDiscovered((current) => cursor ? [...current, ...result.projects] : result.projects);
      setDiscoverCursor(result.next_cursor);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreMine(): Promise<void> {
    if (!myCursor) return;
    setLoading(true);
    setError('');
    try {
      const result = await listMyProjects({ cursor: myCursor });
      setMine((current) => [...current, ...result.projects]);
      setMyCursor(result.next_cursor);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function openProject(id: string): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const result = await loadProject(id);
      setSelected(result.project);
      setEditing(false);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function submitCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const project = await createProject({
        ...form,
        title: form.title.trim(),
        primary_discipline_id: form.primary_discipline_id || null,
      });
      await refreshMine();
      setSelected(project);
      setCreating(false);
      setForm(EMPTY_FORM);
      setNotice(lang === 'ru' ? 'Проект создан.' : lang === 'kk' ? 'Жоба құрылды.' : 'Project created.');
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(project: MyProject): void {
    setForm({
      title: project.title,
      description: project.description,
      primary_discipline_id: project.primary_discipline_id || '',
      status: project.status,
      visibility: project.visibility,
    });
    setEditing(true);
  }

  async function submitEdit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!selected || !('owner_id' in selected)) return;
    setSaving(true);
    setError('');
    try {
      const project = await updateProject(selected.id, {
        ...form,
        title: form.title.trim(),
        primary_discipline_id: form.primary_discipline_id || null,
      });
      setSelected(project);
      setEditing(false);
      await refreshMine();
      setNotice(lang === 'ru' ? 'Изменения сохранены.' : lang === 'kk' ? 'Өзгерістер сақталды.' : 'Changes saved.');
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelected(): Promise<void> {
    if (!selected || !('owner_id' in selected)) return;
    setSaving(true);
    setError('');
    try {
      const project = await archiveProject(selected.id);
      setSelected(project);
      await refreshMine();
      setNotice(lang === 'ru' ? 'Проект архивирован.' : lang === 'kk' ? 'Жоба мұрағатталды.' : 'Project archived.');
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (!authenticated) {
    return (
      <section className="eq-collab-guest">
        <BriefcaseBusiness className="mx-auto h-9 w-9 text-blue-600" />
        <h1 className="mt-3 text-xl font-black">{copy.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{copy.signIn}</p>
        <Button onClick={onRequireAuth}>Sign in</Button>
      </section>
    );
  }

  const projects: Array<ProjectSummary | MyProject> = mode === 'mine' ? mine : discovered;
  return (
    <section className="eq-project-workspace animate-fade-in">
      <header className="eq-collab-heading">
        <div><span className="eq-collab-kicker"><Compass aria-hidden="true" />Project workshop</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <Button onClick={() => { setCreating(true); setSelected(null); setForm(EMPTY_FORM); }}><Plus aria-hidden="true" />{copy.create}</Button>
      </header>

      <div className="eq-segmented" role="group" aria-label={copy.title}>
        {(['mine', 'discover', 'requests'] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setSelected(null); setCreating(false); }}>{value === 'mine' ? copy.mine : value === 'discover' ? copy.discover : copy.requests}</button>)}
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</div>}

      {creating && (
        <form onSubmit={submitCreate} className="eq-project-form">
          <h2 className="mb-4 text-lg font-black">{copy.create}</h2>
          <ProjectFields form={form} disciplines={taxonomies?.disciplines ?? []} lang={lang} onChange={setForm} />
          <div className="mt-5 flex gap-2"><button disabled={saving || !form.title.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? '…' : copy.save}</button><button type="button" onClick={() => setCreating(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold">{copy.cancel}</button></div>
        </form>
      )}

      {selected && (
        <article className="eq-project-detail">
          {editing && 'owner_id' in selected ? (
            <form onSubmit={submitEdit}><ProjectFields form={form} disciplines={taxonomies?.disciplines ?? []} lang={lang} onChange={setForm} /><div className="mt-5 flex gap-2"><button disabled={saving || !form.title.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{copy.save}</button><button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold">{copy.cancel}</button></div></form>
          ) : (
            <div>
              <button type="button" onClick={() => setSelected(null)} className="eq-back-link"><ArrowLeft aria-hidden="true" />{copy.back}</button>
              <div className="eq-project-detail__identity"><div><span>{selected.primary_discipline ? label(selected.primary_discipline, lang) : '—'}</span><h2>{selected.title}</h2><p><UserRound aria-hidden="true" />{copy.owner}: {selected.owner ? ownerName(selected) : '—'}</p></div><span className="eq-status-label"><CircleDot aria-hidden="true" />{STATUS_LABEL[lang][selected.status]}</span></div>
              <section className="eq-project-detail__brief" aria-labelledby="project-brief-title"><h3 id="project-brief-title">{copy.description}</h3><p>{selected.description || '—'}</p></section>
              {'owner_id' in selected && <p className="eq-project-detail__access">{copy.visibility}: <strong>{copy[selected.visibility]}</strong></p>}
              {'owner_id' in selected && <div className="eq-project-detail__actions"><Button onClick={() => startEdit(selected)}><Pencil aria-hidden="true" />{copy.edit}</Button><Button variant="secondary" disabled={saving || selected.status === 'archived'} onClick={archiveSelected}><Archive aria-hidden="true" />{copy.archive}</Button></div>}
              {taxonomies && <ProjectRecruitmentPanel project={selected} owner={'owner_id' in selected} taxonomies={taxonomies} lang={lang} onOpenConversation={onOpenConversation} />}
            </div>
          )}
        </article>
      )}

      {mode === 'discover' && !selected && (
        <form onSubmit={(event) => { event.preventDefault(); void runDiscovery(); }} className="eq-project-filters">
          <label>{copy.search}<input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label>
          <label>{copy.discipline}<select value={filters.discipline} onChange={(event) => setFilters((current) => ({ ...current, discipline: event.target.value }))}><option value="">{copy.all}</option>{taxonomies?.disciplines.map((item) => <option key={item.id} value={item.id}>{label(item, lang)}</option>)}</select></label>
          <label>{copy.status}<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">{copy.all}</option><option value="open">{STATUS_LABEL[lang].open}</option><option value="in_progress">{STATUS_LABEL[lang].in_progress}</option><option value="completed">{STATUS_LABEL[lang].completed}</option></select></label>
          <Button type="submit" disabled={loading}><Search aria-hidden="true" />{copy.search}</Button>
        </form>
      )}

      {mode === 'requests' && !selected && <ProjectRequestsPanel lang={lang} onOpenConversation={onOpenConversation} />}

      {!selected && mode !== 'requests' && (loading && projects.length === 0 ? <LoadingState label={copy.loading} /> : projects.length === 0 ? <EmptyState title={mode === 'mine' ? copy.emptyMine : copy.emptyDiscover} action={mode === 'mine' ? <Button onClick={() => { setCreating(true); setForm(EMPTY_FORM); }}>{copy.create}</Button> : undefined} /> : <div className="eq-project-list">{projects.map((project) => <ProjectCard key={project.id} project={project} lang={lang} ownerView={mode === 'mine'} onOpen={openProject} />)}</div>)}

      {!selected && mode === 'mine' && myCursor && <button type="button" disabled={loading} onClick={loadMoreMine} className="mx-auto block rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold disabled:opacity-50">{copy.loadMore}</button>}
      {!selected && mode === 'discover' && discoverCursor && <button type="button" onClick={() => runDiscovery(discoverCursor)} className="mx-auto block rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold">{copy.loadMore}</button>}
    </section>
  );
};
