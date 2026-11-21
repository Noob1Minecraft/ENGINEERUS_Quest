import type { Language } from './types';

const SUPPORTED_LANGUAGES = new Set<Language>(['ru', 'kk', 'en']);

export function resolveStoredLanguage(value: string | null): Language {
  return value && SUPPORTED_LANGUAGES.has(value as Language) ? value as Language : 'ru';
}

export function syncDocumentLanguage(language: Language, root: { lang: string } = document.documentElement): void {
  root.lang = language;
}
