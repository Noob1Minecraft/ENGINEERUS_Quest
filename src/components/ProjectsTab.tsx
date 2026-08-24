import React, { useEffect, useState } from 'react';
import {
  Archive,
  BriefcaseBusiness,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
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

type ProjectsTabProps = {
  authenticated: boolean;
  lang: Language;
  onRequireAuth: () => void;
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
    mine: 'Мои проекты', discover: 'Найти проекты', create: 'Создать проект', save: 'Сохранить',
    cancel: 'Отмена', edit: 'Редактировать', archive: 'Архивировать', loadMore: 'Показать ещё',
    emptyMine: 'У вас пока нет проектов.', emptyDiscover: 'Подходящие открытые проекты не найдены.',
    future: 'Роли и участники проекта появятся в следующей фазе.', signIn: 'Войдите, чтобы работать с проектами.',
  },
  kk: {
    title: 'Инженерлік жобалар', subtitle: 'Нақты жобалар құрыңыз және ашық бастамаларды табыңыз.',
    mine: 'Менің жобаларым', discover: 'Жобаларды табу', create: 'Жоба құру', save: 'Сақтау',
    cancel: 'Бас тарту', edit: 'Өзгерту', archive: 'Мұрағаттау', loadMore: 'Тағы көрсету',
    emptyMine: 'Сізде әзірге жоба жоқ.', emptyDiscover: 'Сәйкес ашық жобалар табылмады.',
    future: 'Жоба рөлдері мен қатысушылары келесі кезеңде қосылады.', signIn: 'Жобалармен жұмыс істеу үшін кіріңіз.',
  },
  en: {
    title: 'Engineering projects', subtitle: 'Create real projects and discover open engineering initiatives.',
    mine: 'My Projects', discover: 'Discover Projects', create: 'Create project', save: 'Save',
    cancel: 'Cancel', edit: 'Edit', archive: 'Archive', loadMore: 'Load more',
    emptyMine: 'You do not have any projects yet.', emptyDiscover: 'No matching open projects were found.',
    future: 'Project roles and members will be added in the next phase.', signIn: 'Sign in to work with projects.',
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
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-slate-900">{project.title}</h3>
          <p className="mt-1 text-xs font-semibold text-blue-700">
            {project.primary_discipline ? label(project.primary_discipline, lang) : '—'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
          {STATUS_LABEL[lang][project.status]}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">
        {project.description || '—'}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{ownerView ? COPY[lang].mine : ownerName(project)}</span>
        <time dateTime={project.created_at}>{new Date(project.created_at).toLocaleDateString(lang)}</time>
      </div>
      {onOpen && (
        <button type="button" onClick={() => onOpen(project.id)} className="mt-4 text-xs font-bold text-blue-600 hover:text-blue-700">
          {lang === 'ru' ? 'Открыть проект' : lang === 'kk' ? 'Жобаны ашу' : 'Open project'}
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
      <label className="text-xs font-bold text-slate-700">Status
        <select value={form.status} onChange={(event) => field({ status: event.target.value as ProjectStatus })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          {(Object.keys(STATUS_LABEL[lang]) as ProjectStatus[]).map((value) => <option key={value} value={value}>{STATUS_LABEL[lang][value]}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-700">Visibility
        <select value={form.visibility} onChange={(event) => field({ visibility: event.target.value as ProjectVisibility })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          <option value="private">Private</option><option value="authenticated">Authenticated</option><option value="public">Public</option>
        </select>
      </label>
    </div>
  );
}

export const ProjectsTab: React.FC<ProjectsTabProps> = ({ authenticated, lang, onRequireAuth }) => {
  const copy = COPY[lang];
  const [mode, setMode] = useState<'mine' | 'discover'>('mine');
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
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <BriefcaseBusiness className="mx-auto h-9 w-9 text-blue-600" />
        <h1 className="mt-3 text-xl font-black">{copy.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{copy.signIn}</p>
        <button type="button" onClick={onRequireAuth} className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">Sign in</button>
      </section>
    );
  }

  const projects: Array<ProjectSummary | MyProject> = mode === 'mine' ? mine : discovered;
  return (
    <section className="space-y-5 animate-fade-in">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-black text-slate-950">{copy.title}</h1><p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p></div>
        <button type="button" onClick={() => { setCreating(true); setSelected(null); setForm(EMPTY_FORM); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />{copy.create}</button>
      </header>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs">
        {(['mine', 'discover'] as const).map((value) => <button key={value} type="button" onClick={() => { setMode(value); setSelected(null); setCreating(false); }} className={`flex-1 rounded-xl px-4 py-2 text-xs font-bold ${mode === value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{value === 'mine' ? copy.mine : copy.discover}</button>)}
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</div>}

      {creating && (
        <form onSubmit={submitCreate} className="rounded-3xl border border-blue-200 bg-white p-5 shadow-xs">
          <h2 className="mb-4 text-lg font-black">{copy.create}</h2>
          <ProjectFields form={form} disciplines={taxonomies?.disciplines ?? []} lang={lang} onChange={setForm} />
          <div className="mt-5 flex gap-2"><button disabled={saving || !form.title.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? '…' : copy.save}</button><button type="button" onClick={() => setCreating(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold">{copy.cancel}</button></div>
        </form>
      )}

      {selected && (
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
          {editing && 'owner_id' in selected ? (
            <form onSubmit={submitEdit}><ProjectFields form={form} disciplines={taxonomies?.disciplines ?? []} lang={lang} onChange={setForm} /><div className="mt-5 flex gap-2"><button disabled={saving || !form.title.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{copy.save}</button><button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold">{copy.cancel}</button></div></form>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">{selected.title}</h2><p className="mt-1 text-sm font-semibold text-blue-700">{selected.primary_discipline ? label(selected.primary_discipline, lang) : '—'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{STATUS_LABEL[lang][selected.status]}</span></div>
              <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{selected.description || '—'}</p>
              {'owner_id' in selected && <p className="mt-3 text-xs text-slate-500">Visibility: {selected.visibility}</p>}
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500"><ShieldCheck className="mr-1 inline h-4 w-4" />{copy.future}</div>
              {'owner_id' in selected && <div className="mt-5 flex gap-2"><button type="button" onClick={() => startEdit(selected)} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white"><Pencil className="h-3.5 w-3.5" />{copy.edit}</button><button type="button" disabled={saving || selected.status === 'archived'} onClick={archiveSelected} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50"><Archive className="h-3.5 w-3.5" />{copy.archive}</button></div>}
            </div>
          )}
        </article>
      )}

      {mode === 'discover' && !selected && (
        <form onSubmit={(event) => { event.preventDefault(); void runDiscovery(); }} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs md:grid-cols-4">
          <label className="text-xs font-bold text-slate-700">Search<input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-bold text-slate-700">Discipline<select value={filters.discipline} onChange={(event) => setFilters((current) => ({ ...current, discipline: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">All</option>{taxonomies?.disciplines.map((item) => <option key={item.id} value={item.id}>{label(item, lang)}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-700">Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">All</option><option value="open">{STATUS_LABEL[lang].open}</option><option value="in_progress">{STATUS_LABEL[lang].in_progress}</option><option value="completed">{STATUS_LABEL[lang].completed}</option></select></label>
          <button disabled={loading} className="self-end rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white"><Search className="mr-1 inline h-4 w-4" />Search</button>
        </form>
      )}

      {!selected && (loading && projects.length === 0 ? <div className="flex justify-center p-10"><LoaderCircle className="h-7 w-7 animate-spin text-blue-600" /></div> : projects.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{mode === 'mine' ? copy.emptyMine : copy.emptyDiscover}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <div key={project.id}><ProjectCard project={project} lang={lang} ownerView={mode === 'mine'} onOpen={openProject} /></div>)}</div>)}

      {!selected && mode === 'mine' && myCursor && <button type="button" disabled={loading} onClick={loadMoreMine} className="mx-auto block rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold disabled:opacity-50">{copy.loadMore}</button>}
      {!selected && mode === 'discover' && discoverCursor && <button type="button" onClick={() => runDiscovery(discoverCursor)} className="mx-auto block rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold">{copy.loadMore}</button>}
    </section>
  );
};
