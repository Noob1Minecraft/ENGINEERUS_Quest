import React from 'react';
import { UserProfile, Language } from '../types';
import { TRANSLATIONS } from '../data';
import { Trophy, Award, Flame, Star, Sparkles } from 'lucide-react';

interface LeaderboardTabProps {
  user: UserProfile;
  lang: Language;
}

const LEADERBOARD_USERS = [
  { rank: 1, name: 'Арман Сериков (Satbayev Univ)', xp: 1450, level: 15, streak: 18, university: 'Satbayev' },
  { rank: 2, name: 'Алина Киимбаева (AUES)', xp: 1220, level: 13, streak: 14, university: 'AUES' },
  { rank: 3, name: 'Данияр Касымов (Nazarbayev Univ)', xp: 980, level: 10, streak: 9, university: 'NU' },
  { rank: 4, name: 'Темирлан Беков (KazNU)', xp: 750, level: 8, streak: 7, university: 'KazNU' },
  { rank: 5, name: 'Аружан Муратова (ENU)', xp: 620, level: 7, streak: 5, university: 'ENU' },
  { rank: 6, name: 'Санжар Ибраев (KBTU)', xp: 510, level: 6, streak: 4, university: 'KBTU' },
];

export const LeaderboardTab: React.FC<LeaderboardTabProps> = ({ user, lang }) => {
  const t = TRANSLATIONS[lang];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="bg-gradient-to-br from-slate-50 via-slate-100/40 to-blue-50/25 text-slate-800 rounded-2xl p-5 sm:p-6 md:p-8 shadow-xs relative overflow-hidden border border-slate-200/50">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold mb-3">
              <Trophy className="w-3.5 h-3.5 text-amber-500" /> {t.topEngineers}
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
              {t.leaderboardTitle}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-md leading-relaxed">
              {t.leaderboardDesc}
            </p>
          </div>

          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 text-center shrink-0 min-w-[200px] shadow-xs">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t.yourPosition}
            </div>
            <div className="text-2xl font-extrabold text-blue-600 my-1">
              #7 <span className="text-xs font-bold text-slate-400">{t.inKazakhstan}</span>
            </div>
            <div className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200/50 px-3 py-1 rounded-full inline-block">
              {user.xp} XP • Lvl {user.level}
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs overflow-hidden">
        <div className="divide-y divide-slate-100">
          {LEADERBOARD_USERS.map((entry) => {
            const isGold = entry.rank === 1;
            const isSilver = entry.rank === 2;
            const isBronze = entry.rank === 3;

            return (
              <div
                key={entry.rank}
                className={`p-4 sm:p-5 flex items-center justify-between gap-4 transition-colors ${
                  isGold ? 'bg-amber-50/10' : 'hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  {/* Rank Badge */}
                  <div
                    className={`w-9.5 h-9.5 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      isGold
                        ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                        : isSilver
                        ? 'bg-slate-100 text-slate-700 border border-slate-200/30'
                        : isBronze
                        ? 'bg-amber-50/50 text-amber-800/80 border border-amber-200/30'
                        : 'bg-slate-50 text-slate-500 border border-slate-100'
                    }`}
                  >
                    {isGold ? <Trophy className="w-4 h-4 text-amber-500" /> : `#${entry.rank}`}
                  </div>

                  <div>
                    <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <span>{entry.name}</span>
                      {isGold && (
                        <span className="bg-amber-50 text-amber-800 text-[9px] font-bold px-1.5 py-0.2 rounded-md border border-amber-200/40">
                          {t.champion}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-medium flex items-center gap-3 mt-0.5">
                      <span>{t.levelLabel} {entry.level}</span>
                      <span className="flex items-center gap-1 text-orange-500 font-bold">
                        <Flame className="w-3 h-3" /> {entry.streak} {t.streakLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm sm:text-base font-extrabold text-slate-800">
                    {entry.xp} <span className="text-xs font-bold text-amber-600">XP</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Current User Row */}
          <div className="p-4 sm:p-5 flex items-center justify-between gap-4 bg-blue-50/20 border-t border-blue-100">
            <div className="flex items-center gap-3.5">
              <div className="w-9.5 h-9.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/60 flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                #7
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>{user.username} ({t.you})</span>
                  <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md">
                    {t.yourAccount}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium flex items-center gap-3 mt-0.5">
                  <span>{t.levelLabel} {user.level}</span>
                  <span className="flex items-center gap-1 text-orange-500 font-bold">
                    <Flame className="w-3 h-3" /> {user.streak} {t.streakLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-sm sm:text-base font-extrabold text-blue-700">
                {user.xp} <span className="text-xs font-bold text-blue-500">XP</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
