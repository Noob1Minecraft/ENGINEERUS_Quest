import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, LogOut, Mail, User, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  canSubmitRecoveryRequest,
  isValidRecoveryEmail,
  MIN_RECOVERY_PASSWORD_LENGTH,
  validateRecoveryPassword,
} from '../auth/passwordRecovery';
import { TRANSLATIONS } from '../data';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Language } from '../types';
import { BrandLogo } from './BrandLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

type AuthView = 'login' | 'register' | 'forgot' | 'request-sent';

const COPY: Record<Language, {
  accountClose: string;
  authClose: string;
  recoveryClose: string;
  authError: string;
  email: string;
  password: string;
  forgotPassword: string;
  resetPassword: string;
  recoveryIntro: string;
  sendRecoveryLink: string;
  recoverySent: string;
  recoveryFailure: string;
  invalidEmail: string;
  recoveryThrottle: string;
  newPassword: string;
  confirmPassword: string;
  passwordTooShort: string;
  passwordMismatch: string;
  invalidRecoveryLink: string;
  passwordUpdated: string;
  passwordUpdateFailure: string;
  verifyingRecovery: string;
  returnToLogin: string;
  continueToAccount: string;
}> = {
  ru: {
    accountClose: 'Закрыть окно аккаунта', authClose: 'Закрыть окно входа', recoveryClose: 'Закрыть восстановление пароля',
    authError: 'Ошибка авторизации. Проверьте данные и повторите попытку.', email: 'Электронная почта', password: 'Пароль',
    forgotPassword: 'Забыли пароль?', resetPassword: 'Восстановление пароля',
    recoveryIntro: 'Укажите адрес аккаунта. Если он зарегистрирован, мы отправим ссылку для смены пароля.',
    sendRecoveryLink: 'Отправить ссылку',
    recoverySent: 'Если аккаунт с таким адресом существует, ссылка для восстановления уже отправлена.',
    recoveryFailure: 'Не удалось отправить запрос. Проверьте соединение и повторите попытку.',
    invalidEmail: 'Введите корректный адрес электронной почты.',
    recoveryThrottle: 'Подождите минуту перед повторным запросом.', newPassword: 'Новый пароль',
    confirmPassword: 'Подтвердите новый пароль',
    passwordTooShort: `Пароль должен содержать не менее ${MIN_RECOVERY_PASSWORD_LENGTH} символов.`,
    passwordMismatch: 'Пароли не совпадают.',
    invalidRecoveryLink: 'Ссылка недействительна или истекла. Запросите новую ссылку восстановления.',
    passwordUpdated: 'Пароль обновлён. Вы можете продолжить работу в аккаунте.',
    passwordUpdateFailure: 'Не удалось обновить пароль. Запросите новую ссылку и повторите попытку.',
    verifyingRecovery: 'Проверяем ссылку восстановления…', returnToLogin: 'Вернуться ко входу',
    continueToAccount: 'Продолжить',
  },
  kk: {
    accountClose: 'Аккаунт терезесін жабу', authClose: 'Кіру терезесін жабу', recoveryClose: 'Құпия сөзді қалпына келтіруді жабу',
    authError: 'Авторландыру сәтсіз аяқталды. Деректерді тексеріп, қайталап көріңіз.', email: 'Электрондық пошта', password: 'Құпия сөз',
    forgotPassword: 'Құпия сөзді ұмыттыңыз ба?', resetPassword: 'Құпия сөзді қалпына келтіру',
    recoveryIntro: 'Аккаунт мекенжайын енгізіңіз. Егер ол тіркелген болса, құпия сөзді өзгерту сілтемесін жібереміз.',
    sendRecoveryLink: 'Қалпына келтіру сілтемесін жіберу',
    recoverySent: 'Егер мұндай мекенжайы бар аккаунт болса, қалпына келтіру сілтемесі жіберілді.',
    recoveryFailure: 'Сұрауды жіберу мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.',
    invalidEmail: 'Дұрыс электрондық пошта мекенжайын енгізіңіз.',
    recoveryThrottle: 'Қайта сұрау алдында бір минут күтіңіз.', newPassword: 'Жаңа құпия сөз',
    confirmPassword: 'Жаңа құпия сөзді растаңыз',
    passwordTooShort: `Құпия сөз кемінде ${MIN_RECOVERY_PASSWORD_LENGTH} таңбадан тұруы керек.`,
    passwordMismatch: 'Құпия сөздер сәйкес келмейді.',
    invalidRecoveryLink: 'Сілтеме жарамсыз немесе мерзімі аяқталған. Жаңа қалпына келтіру сілтемесін сұраңыз.',
    passwordUpdated: 'Құпия сөз жаңартылды. Аккаунтта жұмысты жалғастыра аласыз.',
    passwordUpdateFailure: 'Құпия сөзді жаңарту мүмкін болмады. Жаңа сілтеме сұрап, қайталап көріңіз.',
    verifyingRecovery: 'Қалпына келтіру сілтемесі тексерілуде…', returnToLogin: 'Кіруге оралу',
    continueToAccount: 'Жалғастыру',
  },
  en: {
    accountClose: 'Close account', authClose: 'Close authentication', recoveryClose: 'Close password recovery',
    authError: 'Authentication failed. Check your details and try again.', email: 'Email', password: 'Password',
    forgotPassword: 'Forgot password?', resetPassword: 'Reset password',
    recoveryIntro: 'Enter your account email. If it is registered, we will send a password-reset link.',
    sendRecoveryLink: 'Send recovery link',
    recoverySent: 'If an account exists for that address, a recovery link has been sent.',
    recoveryFailure: 'The request could not be sent. Check your connection and try again.',
    invalidEmail: 'Enter a valid email address.',
    recoveryThrottle: 'Wait one minute before requesting another link.', newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    passwordTooShort: `Use at least ${MIN_RECOVERY_PASSWORD_LENGTH} characters.`, passwordMismatch: 'Passwords do not match.',
    invalidRecoveryLink: 'This recovery link is invalid or expired. Request a new recovery link.',
    passwordUpdated: 'Your password has been updated. You can continue to your account.',
    passwordUpdateFailure: 'The password could not be updated. Request a new link and try again.',
    verifyingRecovery: 'Checking recovery link…', returnToLogin: 'Return to login', continueToAccount: 'Continue',
  },
};

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, lang }) => {
  const t = TRANSLATIONS[lang];
  const copy = COPY[lang];
  const auth = useAuth();
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const recoveryRequestAt = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);
  const recoveryActive = auth.passwordRecoveryStatus !== 'idle';

  const handleClose = async () => {
    if (submitting) return;
    if (recoveryActive) {
      setSubmitting(true);
      try {
        await auth.dismissPasswordRecovery();
      } catch {
        setErrorMsg(copy.authError);
        setSubmitting(false);
        return;
      }
      setNewPassword('');
      setConfirmPassword('');
    }
    onClose();
  };

  useDialogFocus({
    open: isOpen,
    onClose: () => { void handleClose(); },
    dialogRef,
    initialFocusRef: auth.passwordRecoveryStatus === 'ready' ? newPasswordInputRef : emailInputRef,
  });

  // Keep every hook above this conditional return so opening and closing the
  // modal cannot change React's hook order.
  if (!isOpen) return null;

  const clearMessages = () => {
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const selectView = (nextView: AuthView) => {
    clearMessages();
    setPassword('');
    setView(nextView);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    setSubmitting(true);

    try {
      if (view === 'register') {
        const result = await auth.signUp(email, password, username);
        if (result.requiresEmailConfirmation) {
          setInfoMsg(lang === 'kk'
            ? 'Растау сілтемесі электрондық поштаңызға жіберілді.'
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
      setErrorMsg(copy.authError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    if (!isValidRecoveryEmail(email)) {
      setErrorMsg(copy.invalidEmail);
      emailInputRef.current?.focus();
      return;
    }
    const now = Date.now();
    if (!canSubmitRecoveryRequest(recoveryRequestAt.current, now)) {
      setErrorMsg(copy.recoveryThrottle);
      return;
    }

    recoveryRequestAt.current = now;
    setSubmitting(true);
    try {
      await auth.requestPasswordRecovery(email);
      setInfoMsg(copy.recoverySent);
      setView('request-sent');
    } catch {
      setErrorMsg(copy.recoveryFailure);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    const validationError = validateRecoveryPassword(newPassword, confirmPassword);
    if (validationError === 'too_short') {
      setErrorMsg(copy.passwordTooShort);
      newPasswordInputRef.current?.focus();
      return;
    }
    if (validationError === 'mismatch') {
      setErrorMsg(copy.passwordMismatch);
      confirmPasswordInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await auth.updateRecoveredPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setErrorMsg(copy.passwordUpdateFailure);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      await auth.signInWithGoogle();
    } catch {
      setErrorMsg(copy.authError);
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
      setErrorMsg(copy.authError);
    } finally {
      setSubmitting(false);
    }
  };

  const statusMessage = errorMsg || infoMsg;
  const statusClassName = errorMsg ? 'eq-alert eq-alert--error' : 'eq-alert eq-alert--success';

  if (recoveryActive) {
    return (
      <div className="eq-dialog-backdrop">
        <div ref={dialogRef} tabIndex={-1} className="eq-dialog eq-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-dialog-title">
          <button type="button" onClick={() => { void handleClose(); }} disabled={submitting} aria-label={copy.recoveryClose} className="eq-dialog__close eq-auth-dialog__close"><X className="w-4 h-4" /></button>
          <BrandLogo decorative eager className="eq-auth-dialog__logo" />
          <h2 id="recovery-dialog-title" className="eq-auth-dialog__title">{copy.resetPassword}</h2>

          {auth.passwordRecoveryStatus === 'verifying' && <p className="eq-auth-dialog__copy" aria-live="polite">{copy.verifyingRecovery}</p>}
          {auth.passwordRecoveryStatus === 'invalid' && <>
            <div className="eq-alert eq-alert--error" role="alert">{copy.invalidRecoveryLink}</div>
            <button type="button" className="eq-button eq-button--secondary eq-dialog__submit" onClick={() => { void handleClose(); }} disabled={submitting}><ArrowLeft className="w-4 h-4" /> {copy.returnToLogin}</button>
          </>}
          {auth.passwordRecoveryStatus === 'ready' && <form onSubmit={handlePasswordUpdate} className="eq-auth-recovery-form" noValidate>
            {errorMsg && <div id="recovery-password-error" className={statusClassName} role="alert">{errorMsg}</div>}
            <label className="eq-form-field"><span>{copy.newPassword}</span><input ref={newPasswordInputRef} type="password" autoComplete="new-password" required minLength={MIN_RECOVERY_PASSWORD_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-describedby={errorMsg ? 'recovery-password-error' : undefined} /></label>
            <label className="eq-form-field"><span>{copy.confirmPassword}</span><input ref={confirmPasswordInputRef} type="password" autoComplete="new-password" required minLength={MIN_RECOVERY_PASSWORD_LENGTH} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-describedby={errorMsg ? 'recovery-password-error' : undefined} /></label>
            <button type="submit" disabled={submitting} className="eq-button eq-button--primary eq-dialog__submit">{submitting ? copy.verifyingRecovery : copy.resetPassword}</button>
          </form>}
          {auth.passwordRecoveryStatus === 'updated' && <>
            <div className="eq-alert eq-alert--success" role="status" aria-live="polite">{copy.passwordUpdated}</div>
            <button type="button" className="eq-button eq-button--primary eq-dialog__submit" onClick={() => { void handleClose(); }}>{copy.continueToAccount} <ArrowRight className="w-4 h-4" /></button>
          </>}
        </div>
      </div>
    );
  }

  if (auth.user) {
    return (
      <div className="eq-dialog-backdrop">
        <div ref={dialogRef} tabIndex={-1} className="eq-dialog eq-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-account-title">
          <button type="button" onClick={() => { void handleClose(); }} aria-label={copy.accountClose} className="eq-dialog__close eq-auth-dialog__close"><X className="w-4 h-4" /></button>
          <BrandLogo decorative eager className="eq-auth-dialog__logo" />
          <div><h2 id="auth-account-title" className="eq-auth-dialog__title">Engineerus Quest</h2><p className="text-xs text-slate-500 mt-2">{auth.user.email}</p></div>
          {errorMsg && <div className="eq-alert eq-alert--error" role="alert">{errorMsg}</div>}
          <button type="button" onClick={handleLogout} disabled={submitting} className="eq-button eq-button--secondary eq-dialog__submit"><LogOut className="w-4 h-4" /> {lang === 'kk' ? 'Шығу' : lang === 'en' ? 'Sign out' : 'Выйти'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="eq-dialog-backdrop">
      <div ref={dialogRef} tabIndex={-1} className="eq-dialog eq-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
        <button type="button" onClick={() => { void handleClose(); }} aria-label={copy.authClose} className="eq-dialog__close eq-auth-dialog__close"><X className="w-4 h-4" /></button>
        <div className="text-center space-y-2 mb-6">
          <BrandLogo decorative eager className="eq-auth-dialog__logo" />
          <h2 id="auth-dialog-title" className="eq-auth-dialog__title">{view === 'forgot' || view === 'request-sent' ? copy.resetPassword : 'Engineerus Quest'}</h2>
          <p className="eq-auth-dialog__copy">{view === 'forgot' || view === 'request-sent' ? copy.recoveryIntro : view === 'register' ? lang === 'kk' ? 'Инженер аккаунтын жасаңыз' : lang === 'en' ? 'Create engineer account' : 'Создай аккаунт инженера' : lang === 'kk' ? 'Профильіңізге кіріңіз' : lang === 'en' ? 'Log in to your profile' : 'Войди в свой профиль'}</p>
        </div>

        {(view === 'login' || view === 'register') && <div className="eq-auth-tabs">
          <button type="button" onClick={() => selectView('login')} aria-pressed={view === 'login'}>{t.loginBtn}</button>
          <button type="button" onClick={() => selectView('register')} aria-pressed={view === 'register'}>{t.registerBtn}</button>
        </div>}

        {statusMessage && <div id="auth-status" className={statusClassName} role={errorMsg ? 'alert' : 'status'} aria-live="polite">{statusMessage}</div>}
        {!auth.configured && <div className="eq-alert eq-alert--error">{lang === 'kk' ? 'Supabase Auth жергілікті ортада бапталмаған.' : lang === 'en' ? 'Supabase Auth is not configured in this environment.' : 'Supabase Auth не настроен в этом окружении.'}</div>}

        {view === 'forgot' || view === 'request-sent' ? <>
          {view === 'forgot' && <form onSubmit={handleRecoveryRequest} className="eq-auth-recovery-form">
            <label className="eq-form-field"><span>{copy.email}</span><input ref={emailInputRef} type="email" autoComplete="email" aria-label={copy.email} required value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={statusMessage ? 'auth-status' : undefined} /></label>
            <button type="submit" disabled={submitting || !auth.configured} className="eq-button eq-button--primary eq-dialog__submit"><Mail className="w-4 h-4" /> {copy.sendRecoveryLink}</button>
          </form>}
          <button type="button" className="eq-auth-link eq-auth-link--back" onClick={() => selectView('login')}><ArrowLeft className="w-4 h-4" /> {copy.returnToLogin}</button>
        </> : <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {view === 'register' && <label className="eq-form-field"><span>{lang === 'kk' ? 'Аты / Никнейм' : lang === 'en' ? 'Name / Username' : 'Имя / Никнейм'}</span><span className="eq-auth-input-wrap"><User aria-hidden="true" /><input type="text" required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></span></label>}
            <label className="eq-form-field"><span>{copy.email}</span><span className="eq-auth-input-wrap"><Mail aria-hidden="true" /><input ref={emailInputRef} type="email" aria-label={copy.email} required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></span></label>
            <label className="eq-form-field"><span className="eq-auth-field-heading"><span>{copy.password}</span>{view === 'login' && <button type="button" className="eq-auth-link" onClick={() => selectView('forgot')}>{copy.forgotPassword}</button>}</span><span className="eq-auth-input-wrap"><Lock aria-hidden="true" /><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={view === 'register' ? 'new-password' : 'current-password'} /></span></label>
            <button type="submit" disabled={submitting || !auth.configured} className="eq-button eq-button--primary eq-dialog__submit"><span>{view === 'register' ? t.registerBtn : t.loginBtn}</span><ArrowRight className="w-3.5 h-3.5" /></button>
          </form>
          <div className="flex items-center gap-3 my-4 text-[10px] font-bold text-slate-400 uppercase"><div className="h-px bg-slate-200 flex-1" /><span>{lang === 'kk' ? 'немесе' : lang === 'en' ? 'or' : 'или'}</span><div className="h-px bg-slate-200 flex-1" /></div>
          <button type="button" onClick={handleGoogleSignIn} disabled={submitting || !auth.configured} className="eq-button eq-button--secondary eq-dialog__submit">{lang === 'kk' ? 'Google арқылы кіру' : lang === 'en' ? 'Continue with Google' : 'Продолжить с Google'}</button>
        </>}
      </div>
    </div>
  );
};
