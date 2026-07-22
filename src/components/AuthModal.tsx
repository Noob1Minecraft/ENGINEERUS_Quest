import React, { useState } from 'react';
import { UserProfile, Language } from '../types';
import { TRANSLATIONS } from '../data';
import { User, Lock, Mail, ArrowRight, X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onLoginSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  lang,
  onLoginSuccess,
}) => {
  if (!isOpen) return null;

  const t = TRANSLATIONS[lang];
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const endpoint = isRegister ? '/api/auth/web/register' : '/api/auth/web/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        onLoginSuccess(data.user);
        onClose();
      } else {
        setErrorMsg(data.detail || (lang === 'kk' ? 'Авторландыру қатесі.' : lang === 'en' ? 'Authorization error.' : 'Ошибка авторизации.'));
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(lang === 'kk' ? 'Серверге қосылу мүмкін болмады.' : lang === 'en' ? 'Could not connect to the server.' : 'Не удалось подключиться к серверу.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full border border-slate-200 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center mx-auto shadow-md shadow-blue-500/20">
            EQ
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Engineerus Quest
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {isRegister
              ? lang === 'kk'
                ? 'Инженер аккаунтын жасаңыз'
                : lang === 'en'
                ? 'Create engineer account'
                : 'Создай аккаунт инженера'
              : lang === 'kk'
              ? 'Профильіңізге кіріңіз'
              : lang === 'en'
              ? 'Log in to your profile'
              : 'Войди в свой профиль'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl mb-6">
          <button
            onClick={() => setIsRegister(false)}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              !isRegister ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t.loginBtn}
          </button>
          <button
            onClick={() => setIsRegister(true)}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              isRegister ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
            }`}
          >
            {t.registerBtn}
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-xl mb-4">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {lang === 'kk' ? 'Аты / Никнейм' : lang === 'en' ? 'Name / Username' : 'Имя / Никнейм'}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required={isRegister}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Инженер_Алматы"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none text-xs font-medium text-slate-900"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@satbayev.kz"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none text-xs font-medium text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {lang === 'kk' ? 'Құпия сөз' : lang === 'en' ? 'Password' : 'Пароль'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none text-xs font-medium text-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold py-3 rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-xs mt-2"
          >
            <span>{isRegister ? t.registerBtn : t.loginBtn}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
