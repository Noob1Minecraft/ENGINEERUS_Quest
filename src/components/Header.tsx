import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Flame, Globe, MessageSquareText, User, Zap } from 'lucide-react';
import type { Language, UserProfile } from '../types';
import { TRANSLATIONS } from '../data';
import { verifySystemIntegrity } from '../utils/integrity';
import { getNavigationLabel } from './appNavigation';

interface HeaderProps {
  user: UserProfile;
  lang: Language;
  onSetLang: (lang: Language) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenProfile: () => void;
  authenticated: boolean;
  onOpenFeedback: () => void;
}
const LANGUAGE_LABELS: Record<Language, string> = { en: 'English', ru: 'Русский', kk: 'Қазақша' };

export const Header: React.FC<HeaderProps> = ({ user, lang, onSetLang, activeTab, onSelectTab, onOpenProfile, authenticated, onOpenFeedback }) => {
  const t = TRANSLATIONS[lang];
  const [langOpen, setLangOpen] = useState(false);
  const languageMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    verifySystemIntegrity(t.attributionCaption);
  }, [lang, t]);

  useEffect(() => {
    if (!langOpen) return;
    const close = (event: MouseEvent) => {
      if (!languageMenu.current?.contains(event.target as Node)) setLangOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLangOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [langOpen]);

  return (
    <header className="eq-header">
      <div className="eq-header__inner">
        <button type="button" className="eq-brand" onClick={() => onSelectTab('home')} aria-label={t.logoTitle}>
          <span className="eq-brand__mark" aria-hidden="true">EQ</span>
          <span className="eq-brand__copy"><strong>ENGINEERUS <em>Quest</em></strong><small>Engineering workspace</small></span>
        </button>

        <div className="eq-header__page" aria-live="polite"><span>{getNavigationLabel(activeTab, lang)}</span></div>

        <div className="eq-header__actions">
          {authenticated && (
            <div className="eq-header__progress" aria-label={lang === 'ru' ? 'Прогресс аккаунта' : lang === 'kk' ? 'Аккаунт прогресі' : 'Account progress'}>
              <span title={`${user.xp} XP`}><Zap aria-hidden="true" />{user.xp}<small>XP</small></span>
              <span title={`${user.streak} ${t.daysUnit}`}><Flame aria-hidden="true" />{user.streak}<small>{t.daysUnit}</small></span>
            </div>
          )}

          {authenticated && (
            <button type="button" onClick={onOpenFeedback} aria-label={lang === 'ru' ? 'Отправить бета-отзыв' : lang === 'kk' ? 'Бета-пікір жіберу' : 'Send beta feedback'} className="eq-icon-button eq-header__feedback">
              <MessageSquareText aria-hidden="true" />
            </button>
          )}

          <div className="eq-language" ref={languageMenu}>
            <button type="button" onClick={() => setLangOpen((open) => !open)} aria-expanded={langOpen} aria-haspopup="menu" aria-label={`${LANGUAGE_LABELS[lang]}. ${lang === 'ru' ? 'Изменить язык' : lang === 'kk' ? 'Тілді өзгерту' : 'Change language'}`} className="eq-language__trigger">
              <Globe aria-hidden="true" /><span>{lang.toUpperCase()}</span><ChevronDown aria-hidden="true" />
            </button>
            {langOpen && (
              <div className="eq-language__menu" role="menu" aria-label={lang === 'ru' ? 'Язык интерфейса' : lang === 'kk' ? 'Интерфейс тілі' : 'Interface language'}>
                {(['ru', 'kk', 'en'] as Language[]).map((language) => (
                  <button key={language} type="button" role="menuitemradio" aria-checked={lang === language} onClick={() => { onSetLang(language); setLangOpen(false); }} className={lang === language ? 'is-active' : ''}>
                    <span>{LANGUAGE_LABELS[language]}</span><small>{language.toUpperCase()}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={onOpenProfile} aria-label={lang === 'ru' ? 'Открыть профиль' : lang === 'kk' ? 'Профильді ашу' : 'Open profile'} className="eq-profile-button">
            <span className="eq-profile-button__avatar"><User aria-hidden="true" /></span>
            <span className="eq-profile-button__name">{user.username.split('_')[0]}</span>
            <strong>Lv{user.level}</strong>
          </button>
        </div>
      </div>
    </header>
  );
};
