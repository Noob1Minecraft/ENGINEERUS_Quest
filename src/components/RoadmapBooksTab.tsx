import React, { useState } from 'react';
import { Language } from '../types';
import { BOOKS, TRANSLATIONS } from '../data';
import { ArrowUpRight, BookOpen, CheckCircle2 } from 'lucide-react';
import { EmptyState } from './ui';

interface RoadmapBooksTabProps { lang: Language; }

const LANG_FILTERS = ['all', 'ru', 'en', 'kz'] as const;
const CATEGORY_FILTERS = ['all', 'mechanical', 'electrical', 'robotics'] as const;

export const RoadmapBooksTab: React.FC<RoadmapBooksTabProps> = ({ lang }) => {
  const t = TRANSLATIONS[lang];
  const [selectedLangFilter, setSelectedLangFilter] = useState<(typeof LANG_FILTERS)[number]>('all');
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORY_FILTERS)[number]>('all');
  const steps = [
    [t.step1Title, t.step1Desc], [t.step2Title, t.step2Desc], [t.step3Title, t.step3Desc],
    [t.step4Title, t.step4Desc], [t.step5Title, t.step5Desc],
  ];
  const categoryLabels = {
    all: lang === 'kk' ? 'Барлық пәндер' : lang === 'en' ? 'All disciplines' : 'Все дисциплины',
    mechanical: 'Mechanical & Sopromat', electrical: 'Electrical & ТОЭ', robotics: 'Robotics & AI',
  };
  const filteredBooks = BOOKS.filter((book) =>
    (selectedLangFilter === 'all' || book.lang === selectedLangFilter)
    && (selectedCategory === 'all' || book.category === selectedCategory));

  return <div className="eq-legacy-page eq-learning">
    <section className="eq-learning__roadmap" aria-labelledby="roadmap-title">
      <header className="eq-legacy-page__header"><div>
        <span className="eq-legacy-page__eyebrow">LEARNING PATH / 05 STEPS</span>
        <h2 id="roadmap-title" className="eq-legacy-page__title">{t.roadmapTitle}</h2>
        <p className="eq-legacy-page__description">{lang === 'kk'
          ? 'Инженерлік дағдыларды негізден қолданбалы жұмысқа дейін ретімен дамытыңыз.'
          : lang === 'en' ? 'Build engineering skills in sequence, from foundations to applied work.'
            : 'Развивайте инженерные навыки последовательно: от основ к прикладной работе.'}</p>
      </div></header>
      <ol className="eq-roadmap-list">{steps.map(([title, description], index) =>
        <li className="eq-roadmap-step" key={title}>
          <span className="eq-roadmap-step__number">{String(index + 1).padStart(2, '0')}</span>
          <div><h3>{title}</h3><p>{description}</p></div>
        </li>)}</ol>
    </section>

    <section className="eq-learning__library" aria-labelledby="library-title">
      <header className="eq-learning__library-header">
        <div>
          <span className="eq-legacy-page__eyebrow">REFERENCE SHELF / VERIFIED LINKS</span>
          <h2 id="library-title" className="eq-legacy-page__title"><BookOpen aria-hidden="true" />{t.libraryTitle}</h2>
          <p className="eq-legacy-page__description">{lang === 'kk'
            ? 'Негізгі инженерлік пәндерге арналған тексерілген оқу материалдары.'
            : lang === 'en' ? 'Reviewed learning resources for core engineering disciplines.'
              : 'Проверенные учебные материалы по базовым инженерным дисциплинам.'}</p>
        </div>
        <div className="eq-filter-tabs" aria-label={lang === 'kk' ? 'Тіл сүзгісі' : lang === 'en' ? 'Language filter' : 'Фильтр языка'}>
          {LANG_FILTERS.map((filter) => <button key={filter} type="button" aria-pressed={selectedLangFilter === filter}
            onClick={() => setSelectedLangFilter(filter)}>{filter === 'all' ? t.filterAll : filter.toUpperCase()}</button>)}
        </div>
      </header>
      <div className="eq-filter-actions" aria-label={lang === 'kk' ? 'Пән сүзгісі' : lang === 'en' ? 'Discipline filter' : 'Фильтр дисциплины'}>
        {CATEGORY_FILTERS.map((filter) => <button key={filter} type="button" aria-pressed={selectedCategory === filter}
          onClick={() => setSelectedCategory(filter)}>{categoryLabels[filter]}</button>)}
      </div>

      {filteredBooks.length === 0 ? <EmptyState
        title={lang === 'kk' ? 'Материалдар табылмады' : lang === 'en' ? 'No resources found' : 'Материалы не найдены'}
        description={lang === 'kk' ? 'Басқа тіл немесе пән сүзгісін таңдаңыз.' : lang === 'en' ? 'Try another language or discipline filter.' : 'Выберите другой язык или дисциплину.'}
      /> : <div className="eq-resource-list">{filteredBooks.map((book) =>
        <article className="eq-resource-row" key={book.id}>
          <div className="eq-resource-row__identity">
            <p className="eq-resource-row__meta">{book.category} / {book.lang.toUpperCase()}</p>
            <h3>{book.title}</h3>
            <p className="eq-resource-row__byline">{lang === 'kk' ? 'Авторы' : lang === 'en' ? 'Author' : 'Автор'}: {book.author} · {book.pages} {lang === 'kk' ? 'бет' : lang === 'en' ? 'pages' : 'стр.'}</p>
            <p className="eq-resource-row__description">{book.description}</p>
          </div>
          <div className="eq-resource-row__source">
            <span><CheckCircle2 aria-hidden="true" />{lang === 'kk' ? 'Сыртқы дереккөз' : lang === 'en' ? 'External source' : 'Внешний источник'}</span>
            <a href={book.sourceUrl} target="_blank" rel="noopener noreferrer">{lang === 'kk' ? 'Дереккөзді ашу' : lang === 'en' ? 'View source' : 'Открыть источник'}<ArrowUpRight aria-hidden="true" /></a>
          </div>
        </article>)}</div>}
    </section>
  </div>;
};
