import React, { useState } from 'react';
import { Language, Book } from '../types';
import { BOOKS, TRANSLATIONS } from '../data';
import { BookOpen, CheckCircle2, ArrowRight, Layers, FileText, Globe } from 'lucide-react';

interface RoadmapBooksTabProps {
  lang: Language;
}

export const RoadmapBooksTab: React.FC<RoadmapBooksTabProps> = ({ lang }) => {
  const t = TRANSLATIONS[lang];
  const [selectedLangFilter, setSelectedLangFilter] = useState<'all' | 'ru' | 'en' | 'kz'>('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'mechanical' | 'electrical' | 'robotics'>('all');

  const filteredBooks = BOOKS.filter((book) => {
    const matchesLang = selectedLangFilter === 'all' || book.lang === selectedLangFilter;
    const matchesCat = selectedCategory === 'all' || book.category === selectedCategory;
    return matchesLang && matchesCat;
  });

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* 5 Steps Engineering Roadmap */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/60 shadow-xs space-y-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            {t.roadmapTitle}
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {lang === 'kk'
              ? 'Қазақстан нарығы үшін білікті инженерлерді дайындаудың кезең-кезеңімен әдістемесі.'
              : lang === 'en'
              ? 'Step-by-step methodology for training qualified engineers for Kazakhstan.'
              : 'Пошаговая методология подготовки квалифицированных инженеров для рынка Казахстана.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 sm:gap-4 relative">
          {/* Step 1 */}
          <div className="bg-slate-50/60 border border-slate-200/50 hover:border-slate-350 p-4.5 rounded-xl transition-all relative">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center mb-3">
              01
            </div>
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              {t.step1Title}
            </h3>
            <p className="text-xs text-slate-400 font-medium leading-normal">
              {t.step1Desc}
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-slate-50/60 border border-slate-200/50 hover:border-slate-350 p-4.5 rounded-xl transition-all relative">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center mb-3">
              02
            </div>
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              {t.step2Title}
            </h3>
            <p className="text-xs text-slate-400 font-medium leading-normal">
              {t.step2Desc}
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-slate-50/60 border border-slate-200/50 hover:border-slate-350 p-4.5 rounded-xl transition-all relative">
            <div className="w-8 h-8 rounded-lg bg-purple-600 text-white font-bold text-xs flex items-center justify-center mb-3">
              03
            </div>
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              {t.step3Title}
            </h3>
            <p className="text-xs text-slate-400 font-medium leading-normal">
              {t.step3Desc}
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-slate-50/60 border border-slate-200/50 hover:border-slate-350 p-4.5 rounded-xl transition-all relative">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center mb-3">
              04
            </div>
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              {t.step4Title}
            </h3>
            <p className="text-xs text-slate-400 font-medium leading-normal">
              {t.step4Desc}
            </p>
          </div>

          {/* Step 5 */}
          <div className="bg-slate-50/60 border border-slate-200/50 hover:border-slate-350 p-4.5 rounded-xl transition-all relative">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white font-bold text-xs flex items-center justify-center mb-3">
              05
            </div>
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              {t.step5Title}
            </h3>
            <p className="text-xs text-slate-400 font-medium leading-normal">
              {t.step5Desc}
            </p>
          </div>
        </div>
      </div>

      {/* Engineering Textbooks Library */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/60 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <BookOpen className="w-5.5 h-5.5 text-blue-600" />
              {t.libraryTitle}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {lang === 'kk'
                ? 'Материалдар кедергісі, Электротехника және Робототехника бойынша тексерілген оқулықтар.'
                : lang === 'en'
                ? 'Verified academic textbooks on Strength of Materials, Electrical Engineering, and Robotics.'
                : 'Проверенные академические учебники по Сопромату, Электротехнике и Робототехнике.'}
            </p>
          </div>

          {/* Language Filters */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setSelectedLangFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedLangFilter === 'all'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.filterAll}
            </button>
            <button
              onClick={() => setSelectedLangFilter('ru')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedLangFilter === 'ru'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              RU
            </button>
            <button
              onClick={() => setSelectedLangFilter('en')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedLangFilter === 'en'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setSelectedLangFilter('kz')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedLangFilter === 'kz'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              KZ
            </button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200/80 hover:text-slate-900 hover:border-slate-350'
            }`}
          >
            {lang === 'kk' ? 'Барлық пәндер' : lang === 'en' ? 'All Disciplines' : 'Все дисциплины'}
          </button>
          <button
            onClick={() => setSelectedCategory('mechanical')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              selectedCategory === 'mechanical'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200/80 hover:text-slate-900 hover:border-slate-350'
            }`}
          >
            Mechanical & Sopromat
          </button>
          <button
            onClick={() => setSelectedCategory('electrical')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              selectedCategory === 'electrical'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200/80 hover:text-slate-900 hover:border-slate-350'
            }`}
          >
            Electrical & ТОЭ
          </button>
          <button
            onClick={() => setSelectedCategory('robotics')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              selectedCategory === 'robotics'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200/80 hover:text-slate-900 hover:border-slate-350'
            }`}
          >
            Robotics & AI
          </button>
        </div>

        {/* Books Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredBooks.map((book) => (
            <div
              key={book.id}
              className="bg-slate-50/40 border border-slate-200/60 hover:border-slate-300 p-4.5 rounded-xl transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-100/50 px-2 py-0.5 rounded">
                    {book.category}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase">
                    {book.lang}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-2">
                  {book.title}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  {lang === 'kk' ? 'Авторы' : lang === 'en' ? 'Author' : 'Автор'}: {book.author} • {book.pages} {lang === 'kk' ? 'бет' : lang === 'en' ? 'pages' : 'стр.'}
                </p>
                <p className="text-xs text-slate-500 font-normal mt-2.5 line-clamp-3 leading-relaxed">
                  {book.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/40 flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {lang === 'kk' ? 'Онлайн қолжетімді' : lang === 'en' ? 'Available online' : 'Доступно онлайн'}
                </span>
                <span className="text-xs font-bold text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  {lang === 'kk' ? 'Оқу' : lang === 'en' ? 'Read' : 'Читать'} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
