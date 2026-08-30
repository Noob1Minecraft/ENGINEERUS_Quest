import React, { useRef, useState } from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../data';
import { User, Lock, Mail, ArrowRight, X, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useDialogFocus } from '../hooks/useDialogFocus';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  useDialogFocus({ open: isOpen, onClose, dialogRef, initialFocusRef: emailInputRef });

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
      <div className="eq-dialog-backdrop">
        <div ref={dialogRef} tabIndex={-1} className="eq-dialog eq-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-account-title">
          <button type="button" onClick={onClose} aria-label="Close account" className="eq-dialog__close eq-auth-dialog__close">
            <X className="w-4 h-4" />
          </button>
          <div className="eq-dialog__mark">EQ</div>
          <div>
            <h2 id="auth-account-title" className="eq-auth-dialog__title">Engineerus Quest</h2>
            <p className="text-xs text-slate-500 mt-2">{auth.user.email}</p>
          </div>
          {errorMsg && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-xl">{errorMsg}</div>}
          <button
            type="button"
            onClick={handleLogout}
            disabled={submitting}
            className="eq-button eq-button--secondary eq-dialog__submit"
          >
            <LogOut className="w-4 h-4" />
            {lang === 'kk' ? 'Шығу' : lang === 'en' ? 'Sign out' : 'Выйти'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="eq-dialog-backdrop">
      <div ref={dialogRef} tabIndex={-1} className="eq-dialog eq-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close authentication"
          className="eq-dialog__close eq-auth-dialog__close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="eq-dialog__mark">
            EQ
          </div>
          <h2 id="auth-dialog-title" className="eq-auth-dialog__title">
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
        <div className="eq-auth-tabs">
          <button
            type="button"
            onClick={() => setIsRegister(false)}
            aria-pressed={!isRegister}
          >
            {t.loginBtn}
          </button>
          <button
            type="button"
            onClick={() => setIsRegister(true)}
            aria-pressed={isRegister}
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
                  aria-label={lang === 'kk' ? 'Аты / Никнейм' : lang === 'en' ? 'Name / Username' : 'Имя / Никнейм'}
                  required={isRegister}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Инженер_Алматы"
                  className="eq-auth-input"
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
                ref={emailInputRef}
                type="email"
                aria-label="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@satbayev.kz"
                className="eq-auth-input"
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
                aria-label={lang === 'kk' ? 'Құпия сөз' : lang === 'en' ? 'Password' : 'Пароль'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="eq-auth-input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !auth.configured}
            className="eq-button eq-button--primary eq-dialog__submit"
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
          className="eq-button eq-button--secondary eq-dialog__submit"
        >
          {lang === 'kk' ? 'Google арқылы кіру' : lang === 'en' ? 'Continue with Google' : 'Продолжить с Google'}
        </button>
      </div>
    </div>
  );
};
