import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  AuthChangeEvent,
  Session,
  Subscription,
  User,
} from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { setApiAccessToken } from "../utils/api";
import type { Language } from "../types";

type AuthSnapshot = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

type AuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
    onAuthStateChange: (
      callback: (event: AuthChangeEvent, session: Session | null) => void,
    ) => { data: { subscription: Subscription } };
  };
};

export async function restoreAuthSession(
  client: AuthClient,
  onSnapshot: (snapshot: AuthSnapshot) => void,
): Promise<() => void> {
  let authEventReceived = false;
  const publishSnapshot = (snapshot: AuthSnapshot) => {
    setApiAccessToken(snapshot.session?.access_token ?? null);
    onSnapshot(snapshot);
  };

  const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
    authEventReceived = true;
    publishSnapshot({ session, user: session?.user ?? null, loading: false });
  });

  const { data, error } = await client.auth.getSession();
  if (error) {
    setApiAccessToken(null);
    listener.subscription.unsubscribe();
    throw error;
  }

  // Do not overwrite a newer auth event that arrived while getSession resolved.
  if (!authEventReceived) {
    publishSnapshot({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    });
  }

  return () => listener.subscription.unsubscribe();
}

type SignUpResult = { requiresEmailConfirmation: boolean };

type AuthOperation = "sign-up" | "sign-in" | "oauth" | "sign-out";

const AUTH_ERROR_COPY = {
  ru: {
    invalidCredentials: "Неверный email или пароль.",
    emailNotConfirmed: "Подтвердите email перед входом.",
    weakPassword: "Пароль недостаточно надёжный. Используйте более сложный пароль.",
    invalidEmail: "Проверьте формат email.",
    emailRateLimit: "Слишком много писем отправлено. Подождите и попробуйте снова.",
    duplicateSignup: "Не удалось создать аккаунт с этими данными. Попробуйте войти или восстановить пароль.",
    generic: "Ошибка авторизации. Проверьте данные и повторите попытку.",
  },
  kk: {
    invalidCredentials: "Email немесе құпия сөз қате.",
    emailNotConfirmed: "Кіру алдында email мекенжайын растаңыз.",
    weakPassword: "Құпия сөз жеткілікті сенімді емес. Күрделірек құпия сөз қолданыңыз.",
    invalidEmail: "Email пішімін тексеріңіз.",
    emailRateLimit: "Тым көп хат жіберілді. Күтіп, қайта көріңіз.",
    duplicateSignup: "Бұл деректермен аккаунт жасау мүмкін болмады. Кіріп немесе құпия сөзді қалпына келтіріп көріңіз.",
    generic: "Авторландыру сәтсіз аяқталды. Деректерді тексеріп, қайталап көріңіз.",
  },
  en: {
    invalidCredentials: "Incorrect email or password.",
    emailNotConfirmed: "Confirm your email before signing in.",
    weakPassword: "That password is not strong enough. Use a stronger password.",
    invalidEmail: "Check the email address format.",
    emailRateLimit: "Too many emails were sent. Wait and try again.",
    duplicateSignup: "An account could not be created with these details. Try signing in or resetting your password.",
    generic: "Authentication failed. Check your details and try again.",
  },
} satisfies Record<Language, Record<string, string>>;

export function authErrorMessage(error: unknown, lang: Language, operation: AuthOperation): string {
  const copy = AUTH_ERROR_COPY[lang];
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

  if (code === "invalid_credentials") return copy.invalidCredentials;
  if (code === "email_not_confirmed") return copy.emailNotConfirmed;
  if (code === "weak_password") return copy.weakPassword;
  if (code === "email_address_invalid") return copy.invalidEmail;
  if (code === "over_email_send_rate_limit") return copy.emailRateLimit;
  if (operation === "sign-up" && (code === "email_exists" || code === "user_already_exists")) {
    return copy.duplicateSignup;
  }
  return copy.generic;
}

type SignOutClient = {
  auth: {
    signOut: () => Promise<{ error: Error | null }>;
  };
};

export async function signOutAuthSession(
  client: SignOutClient,
  onSignedOut: () => void,
): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw error;

  setApiAccessToken(null);
  onSignedOut();
}

type AuthContextValue = AuthSnapshot & {
  configured: boolean;
  signUp: (email: string, password: string, username: string) => Promise<SignUpResult>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase authentication is not configured.");
  }
  return supabase;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({
    session: null,
    user: null,
    loading: isSupabaseConfigured,
  });

  useEffect(() => {
    if (!supabase) {
      setSnapshot({ session: null, user: null, loading: false });
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    restoreAuthSession(supabase, (nextSnapshot) => {
      if (active) setSnapshot(nextSnapshot);
    })
      .then((cleanup) => {
        if (active) unsubscribe = cleanup;
        else cleanup();
      })
      .catch(() => {
        if (active) setSnapshot({ session: null, user: null, loading: false });
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...snapshot,
    configured: isSupabaseConfigured,
    async signUp(email, password, username) {
      const client = requireSupabase();
      const normalizedUsername = username.trim();
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: normalizedUsername,
            display_name: normalizedUsername,
          },
        },
      });
      if (error) throw error;
      return { requiresEmailConfirmation: data.session === null };
    },
    async signInWithPassword(email, password) {
      const client = requireSupabase();
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    },
    async signInWithGoogle() {
      const client = requireSupabase();
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    },
    async signOut() {
      const client = requireSupabase();
      await signOutAuthSession(client, () => {
        setSnapshot({ session: null, user: null, loading: false });
      });
    },
  }), [snapshot]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
