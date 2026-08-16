import React, { useState } from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../data';
import { User, Lock, Mail, ArrowRight, X, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const auth = useAuth();
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Keep every hook above this conditional return so opening and closing the
  // modal cannot change React's hook order.
  if (!isOpen) return null;

  const genericAuthError = lang === 'kk'
    ? 'Авторландыру сәтсіз аяқталды. Деректерді тексеріп, қайталап көріңіз.'
    : lang === 'en'
      ? 'Authentication failed. Check your details and try again.'
      : 'Ошибка авторизации. Проверьте данные и повторите попытку.';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      if (isRegister) {
        const result = await auth.signUp(email, password, username);
        if (result.requiresEmailConfirmation) {
          setInfoMsg(lang === 'kk'
            ? 'Растау сілтемесі email мекенжайыңызға жіберілді.'
            : lang === 'en'
              ? 'Check your email to confirm your account before signing in.'
              : 'Проверьте почту и подтвердите аккаунт перед входом.');
          return;
        }
      } else {
        await auth.signInWithPassword(email, password);
      }
      onClose();
    } catch {
      setErrorMsg(genericAuthError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await auth.signInWithGoogle();
    } catch {
      setErrorMsg(genericAuthError);
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await auth.signOut();
      onClose();
    } catch {
      setErrorMsg(genericAuthError);
    } finally {
      setSubmitting(false);
    }
  };

  if (auth.user) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full border border-slate-200 shadow-2xl relative text-center space-y-5">
          <button onClick={onClose} className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black text-xl flex items-center justify-center mx-auto">EQ</div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Engineerus Quest</h2>
            <p className="text-xs text-slate-500 mt-2">{auth.user.email}</p>
          </div>
          {errorMsg && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-xl">{errorMsg}</div>}
          <button
            type="button"
            onClick={handleLogout}
            disabled={submitting}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 text-xs"
          >
            <LogOut className="w-4 h-4" />
            {lang === 'kk' ? 'Шығу' : lang === 'en' ? 'Sign out' : 'Выйти'}
          </button>
        </div>
      </div>
    );
  }

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

        {infoMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold p-3 rounded-xl mb-4">
            {infoMsg}
          </div>
        )}

        {!auth.configured && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold p-3 rounded-xl mb-4">
            {lang === 'kk' ? 'Supabase Auth жергілікті ортада бапталмаған.' : lang === 'en' ? 'Supabase Auth is not configured in this environment.' : 'Supabase Auth не настроен в этом окружении.'}
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
            disabled={submitting || !auth.configured}
            className="w-full bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-extrabold py-3 rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-xs mt-2"
          >
            <span>{isRegister ? t.registerBtn : t.loginBtn}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="flex items-center gap-3 my-4 text-[10px] font-bold text-slate-400 uppercase">
          <div className="h-px bg-slate-200 flex-1" />
          <span>{lang === 'kk' ? 'немесе' : lang === 'en' ? 'or' : 'или'}</span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={submitting || !auth.configured}
          className="w-full border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-extrabold py-3 rounded-xl text-xs"
        >
          {lang === 'kk' ? 'Google арқылы кіру' : lang === 'en' ? 'Continue with Google' : 'Продолжить с Google'}
        </button>
      </div>
    </div>
  );
};
