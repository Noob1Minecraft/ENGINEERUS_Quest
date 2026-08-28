import React from 'react';
import { Bot, Sparkles } from 'lucide-react';
import type { Language } from '../types';
import { APP_NAVIGATION_GROUPS } from './appNavigation';

type AppSidebarProps = {
  activeTab: string;
  language: Language;
  onSelectTab: (tab: string) => void;
};

export function AppSidebar({ activeTab, language, onSelectTab }: AppSidebarProps) {
  return (
    <aside className="eq-sidebar" aria-label={language === 'ru' ? 'Основная навигация' : language === 'kk' ? 'Негізгі навигация' : 'Primary navigation'}>
      <div className="eq-sidebar__scroll">
        {APP_NAVIGATION_GROUPS.map((group) => (
          <section key={group.id} className="eq-sidebar__group" aria-labelledby={`nav-group-${group.id}`}>
            <h2 id={`nav-group-${group.id}`} className="eq-sidebar__label">{group.labels[language]}</h2>
            <nav className="eq-sidebar__nav">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onSelectTab(item.id)}
                    className={`eq-sidebar__item${active ? ' is-active' : ''}${item.id === 'ai' ? ' is-ai' : ''}`}
                  >
                    <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                    <span>{item.labels[language]}</span>
                  </button>
                );
              })}
            </nav>
          </section>
        ))}
      </div>
      <div className="eq-sidebar__note">
        <span className="eq-sidebar__note-icon"><Bot aria-hidden="true" className="h-4 w-4" /></span>
        <span>
          <strong>{language === 'ru' ? 'Инженерный фокус' : language === 'kk' ? 'Инженерлік бағыт' : 'Engineering focus'}</strong>
          <small>{language === 'ru' ? 'ИИ помогает — решение проверяет инженер.' : language === 'kk' ? 'ЖИ көмектеседі — шешімді инженер тексереді.' : 'AI assists; engineers verify.'}</small>
        </span>
        <Sparkles aria-hidden="true" className="ml-auto h-4 w-4 text-[var(--color-ai)]" />
      </div>
    </aside>
  );
}
