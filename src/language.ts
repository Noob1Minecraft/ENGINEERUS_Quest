import type { Language } from './types';

export const SUPPORTED_LANGUAGES = ['ru', 'kk', 'en'] as const satisfies readonly Language[];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);

type LocationParts = Pick<Location, 'pathname' | 'search' | 'hash'>;
type HistoryWriter = Pick<History, 'state' | 'replaceState'>;

function isSupportedLanguage(value: string | null): value is Language {
  return value !== null && SUPPORTED_LANGUAGE_SET.has(value);
}

export function resolveStoredLanguage(value: string | null): Language {
  return isSupportedLanguage(value) ? value : 'ru';
}

export function resolveInitialLanguage(search: string, storedValue: string | null): Language {
  const urlLanguage = new URLSearchParams(search).get('lang');
  return isSupportedLanguage(urlLanguage) ? urlLanguage : resolveStoredLanguage(storedValue);
}

export function syncManualLanguageToUrl(
  language: Language,
  location: LocationParts = window.location,
  history: HistoryWriter = window.history,
): void {
  const params = new URLSearchParams(location.search);
  if (!params.has('lang')) return;

  params.set('lang', language);
  const query = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

export function buildUrlForPath(pathname: string, location: LocationParts = window.location): string {
  return `${pathname}${location.search}${location.hash}`;
}

export function syncDocumentLanguage(language: Language, root: { lang: string } = document.documentElement): void {
  root.lang = language;
}
