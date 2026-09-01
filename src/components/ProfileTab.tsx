import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Flame,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type {
  CanonicalUser,
  Language,
  MyProfile,
  ProfileTaxonomies,
  PublicProfile,
  TaxonomyItem,
} from '../types';
import { ApiError, apiFetch } from '../utils/api';
import {
  getProfileCompletionSteps,
  loadPublicProfile,
  saveOwnerProfile,
  saveOwnerSettings,
  searchProfiles,
  type ProfileUpdateInput,
} from '../profile/profileApi';

type ProfileTabProps = {
  account: CanonicalUser | null;
  authenticated: boolean;
  loading: boolean;
  lang: Language;
  onRequireAuth: () => void;
  onAccountChange: (account: CanonicalUser) => void;
  onSignOut: () => Promise<void>;
};

type ProfileFormState = {
  username: string;
  display_name: string;
  avatar_url: string;
  university_name: string;
  primary_discipline_id: string;
  bio: string;
  portfolio_url: string;
  profile_visibility: MyProfile['profile_visibility'];
  portfolio_visibility: MyProfile['portfolio_visibility'];
  available_for_projects: boolean;
  skills: string[];
  tools: string[];
  interests: string[];
  languages: string[];
};

type Copy = {
  title: string;
  subtitle: string;
  edit: string;
  editAction: string;
  discover: string;
  save: string;
  saving: string;
  cancel: string;
  settings: string;
  search: string;
  noResults: string;
  privateProfile: string;
  loadMore: string;
  signOut: string;
  signingOut: string;
  signOutError: string;
};

const PROFILE_COPY = {
  ru: {
    identity: 'Инженерная идентичность', engineering: 'Инженерный фокус', skills: 'Навыки', tools: 'Инструменты', interests: 'Интересы', languages: 'Языки', university: 'Университет', discipline: 'Направление', bio: 'О себе', username: 'Имя пользователя', displayName: 'Отображаемое имя', avatar: 'Ссылка на аватар', portfolio: 'Портфолио', visibility: 'Видимость профиля', portfolioVisibility: 'Видимость портфолио', public: 'Публичный', authenticated: 'Только пользователи Engineerus', private: 'Только я', available: 'Готов участвовать в проектах', unavailable: 'Сейчас не ищу проекты', completion: 'Следующие шаги профиля', completionDone: 'Профиль готов для обучения и совместной работы.', editHint: 'Эти данные помогают EngiMatch предлагать подходящие проекты и реальных участников.', learningNote: 'Навыки здесь отражают учебный и проектный контекст, а не профессиональную сертификацию.', unsaved: 'Есть несохранённые изменения.', invalidUsername: '1–50 символов: буквы, цифры, точка, дефис или подчёркивание.', invalidUrl: 'Укажите полный адрес, начинающийся с http:// или https://.', requiredUsername: 'Укажите имя пользователя.', search: 'Поиск', all: 'Все', availableOnly: 'Только доступные', profileSaved: 'Профиль сохранён.',
  },
  kk: {
    identity: 'Инженерлік бейне', engineering: 'Инженерлік бағыт', skills: 'Дағдылар', tools: 'Құралдар', interests: 'Қызығушылықтар', languages: 'Тілдер', university: 'Университет', discipline: 'Бағыт', bio: 'Өзіңіз туралы', username: 'Пайдаланушы аты', displayName: 'Көрсетілетін аты', avatar: 'Аватар сілтемесі', portfolio: 'Портфолио', visibility: 'Профиль көрінуі', portfolioVisibility: 'Портфолио көрінуі', public: 'Ашық', authenticated: 'Тек Engineerus пайдаланушылары', private: 'Тек мен', available: 'Жобаларға қатысуға дайынмын', unavailable: 'Қазір жоба іздемеймін', completion: 'Профильдің келесі қадамдары', completionDone: 'Профиль оқу мен бірлескен жұмысқа дайын.', editHint: 'Бұл деректер EngiMatch-ке сәйкес жобалар мен нақты қатысушыларды ұсынуға көмектеседі.', learningNote: 'Мұндағы дағдылар оқу және жоба контекстін көрсетеді, кәсіби сертификат емес.', unsaved: 'Сақталмаған өзгерістер бар.', invalidUsername: '1–50 таңба: әріп, сан, нүкте, дефис немесе астын сызу.', invalidUrl: 'http:// немесе https:// деп басталатын толық мекенжайды көрсетіңіз.', requiredUsername: 'Пайдаланушы атын көрсетіңіз.', search: 'Іздеу', all: 'Барлығы', availableOnly: 'Тек қолжетімді', profileSaved: 'Профиль сақталды.',
  },
  en: {
    identity: 'Engineering identity', engineering: 'Engineering focus', skills: 'Skills', tools: 'Tools', interests: 'Interests', languages: 'Languages', university: 'University', discipline: 'Discipline', bio: 'About you', username: 'Username', displayName: 'Display name', avatar: 'Avatar URL', portfolio: 'Portfolio', visibility: 'Profile visibility', portfolioVisibility: 'Portfolio visibility', public: 'Public', authenticated: 'Engineerus users only', private: 'Only me', available: 'Available for projects', unavailable: 'Not looking for projects now', completion: 'Profile next steps', completionDone: 'Your profile is ready for learning and collaboration.', editHint: 'This information helps EngiMatch suggest relevant projects and real collaborators.', learningNote: 'Skills here describe learning and project context, not professional certification.', unsaved: 'You have unsaved changes.', invalidUsername: 'Use 1–50 letters, numbers, dots, hyphens, or underscores.', invalidUrl: 'Enter a full address beginning with http:// or https://.', requiredUsername: 'Enter a username.', search: 'Search', all: 'All', availableOnly: 'Available only', profileSaved: 'Profile saved.',
  },
} satisfies Record<Language, Record<string, string>>;

const COPY: Record<Language, Copy> = {
  ru: {
    title: 'Профиль инженера', subtitle: 'Навыки, интересы и готовность к проектам', edit: 'Мой профиль', editAction: 'Редактировать',
    discover: 'Найти инженеров', save: 'Сохранить', saving: 'Сохранение…', cancel: 'Отмена',
    settings: 'Приватные настройки', search: 'Найти', noResults: 'Подходящие профили не найдены.',
    privateProfile: 'Этот профиль недоступен или скрыт настройками приватности.', loadMore: 'Показать ещё',
    signOut: 'Выйти из аккаунта', signingOut: 'Выход…', signOutError: 'Не удалось выйти из аккаунта. Попробуйте ещё раз.',
  },
  kk: {
    title: 'Инженер профилі', subtitle: 'Дағдылар, қызығушылықтар және жобаларға дайындық', edit: 'Менің профилім', editAction: 'Өзгерту',
    discover: 'Инженерлерді табу', save: 'Сақтау', saving: 'Сақталуда…', cancel: 'Бас тарту',
    settings: 'Жеке баптаулар', search: 'Іздеу', noResults: 'Сәйкес профильдер табылмады.',
    privateProfile: 'Бұл профиль қолжетімсіз немесе құпиялылық баптауларымен жасырылған.', loadMore: 'Тағы көрсету',
    signOut: 'Аккаунттан шығу', signingOut: 'Шығу…', signOutError: 'Аккаунттан шығу мүмкін болмады. Қайталап көріңіз.',
  },
  en: {
    title: 'Engineering profile', subtitle: 'Skills, interests, and project availability', edit: 'My profile', editAction: 'Edit profile',
    discover: 'Find engineers', save: 'Save', saving: 'Saving…', cancel: 'Cancel',
    settings: 'Private settings', search: 'Search', noResults: 'No matching profiles found.',
    privateProfile: 'This profile is unavailable or hidden by its privacy settings.', loadMore: 'Load more',
    signOut: 'Sign out', signingOut: 'Signing out…', signOutError: 'Sign out failed. Please try again.',
  },
};

const LANGUAGE_OPTIONS = [
  { code: 'ru', label: 'Русский' },
  { code: 'kk', label: 'Қазақша' },
  { code: 'en', label: 'English' },
];

function taxonomyLabel(item: TaxonomyItem, lang: Language): string {
  return item[`label_${lang}`] || item.label_ru || item.slug;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function profileToForm(profile: MyProfile): ProfileFormState {
  return {
    username: profile.username || '', display_name: profile.display_name || '', avatar_url: profile.avatar_url || '',
    university_name: profile.university_name || '', primary_discipline_id: profile.primary_discipline_id || '',
    bio: profile.bio || '', portfolio_url: profile.portfolio_url || '', profile_visibility: profile.profile_visibility,
    portfolio_visibility: profile.portfolio_visibility, available_for_projects: profile.available_for_projects,
    skills: profile.skills.map(({ id }) => id), tools: profile.tools.map(({ id }) => id),
    interests: profile.interests.map(({ id }) => id), languages: profile.languages.map(({ language_code }) => language_code),
  };
}

function errorMessage(error: unknown, lang: Language): string {
  if (error instanceof ApiError && error.code === 'username_taken') return lang === 'ru' ? 'Это имя пользователя уже занято.' : lang === 'kk' ? 'Бұл пайдаланушы аты бос емес.' : 'That username is already in use.';
  if (error instanceof ApiError && error.code === 'invalid_profile_input') return lang === 'ru' ? 'Проверьте поля профиля и попробуйте снова.' : lang === 'kk' ? 'Профиль өрістерін тексеріп, қайталап көріңіз.' : 'Check the profile fields and try again.';
  return lang === 'ru' ? 'Не удалось выполнить запрос. Попробуйте ещё раз.' : lang === 'kk' ? 'Сұрау орындалмады. Қайталап көріңіз.' : 'The request could not be completed. Please try again.';
}

export async function performProfileSignOut(
  signOut: () => Promise<void>,
  onError: () => void,
): Promise<boolean> {
  try {
    await signOut();
    return true;
  } catch {
    onError();
    return false;
  }
}

function ProfileAvatar({ profile, large = false }: { profile: PublicProfile; large?: boolean }) {
  const name = profile.display_name || profile.username || 'Engineer';
  const classes = large ? 'h-20 w-20 text-2xl' : 'h-12 w-12 text-base';
  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt={name} className={`${classes} rounded-2xl object-cover border border-slate-200`} />;
  }
  return (
    <div className={`${classes} rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black`} aria-label={name}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function PublicProfileCard({
  profile,
  lang,
  onOpen,
}: {
  profile: PublicProfile;
  lang: Language;
  onOpen?: (id: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex gap-3">
        <ProfileAvatar profile={profile} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-slate-900">{profile.display_name || profile.username || (lang === 'ru' ? 'Инженер' : lang === 'kk' ? 'Инженер' : 'Engineer')}</h3>
          {profile.username && <p className="text-xs text-slate-500">@{profile.username}</p>}
          <p className="mt-1 text-xs font-semibold text-blue-700">
            {profile.primary_discipline ? taxonomyLabel(profile.primary_discipline, lang) : '—'}
          </p>
        </div>
        {profile.available_for_projects && (
          <span className="h-fit rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{lang === 'ru' ? 'Доступен' : lang === 'kk' ? 'Қолжетімді' : 'Available'}</span>
        )}
      </div>
      {profile.bio && <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">{profile.bio}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {profile.skills.slice(0, 5).map((skill) => (
          <span key={skill.id} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
            {taxonomyLabel(skill, lang)}
          </span>
        ))}
      </div>
      {(profile.tools.length > 0 || profile.languages.length > 0) && (
        <p className="mt-3 text-[11px] text-slate-500">
          {profile.tools.slice(0, 3).map((tool) => taxonomyLabel(tool, lang)).join(' · ')}
          {profile.tools.length > 0 && profile.languages.length > 0 ? ' · ' : ''}
          {profile.languages.map(({ language_code }) => language_code.toUpperCase()).join(' · ')}
        </p>
      )}
      {onOpen && (
        <button type="button" onClick={() => onOpen(profile.id)} className="mt-4 text-xs font-bold text-blue-600 hover:text-blue-700">
          {lang === 'ru' ? 'Открыть профиль' : lang === 'kk' ? 'Профильді ашу' : 'Open profile'}
        </button>
      )}
    </article>
  );
}

function TaxonomyPicker({
  title,
  items,
  selected,
  lang,
  onChange,
}: {
  title: string;
  items: TaxonomyItem[];
  selected: string[];
  lang: Language;
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-bold text-slate-700">{title}</legend>
      <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 grid gap-1 sm:grid-cols-2">
        {items.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white">
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(event) => onChange(event.target.checked
                ? [...selected, item.id]
                : selected.filter((id) => id !== item.id))}
              className="accent-blue-600"
            />
            <span>{taxonomyLabel(item, lang)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  account,
  authenticated,
  loading,
  lang,
  onRequireAuth,
  onAccountChange,
  onSignOut,
}) => {
  const copy = COPY[lang];
  const labels = PROFILE_COPY[lang];
  const [mode, setMode] = useState<'owner' | 'discover'>('owner');
  const [editing, setEditing] = useState(false);
  const [taxonomies, setTaxonomies] = useState<ProfileTaxonomies | null>(null);
  const [taxonomyError, setTaxonomyError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedPublic, setSelectedPublic] = useState<PublicProfile | null>(null);
  const [publicError, setPublicError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const signOutPending = useRef(false);
  const [filters, setFilters] = useState({ query: '', discipline: '', skill: '', available: false });

  const profile = account?.profile;
  const settings = account?.private_settings;
  const [form, setForm] = useState<ProfileFormState>({
    username: '', display_name: '', avatar_url: '', university_name: '', primary_discipline_id: '',
    bio: '', portfolio_url: '', profile_visibility: 'private',
    portfolio_visibility: 'private', available_for_projects: false,
    skills: [] as string[], tools: [] as string[], interests: [] as string[], languages: [] as string[],
  });

  useEffect(() => {
    if (!profile) return;
    setForm(profileToForm(profile));
  }, [profile]);

  useEffect(() => {
    if (!authenticated || taxonomies) return;
    let active = true;
    apiFetch<ProfileTaxonomies>('/api/profile-taxonomies')
      .then((result) => { if (active) setTaxonomies(result); })
      .catch((reason) => { if (active) setTaxonomyError(errorMessage(reason, lang)); });
    return () => { active = false; };
  }, [authenticated, lang, taxonomies]);

  const selectedLanguages = useMemo(() => new Set(form.languages), [form.languages]);
  const dirty = useMemo(() => profile ? JSON.stringify(form) !== JSON.stringify(profileToForm(profile)) : false, [form, profile]);
  const completionSteps = useMemo(() => profile ? getProfileCompletionSteps(profile, lang) : [], [lang, profile]);
  const usernameError = !form.username.trim() ? labels.requiredUsername : !/^[\p{L}\p{N}_.-]{1,50}$/u.test(form.username.trim()) ? labels.invalidUsername : '';
  const portfolioError = form.portfolio_url.trim() && !/^https?:\/\/\S+$/i.test(form.portfolio_url.trim()) ? labels.invalidUrl : '';
  const avatarError = form.avatar_url.trim() && !/^https?:\/\/\S+$/i.test(form.avatar_url.trim()) ? labels.invalidUrl : '';

  useEffect(() => {
    if (!editing || !dirty) return;
    const preventAccidentalExit = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventAccidentalExit);
    return () => window.removeEventListener('beforeunload', preventAccidentalExit);
  }, [dirty, editing]);

  if (!authenticated) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <LockKeyhole className="mx-auto h-10 w-10 text-blue-600" />
        <h2 className="mt-4 text-xl font-black">{copy.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{copy.subtitle}</p>
        <button type="button" onClick={onRequireAuth} className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">
          {lang === 'ru' ? 'Войти' : lang === 'kk' ? 'Кіру' : 'Sign in'}
        </button>
      </section>
    );
  }

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-600" /></div>;
  }

  if (!account || !profile || !settings) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm font-semibold text-red-700">
        {lang === 'ru' ? 'Не удалось загрузить профиль. Обновите страницу и попробуйте снова.' : lang === 'kk' ? 'Профиль жүктелмеді. Бетті жаңартып, қайталап көріңіз.' : 'The profile could not be loaded. Refresh the page and try again.'}
      </div>
    );
  }

  const saveProfile = async () => {
    if (usernameError || portfolioError || avatarError) return;
    setSaving(true); setError(''); setNotice('');
    const update: ProfileUpdateInput = {
      username: form.username.trim(), display_name: nullable(form.display_name), avatar_url: nullable(form.avatar_url),
      university_name: nullable(form.university_name), primary_discipline_id: form.primary_discipline_id || null,
      bio: nullable(form.bio), portfolio_url: nullable(form.portfolio_url), profile_visibility: form.profile_visibility,
      portfolio_visibility: form.portfolio_visibility, available_for_projects: form.available_for_projects,
      skills: form.skills.map((id) => ({ id })), tools: form.tools.map((id) => ({ id })),
      interests: form.interests, languages: form.languages.map((language_code) => ({ language_code })),
    };
    try {
      const refreshed = await saveOwnerProfile(update);
      onAccountChange(refreshed);
      setEditing(false);
      setNotice(labels.profileSaved);
    } catch (reason) {
      setError(errorMessage(reason, lang));
    } finally { setSaving(false); }
  };

  const saveSettings = async (update: Parameters<typeof saveOwnerSettings>[0]) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const refreshed = await saveOwnerSettings(update);
      onAccountChange(refreshed);
      setNotice(lang === 'ru' ? 'Настройки сохранены.' : lang === 'kk' ? 'Баптаулар сақталды.' : 'Settings saved.');
    } catch (reason) { setError(errorMessage(reason, lang)); }
    finally { setSaving(false); }
  };

  const runSearch = async (cursor?: string) => {
    setSearching(true); setError('');
    try {
      const result = await searchProfiles({
        query: filters.query.trim() || undefined, discipline: filters.discipline || undefined,
        skill: filters.skill || undefined, available: filters.available || undefined, cursor, limit: 12,
      });
      setSearchResults((current) => cursor ? [...current, ...result.profiles] : result.profiles);
      setNextCursor(result.next_cursor);
    } catch (reason) { setError(errorMessage(reason, lang)); }
    finally { setSearching(false); }
  };

  const openPublicProfile = async (id: string) => {
    setPublicError('');
    try { setSelectedPublic(await loadPublicProfile(id)); }
    catch (reason) {
      setSelectedPublic(null);
      setPublicError(reason instanceof ApiError && reason.status === 404 ? copy.privateProfile : errorMessage(reason, lang));
    }
  };

  const handleSignOut = async () => {
    if (signOutPending.current) return;
    signOutPending.current = true;
    setSigningOut(true);
    setError('');
    await performProfileSignOut(onSignOut, () => setError(copy.signOutError));
    signOutPending.current = false;
    setSigningOut(false);
  };

  return (
    <section className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-xl font-black text-slate-950">{copy.title}</h1><p className="text-sm text-slate-500">{copy.subtitle}</p></div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button type="button" aria-pressed={mode === 'owner'} onClick={() => setMode('owner')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'owner' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'}`}><UserRound className="mr-1 inline h-4 w-4" />{copy.edit}</button>
          <button type="button" aria-pressed={mode === 'discover'} onClick={() => setMode('discover')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'discover' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'}`}><UsersRound className="mr-1 inline h-4 w-4" />{copy.discover}</button>
        </div>
      </div>

      {(notice || error || taxonomyError || publicError) && (
        <div role={error || taxonomyError || publicError ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error || taxonomyError || publicError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || taxonomyError || publicError || notice}
        </div>
      )}

      {mode === 'owner' ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 border-y border-slate-200 bg-white py-5 sm:px-5">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-blue-700">{labels.identity}</p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ProfileAvatar profile={profile} large />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-black">{profile.display_name || profile.username || 'Engineer'}</h2>
                {profile.username && <p className="text-sm text-slate-500">@{profile.username}</p>}
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700">{account.progress.total_xp} XP</span>
                  <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">Level {account.progress.level}</span>
                  <span className="rounded-lg bg-orange-50 px-2 py-1 text-orange-700"><Flame className="mr-1 inline h-3.5 w-3.5" />{account.progress.streak_days} / {account.progress.longest_streak}</span>
                </div>
              </div>
              <button type="button" onClick={() => {
                if (editing && profile) setForm(profileToForm(profile));
                setEditing((value) => !value);
                setError('');
              }} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{editing ? copy.cancel : copy.editAction}</button>
            </div>

            {editing ? (
              <form onSubmit={(event) => { event.preventDefault(); void saveProfile(); }} className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">{labels.username}
                  <input value={form.username} maxLength={50} aria-invalid={Boolean(usernameError)} aria-describedby={usernameError ? 'profile-username-error' : undefined} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-400" />
                  {usernameError ? <span id="profile-username-error" className="mt-1 block text-[11px] font-semibold text-rose-700">{usernameError}</span> : null}
                </label>
                <label className="text-xs font-bold text-slate-700">{labels.displayName}<input value={form.display_name} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-400" /></label>
                <label className="text-xs font-bold text-slate-700">{labels.avatar}<input type="url" value={form.avatar_url} maxLength={2048} aria-invalid={Boolean(avatarError)} onChange={(event) => setForm((current) => ({ ...current, avatar_url: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-400" />{avatarError ? <span className="mt-1 block text-[11px] font-semibold text-rose-700">{avatarError}</span> : null}</label>
                <label className="text-xs font-bold text-slate-700">{labels.university}<input value={form.university_name} maxLength={200} onChange={(event) => setForm((current) => ({ ...current, university_name: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-400" /></label>
                <label className="text-xs font-bold text-slate-700">{labels.portfolio}<input type="url" value={form.portfolio_url} maxLength={2048} aria-invalid={Boolean(portfolioError)} onChange={(event) => setForm((current) => ({ ...current, portfolio_url: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-400" />{portfolioError ? <span className="mt-1 block text-[11px] font-semibold text-rose-700">{portfolioError}</span> : null}</label>
                <label className="text-xs font-bold text-slate-700">{labels.discipline}
                  <select value={form.primary_discipline_id} onChange={(event) => setForm((current) => ({ ...current, primary_discipline_id: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <option value="">—</option>{taxonomies?.disciplines.map((item) => <option key={item.id} value={item.id}>{taxonomyLabel(item, lang)}</option>)}
                  </select>
                </label>
                <label className="sm:col-span-2 text-xs font-bold text-slate-700">{labels.bio}
                  <textarea value={form.bio} maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-400" />
                  <span className="mt-1 block text-right text-[11px] font-medium text-slate-400">{form.bio.length}/2000</span>
                </label>
                <label className="text-xs font-bold text-slate-700">{labels.visibility}
                  <select value={form.profile_visibility} onChange={(event) => setForm((current) => ({ ...current, profile_visibility: event.target.value as typeof form.profile_visibility }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="public">{labels.public}</option><option value="authenticated">{labels.authenticated}</option><option value="private">{labels.private}</option></select>
                </label>
                <label className="text-xs font-bold text-slate-700">{labels.portfolioVisibility}
                  <select value={form.portfolio_visibility} onChange={(event) => setForm((current) => ({ ...current, portfolio_visibility: event.target.value as typeof form.portfolio_visibility }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="public">{labels.public}</option><option value="authenticated">{labels.authenticated}</option><option value="private">{labels.private}</option></select>
                </label>
                <label className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold"><input type="checkbox" checked={form.available_for_projects} onChange={(event) => setForm((current) => ({ ...current, available_for_projects: event.target.checked }))} className="accent-blue-600" />{labels.available}</label>
                {taxonomies && <>
                  <TaxonomyPicker title={labels.skills} items={taxonomies.skills} selected={form.skills} lang={lang} onChange={(skills) => setForm((current) => ({ ...current, skills }))} />
                  <TaxonomyPicker title={labels.tools} items={taxonomies.tools} selected={form.tools} lang={lang} onChange={(tools) => setForm((current) => ({ ...current, tools }))} />
                  <TaxonomyPicker title={labels.interests} items={taxonomies.interests} selected={form.interests} lang={lang} onChange={(interests) => setForm((current) => ({ ...current, interests }))} />
                  <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">{labels.languages}</legend><div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1">{LANGUAGE_OPTIONS.map((item) => <label key={item.code} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"><input type="checkbox" checked={selectedLanguages.has(item.code)} onChange={(event) => setForm((current) => ({ ...current, languages: event.target.checked ? [...current.languages, item.code] : current.languages.filter((code) => code !== item.code) }))} className="accent-blue-600" />{item.label}</label>)}</div></fieldset>
                </>}
                <div className="sm:col-span-2 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">{dirty ? <span role="status" className="text-xs font-semibold text-amber-700">{labels.unsaved}</span> : <span />}<button type="submit" disabled={saving || Boolean(usernameError || portfolioError || avatarError) || !dirty} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? copy.saving : copy.save}</button></div>
              </form>
            ) : (
              <div className="mt-6 space-y-4">
                {profile.bio ? <p className="text-sm leading-relaxed text-slate-600">{profile.bio}</p> : <p className="text-sm text-slate-400">{lang === 'ru' ? 'Добавьте описание профиля.' : lang === 'kk' ? 'Профиль сипаттамасын қосыңыз.' : 'Add a profile bio.'}</p>}
                <div className="grid gap-3 border-y border-slate-100 py-4 sm:grid-cols-2 text-sm"><div><span className="text-xs font-bold text-slate-400">{labels.university}</span><p className="font-semibold">{profile.university_name || '—'}</p></div><div><span className="text-xs font-bold text-slate-400">{labels.discipline}</span><p className="font-semibold">{profile.primary_discipline ? taxonomyLabel(profile.primary_discipline, lang) : '—'}</p></div></div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${profile.available_for_projects ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{profile.available_for_projects ? labels.available : labels.unavailable}</span>
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{labels.visibility}: {labels[profile.profile_visibility]}</span>
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{labels.portfolioVisibility}: {labels[profile.portfolio_visibility]}</span>
                </div>
                {[
                  [labels.skills, profile.skills], [labels.tools, profile.tools], [labels.interests, profile.interests],
                ].map(([title, items]) => <div key={String(title)}><p className="mb-2 text-xs font-bold text-slate-400">{String(title)}</p><div className="flex flex-wrap gap-2">{(items as TaxonomyItem[]).length > 0 ? (items as TaxonomyItem[]).map((item) => <span key={item.id} className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{taxonomyLabel(item, lang)}</span>) : <span className="text-xs text-slate-400">—</span>}</div></div>)}
                <p className="border-l-2 border-blue-300 pl-3 text-xs leading-relaxed text-slate-500">{labels.learningNote}</p>
                <div><p className="mb-2 text-xs font-bold text-slate-400">{labels.languages}</p><div className="flex flex-wrap gap-2">{profile.languages.length > 0 ? profile.languages.map((item) => <span key={item.language_code} className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{item.language_code.toUpperCase()}</span>) : <span className="text-xs text-slate-400">—</span>}</div></div>
                {profile.portfolio_url && <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">{labels.portfolio} <ExternalLink className="h-3.5 w-3.5" /></a>}
              </div>
            )}
          </div>

          <aside className="h-fit space-y-5">
            <section className="border-y border-slate-200 bg-white py-5 sm:px-5" aria-labelledby="profile-completion-title">
              <h2 id="profile-completion-title" className="text-sm font-black text-slate-900">{labels.completion}</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{labels.editHint}</p>
              <ul className="mt-4 space-y-2">
                {completionSteps.map((step) => <li key={step.id} className={`flex items-start gap-2 text-xs font-semibold ${step.complete ? 'text-emerald-700' : 'text-slate-600'}`}><CheckCircle2 aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${step.complete ? 'text-emerald-600' : 'text-slate-300'}`} /><span>{step.label}</span></li>)}
              </ul>
              {completionSteps.every(({ complete }) => complete) ? <p className="mt-4 text-xs font-semibold text-emerald-700">{labels.completionDone}</p> : <button type="button" onClick={() => setEditing(true)} className="mt-4 text-xs font-bold text-blue-700 underline decoration-blue-200 underline-offset-4">{copy.editAction}</button>}
            </section>
            <section className="border-y border-slate-200 bg-white py-5 sm:px-5" aria-labelledby="private-settings-title">
            <h2 id="private-settings-title" className="flex items-center gap-2 text-sm font-black"><ShieldCheck className="h-4 w-4 text-blue-600" />{copy.settings}</h2>
            <p className="mt-1 text-xs text-slate-500">{lang === 'ru' ? 'Видны только вам.' : lang === 'kk' ? 'Тек сізге көрінеді.' : 'Visible only to you.'}</p>
            <label className="mt-4 block text-xs font-bold text-slate-700">{lang === 'ru' ? 'Предпочитаемый язык' : lang === 'kk' ? 'Қалаулы тіл' : 'Preferred language'}<select value={settings.preferred_lang} disabled={saving} onChange={(event) => saveSettings({ preferred_lang: event.target.value as Language })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></select></label>
            {[
              ['allow_project_invitations', settings.allow_project_invitations, lang === 'ru' ? 'Приглашения в проекты' : lang === 'kk' ? 'Жоба шақырулары' : 'Project invitations'],
              ['allow_direct_messages', settings.allow_direct_messages, lang === 'ru' ? 'Личные сообщения' : lang === 'kk' ? 'Жеке хабарламалар' : 'Direct messages'],
            ].map(([key, checked, label]) => <label key={String(key)} className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700"><span>{String(label)}</span><input type="checkbox" checked={Boolean(checked)} disabled={saving} onChange={(event) => saveSettings({ [String(key)]: event.target.checked })} className="accent-blue-600" /></label>)}
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4" />{lang === 'ru' ? 'Прогресс автоматически сохраняется в вашем аккаунте Engineerus.' : lang === 'kk' ? 'Прогресс Engineerus аккаунтыңызда автоматты түрде сақталады.' : 'Progress is saved automatically to your Engineerus account.'}</div>
            <button
              type="button"
              disabled={signingOut}
              onClick={() => { void handleSignOut(); }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {signingOut ? copy.signingOut : copy.signOut}
            </button>
            </section>
          </aside>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={(event) => { event.preventDefault(); void runSearch(); }} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs md:grid-cols-5">
            <label className="md:col-span-2 text-xs font-bold text-slate-700">{labels.search}<input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder={lang === 'ru' ? 'Имя или username' : lang === 'kk' ? 'Аты немесе username' : 'Name or username'} /></label>
            <label className="text-xs font-bold text-slate-700">{labels.discipline}<select value={filters.discipline} onChange={(event) => setFilters((current) => ({ ...current, discipline: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">{labels.all}</option>{taxonomies?.disciplines.map((item) => <option key={item.id} value={item.id}>{taxonomyLabel(item, lang)}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-700">{labels.skills}<select value={filters.skill} onChange={(event) => setFilters((current) => ({ ...current, skill: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">{labels.all}</option>{taxonomies?.skills.map((item) => <option key={item.id} value={item.id}>{taxonomyLabel(item, lang)}</option>)}</select></label>
            <div className="flex flex-col justify-end gap-2"><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={filters.available} onChange={(event) => setFilters((current) => ({ ...current, available: event.target.checked }))} className="accent-blue-600" />{labels.availableOnly}</label><button type="submit" disabled={searching} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white"><Search className="mr-1 inline h-4 w-4" />{copy.search}</button></div>
          </form>
          {selectedPublic && <div className="rounded-3xl border border-blue-200 bg-blue-50/40 p-5"><button type="button" aria-label={lang === 'ru' ? 'Закрыть профиль' : lang === 'kk' ? 'Профильді жабу' : 'Close profile'} className="float-right rounded-lg p-2 text-xs font-bold text-slate-500 hover:bg-white" onClick={() => setSelectedPublic(null)}>×</button><PublicProfileCard profile={selectedPublic} lang={lang} /></div>}
          {searching && searchResults.length === 0 ? <div className="flex justify-center p-10"><LoaderCircle className="h-6 w-6 animate-spin text-blue-600" /></div> : searchResults.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500"><Sparkles className="mx-auto mb-2 h-6 w-6" />{copy.noResults}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{searchResults.map((result) => <div key={result.id}><PublicProfileCard profile={result} lang={lang} onOpen={openPublicProfile} /></div>)}</div>}
          {nextCursor && <button type="button" disabled={searching} onClick={() => runSearch(nextCursor)} className="mx-auto block rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700">{copy.loadMore}</button>}
        </div>
      )}
    </section>
  );
};
