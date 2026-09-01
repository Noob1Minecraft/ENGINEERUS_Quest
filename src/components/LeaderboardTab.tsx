import React from 'react';
import { UserProfile, Language } from '../types';
import { TRANSLATIONS } from '../data';
import { Trophy, Flame } from 'lucide-react';

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
    <section className="eq-legacy-page eq-leaderboard eq-ranking-register" aria-labelledby="leaderboard-title">
      <header className="eq-legacy-page__header eq-leaderboard__header">
          <div>
            <span className="eq-legacy-page__eyebrow"><Trophy aria-hidden="true" />{t.topEngineers}</span>
            <h2 id="leaderboard-title" className="eq-legacy-page__title">
              {t.leaderboardTitle}
            </h2>
            <p className="eq-legacy-page__description">
              {t.leaderboardDesc}
            </p>
          </div>

          <div className="eq-leaderboard__position">
            <span>{t.yourPosition}</span>
            <strong>#7</strong>
            <small>{t.inKazakhstan} · {user.xp} XP · Lvl {user.level}</small>
          </div>
      </header>

      <div className="eq-leaderboard__columns" aria-hidden="true">
        <span>{lang === 'kk' ? 'ОРЫН' : lang === 'en' ? 'RANK' : 'МЕСТО'}</span>
        <span>{lang === 'kk' ? 'ИНЖЕНЕР' : lang === 'en' ? 'ENGINEER' : 'ИНЖЕНЕР'}</span>
        <span>XP</span>
      </div>
      <div className="eq-leaderboard__list" role="list">
          {LEADERBOARD_USERS.map((entry) => {
            const isGold = entry.rank === 1;

            return (
              <div
                key={entry.rank}
                role="listitem"
                className={`eq-leaderboard-row${isGold ? ' is-leading' : ''}`}
              >
                <span className="eq-leaderboard-row__rank">{String(entry.rank).padStart(2, '0')}</span>

                <div className="eq-leaderboard-row__identity">
                  <div><strong>{entry.name}</strong>{isGold && <span>{t.champion}</span>}</div>
                  <p>{t.levelLabel} {entry.level} · <Flame aria-hidden="true" /> {entry.streak} {t.streakLabel}</p>
                </div>
                <div className="eq-leaderboard-row__score">
                  <strong>{entry.xp}</strong><span>XP</span>
                </div>
              </div>
            );
          })}

          <div role="listitem" className="eq-leaderboard-row is-current">
            <span className="eq-leaderboard-row__rank">07</span>
            <div className="eq-leaderboard-row__identity">
              <div><strong>{user.username} ({t.you})</strong><span>{t.yourAccount}</span></div>
              <p>{t.levelLabel} {user.level} · <Flame aria-hidden="true" /> {user.streak} {t.streakLabel}</p>
            </div>
            <div className="eq-leaderboard-row__score"><strong>{user.xp}</strong><span>XP</span></div>
          </div>
      </div>
    </section>
  );
};
