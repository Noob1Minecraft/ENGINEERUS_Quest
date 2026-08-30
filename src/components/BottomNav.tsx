import React, { useRef, useState } from 'react';
import { BriefcaseBusiness, LayoutGrid, Menu, MessageCircle, Sparkles, X } from 'lucide-react';
import type { Language } from '../types';
import { APP_NAVIGATION_ITEMS, getNavigationItem } from './appNavigation';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface BottomNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  lang: Language;
}

const PRIMARY_IDS = ['home', 'ai', 'projects', 'messages'] as const;
const PRIMARY_ICONS = { home: LayoutGrid, ai: Sparkles, projects: BriefcaseBusiness, messages: MessageCircle };
const MORE_IDS = APP_NAVIGATION_ITEMS.map((item) => item.id).filter((id) => !PRIMARY_IDS.includes(id as typeof PRIMARY_IDS[number]));

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab, lang }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const moreActive = MORE_IDS.includes(activeTab);
  const moreLabel = lang === 'ru' ? 'Ещё' : lang === 'kk' ? 'Тағы' : 'More';

  useDialogFocus({ open: moreOpen, onClose: () => setMoreOpen(false), dialogRef, initialFocusRef: closeButton });

  const select = (id: string) => {
    onSelectTab(id);
    setMoreOpen(false);
  };

  return (
    <>
      {moreOpen && (
        <div className="eq-mobile-menu" id="mobile-more-navigation">
          <button type="button" className="eq-mobile-menu__backdrop" onClick={() => setMoreOpen(false)} aria-label={lang === 'ru' ? 'Закрыть меню' : lang === 'kk' ? 'Мәзірді жабу' : 'Close menu'} />
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title" className="eq-mobile-menu__sheet">
            <div className="eq-mobile-menu__header">
              <div><small>Engineerus Quest</small><h2 id="mobile-menu-title">{lang === 'ru' ? 'Все разделы' : lang === 'kk' ? 'Барлық бөлімдер' : 'All areas'}</h2></div>
              <button ref={closeButton} type="button" className="eq-icon-button" onClick={() => setMoreOpen(false)} aria-label={lang === 'ru' ? 'Закрыть' : lang === 'kk' ? 'Жабу' : 'Close'}><X aria-hidden="true" /></button>
            </div>
            <nav className="eq-mobile-menu__grid" aria-label={lang === 'ru' ? 'Дополнительная навигация' : lang === 'kk' ? 'Қосымша навигация' : 'More navigation'}>
              {MORE_IDS.map((id) => {
                const item = getNavigationItem(id)!;
                const Icon = item.icon;
                const active = activeTab === id;
                return <button key={id} type="button" aria-current={active ? 'page' : undefined} onClick={() => select(id)} className={active ? 'is-active' : ''}><Icon aria-hidden="true" /><span>{item.labels[lang]}</span></button>;
              })}
            </nav>
          </section>
        </div>
      )}

      <nav className="eq-bottom-nav" aria-label={lang === 'ru' ? 'Мобильная навигация' : lang === 'kk' ? 'Мобильді навигация' : 'Mobile navigation'}>
        {PRIMARY_IDS.map((id) => {
          const item = getNavigationItem(id)!;
          const Icon = PRIMARY_ICONS[id];
          const active = activeTab === id;
          return <button key={id} type="button" aria-current={active ? 'page' : undefined} onClick={() => select(id)} className={active ? 'is-active' : ''}><Icon aria-hidden="true" /><span>{item.labels[lang]}</span></button>;
        })}
        <button ref={moreButton} type="button" aria-expanded={moreOpen} aria-controls="mobile-more-navigation" onClick={() => setMoreOpen((open) => !open)} className={moreActive || moreOpen ? 'is-active' : ''}>
          <Menu aria-hidden="true" /><span>{moreLabel}</span>
        </button>
      </nav>
    </>
  );
};
